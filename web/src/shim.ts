/**
 * Web Shim —— 浏览器模式下替代 Electron preload 的 window.marchDesktop。
 *
 * 在非 Electron 环境（浏览器/Pi PWA）中，window.marchDesktop 为 undefined。
 * 本 shim 注入一个将所有调用路由到 Python FastAPI 后端的适配层。
 * 原版前端代码完全不改——仍然调 window.marchDesktop.xxx()，由 shim 翻译成 HTTP。
 *
 * 窗口操作（最小化/关闭/拖拽/缩放等）→ 空操作（浏览器无窗口控制）。
 * AI / Companion / App → HTTP fetch 到 /api/v1/*。
 * TTS → 暂为 stub（Phase 3 接 CosyVoice 后补全）。
 * Campaign / Demo → stub（已从 UI 移除，仅保留类型兼容）。
 */

// ---- HTTP helper ----
async function api<T = unknown>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const put = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined });
const del = <T = unknown>(path: string) =>
  api<T>(path, { method: "DELETE" });

// ---- Mock window status (browser has no real window) ----
const mockDesktopStatus = {
  bounds: { x: 0, y: 0, width: 430, height: 660 },
  petScale: 1,
  petDefaultScale: 1,
  petMaxScale: 3,
  pinned: true,
  trayAvailable: false,
  clickThrough: false,
  snapEnabled: true,
};

// ---- 轮询 companion data 变化 ----
let companionPollTimer: ReturnType<typeof setInterval> | null = null;
let lastCompanionSnapshot: unknown = null;

function startCompanionPoll(callback: (data: unknown) => void) {
  if (companionPollTimer) clearInterval(companionPollTimer);
  companionPollTimer = setInterval(async () => {
    try {
      const data = await api("/api/v1/companion/snapshot");
      if (JSON.stringify(data) !== JSON.stringify(lastCompanionSnapshot)) {
        lastCompanionSnapshot = data;
        callback(data);
      }
    } catch {
      /* 忽略轮询错误 */
    }
  }, 3000);
}

// ---- 安装 shim ----
export function installWebShim() {
  if (window.marchDesktop) return; // Electron 环境，不需要 shim

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;

  w.marchDesktop = {
    // ===== 窗口操作 → 空操作 =====
    minimize: () => {},
    close: () => {},
    togglePin: async () => false,
    getWindowPosition: async () => [0, 0] as [number, number],
    moveWindowTo: () => {},
    endWindowMove: async () => ({ ...mockDesktopStatus }),
    getDesktopStatus: async () => ({ ...mockDesktopStatus }),
    setSnapEnabled: async () => ({ ...mockDesktopStatus }),
    setMode: async () => ({ ...mockDesktopStatus }),
    setPetScale: async () => ({ ...mockDesktopStatus }),
    setPetDefaultScale: async () => ({ ...mockDesktopStatus }),
    show: async () => ({ ...mockDesktopStatus }),
    showContextMenu: () => {},
    onNavigate: () => {},
    clearNavigateListener: () => {},

    // ===== companion data 变化监听 → 轮询 =====
    onCompanionDataChange: (callback: (data: unknown) => void) => {
      startCompanionPoll(callback);
    },
    clearCompanionDataChangeListener: () => {
      if (companionPollTimer) {
        clearInterval(companionPollTimer);
        companionPollTimer = null;
      }
    },

    // ===== AI =====
    ai: {
      getSettings: () => api("/api/v1/control/settings"),
      saveSettings: (input: unknown) => put("/api/v1/control/settings", input),
      clearApiKey: async () => api("/api/v1/control/settings"), // 乐观返回
      testConnection: () => post("/api/v1/control/providers/deepseek/test"),
      chat: (req: { messages: unknown[] }) => post("/api/v1/chat", req),
    },

    // ===== Companion =====
    companion: {
      getData: () => api("/api/v1/companion/snapshot"),
      getSkillProfile: async () => {
        // 从 shared 目录读取（构建时打包）
        const res = await fetch("./march7th-skill-profile.json");
        return res.ok ? res.json() : {};
      },
      completeOnboarding: (input: unknown) =>
        post("/api/v1/companion/onboarding", input),
      savePreferences: (input: unknown) =>
        put("/api/v1/companion/profile", input),
      setPaused: (paused: boolean) =>
        put("/api/v1/companion/profile", { paused }),
      exit: async () => {
        await del("/api/v1/companion/data");
        return api("/api/v1/companion/snapshot");
      },
      deleteRelationshipData: async () => {
        await del("/api/v1/companion/data");
        return api("/api/v1/companion/snapshot");
      },
      resetDemo: async () => api("/api/v1/companion/snapshot"),
      // 记忆
      setMemoryReusable: (memoryId: string, reusable: boolean) =>
        patch(`/api/v1/memories/${memoryId}`, { reusable }),
      setMemoryEnabled: async () => api("/api/v1/companion/snapshot"),
      deleteMemory: async (memoryId: string) => {
        await del(`/api/v1/memories/${memoryId}`);
        return api("/api/v1/companion/snapshot");
      },
      clearMemories: async () => api("/api/v1/companion/snapshot"),
      createPhotoMemory: () => post("/api/v1/memories", { type: "photo" }),
      exportMemories: async () => ({ ok: false, canceled: true }),
      exportData: async () => {
        const data = await api("/api/v1/companion/export");
        // 触发下载
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "companion-data.json";
        a.click();
        URL.revokeObjectURL(url);
        return { ok: true, filePath: "companion-data.json" };
      },
      // 通信
      markMessageRead: (messageId: string) =>
        patch(`/api/v1/communications/${messageId}`, { read: true }),
      setMessageFavorite: (messageId: string, favorite: boolean) =>
        patch(`/api/v1/communications/${messageId}`, { favorite }),
      setMessageLiked: (messageId: string, liked: boolean) =>
        patch(`/api/v1/communications/${messageId}`, { liked }),
      setMessageRemindLater: (messageId: string, remindLater: boolean) =>
        patch(`/api/v1/communications/${messageId}`, { remindLater }),
      respondToMessage: (messageId: string, response: string) =>
        patch(`/api/v1/communications/${messageId}`, { response }),
      getContactPolicyStatus: async () => ({
        canContact: false,
        reason: "web",
      }),
      // 以下为已移除的发行/Demo 功能——stub 保持类型兼容
      queueEvent: async () => api("/api/v1/companion/snapshot"),
      evaluateEvent: async () => api("/api/v1/companion/snapshot"),
      registerIgnoredContact: async () => api("/api/v1/companion/snapshot"),
      registerPlayerInteraction: async () => api("/api/v1/companion/snapshot"),
      createCampaign: async () => api("/api/v1/companion/snapshot"),
      updateCampaign: async () => api("/api/v1/companion/snapshot"),
      submitCampaignReview: async () => api("/api/v1/companion/snapshot"),
      reviewCampaign: async () => api("/api/v1/companion/snapshot"),
      setCampaignLifecycle: async () => api("/api/v1/companion/snapshot"),
      generateCampaignMessage: async () => api("/api/v1/companion/snapshot"),
      runMessageAutomaticReview: async () => api("/api/v1/companion/snapshot"),
      reviewCampaignMessage: async () => api("/api/v1/companion/snapshot"),
      deliverCampaignMessage: async () => api("/api/v1/companion/snapshot"),
      getDemoScenarios: async () => [],
      loadDemoScenario: async () => api("/api/v1/companion/snapshot"),
      advanceDemoTime: async () => api("/api/v1/companion/snapshot"),
      triggerDemoAction: async () => api("/api/v1/companion/snapshot"),
    },

    // ===== TTS → stub（Phase 3 后补全） =====
    tts: {
      getSettings: async () => ({
        enabled: false,
        hasApiKey: false,
        voiceRightsConfirmed: false,
        autoPlay: false,
        volume: 0.86,
        rate: 1.0,
        keySource: "none",
        secureStorageAvailable: false,
      }),
      saveSettings: async (input: { enabled?: boolean }) => input,
      clearApiKey: async () => ({}),
      test: async () => ({ ok: false, error: "TTS 未迁移" }),
      synthesize: async () => ({ ok: false, error: "TTS 未迁移" }),
      startStream: async () => ({ ok: false, requestId: "" }),
      cancelStream: async () => true,
      onStreamEvent: () => {},
      clearStreamEventListener: () => {},
    },

    // ===== Service =====
    service: {
      getUsageStatus: async () => ({ providers: {} }),
    },

    // ===== App settings（角色选择等） =====
    app: {
      getSettings: async () => ({ characterId: "march7th" }),
      saveSettings: async (input: { characterId?: string }) => input,
    },
  };
}

// ---- PATCH helper ----
async function patch<T = unknown>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}
