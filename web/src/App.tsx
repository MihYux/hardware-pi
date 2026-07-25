import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  BookOpenText,
  Briefcase,
  Camera,
  ChatCircleDots,
  EnvelopeSimple,
  GearSix,
  LinkSimple,
  PaperPlaneTilt,
  SlidersHorizontal,
  SpeakerSlash,
  Sparkle,
} from "@phosphor-icons/react";
import {
  adminToken,
  createMemory,
  deviceToken,
  fetchCompanionSnapshot,
  fetchControlSettings,
  fetchHistory,
  fetchServiceInfo,
  saveControlSettings,
  saveTokens,
  sendChat,
  testProvider,
} from "./api";
import {
  CommunicationsPage,
  MemoriesPage,
  Onboarding,
  RelationshipPage,
} from "./CompanionData";
import type {
  ChatMessage,
  CompanionSnapshot,
  ControlSettings,
  Expression,
  ProviderView,
} from "./types";

type PanelTab =
  | "chat"
  | "memories"
  | "communications"
  | "relationship"
  | "control";

const expressionCopy: Record<Expression, string> = {
  bright: "元气满满",
  soft: "认真陪伴",
  proud: "小小得意",
  curious: "好奇中",
};

const idleLines = [
  "哎呀，你来得正好。今天还没一起拍过照呢！",
  "手机也能变成咱的新窗口，感觉还挺奇妙的嘛。",
  "开拓者，要不要一起记下一点今天的事？",
  "本姑娘一直都在，想聊天的时候叫咱就好啦。",
];

const welcome: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: idleLines[0],
  provider: "local",
};

export default function App() {
  const [mode, setMode] = useState<"pet" | "panel">("pet");
  const [panelTab, setPanelTab] = useState<PanelTab>("chat");
  const [bubbleChatOpen, setBubbleChatOpen] = useState(false);
  const [device, setDevice] = useState(deviceToken());
  const [activeDevice, setActiveDevice] = useState(deviceToken());
  const [admin, setAdmin] = useState(adminToken());
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [expression, setExpression] = useState<Expression>("bright");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [connection, setConnection] = useState<
    "ready" | "offline" | "unauthorized"
  >(device ? "offline" : "unauthorized");
  const [notice, setNotice] = useState("");
  const [workbenchPort, setWorkbenchPort] = useState(3000);
  const messageEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchServiceInfo()
      .then((service) => setWorkbenchPort(service.modules.workbench.port))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!deviceToken()) return;
    void Promise.all([fetchHistory(), fetchCompanionSnapshot()])
      .then(([history, companion]) => {
        if (history.length) setMessages(history);
        setSnapshot(companion);
        setConnection("ready");
      })
      .catch(() => {
        setSnapshot(null);
        setConnection("unauthorized");
      });
  }, [activeDevice]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const currentBubble =
    [...messages].reverse().find((message) => message.role === "assistant")
      ?.content ?? idleLines[0];
  const statusText = useMemo(() => {
    if (connection === "unauthorized") return "等待连接 Pi";
    if (connection === "offline") return "正在连接";
    if (snapshot?.profile.paused) return "同行已暂停";
    if (snapshot?.counts.unread_communications) {
      return `${snapshot.counts.unread_communications} 封新通信`;
    }
    return "陪伴中";
  }, [connection, snapshot]);

  function openPairing() {
    (
      document.getElementById("pairing") as HTMLDialogElement | null
    )?.showModal();
  }

  function persistTokens() {
    saveTokens(device, admin);
    setActiveDevice(device.trim());
    setConnection(device.trim() ? "offline" : "unauthorized");
    setNotice("访问令牌已保存在当前浏览器");
  }

  function openPanel(tab: PanelTab) {
    setPanelTab(tab);
    setMode("panel");
  }

  function openWorkbench() {
    const url = new URL(window.location.href);
    url.port = String(workbenchPort);
    url.pathname = "/brief";
    url.search = "";
    url.hash = "";
    window.location.assign(url);
  }

  async function refreshCompanion() {
    const next = await fetchCompanionSnapshot();
    setSnapshot(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy || !deviceToken()) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    setMessages((items) => [...items, userMessage]);
    setDraft("");
    setBusy(true);
    setNotice("");
    try {
      const response = await sendChat(message, messages);
      setMessages((items) => [
        ...items,
        {
          id: response.message_id,
          role: "assistant",
          content: response.text,
          provider: `${response.provider} · ${response.model}`,
        },
      ]);
      setExpression(response.expression);
      setConnection("ready");
      if (response.fallback) {
        setNotice("当前使用本地回复；可在设置中配置模型");
      }
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function surpriseMe() {
    const line = idleLines[Math.floor(Math.random() * idleLines.length)];
    setMessages((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: line,
        provider: "local",
      },
    ]);
    setExpression(line.includes("本姑娘") ? "proud" : "bright");
  }

  async function takePhoto() {
    if (!snapshot?.profile.onboarding_completed || photoBusy) return;
    setPhotoBusy(true);
    setNotice("");
    try {
      const now = new Date();
      await createMemory({
        type: "photo",
        title: `共同照片 · ${now.toLocaleDateString("zh-CN")}`,
        summary: "通过 Hardware Pi 保存了一次明确确认的共同拍照记忆。",
        reusable_by_character: true,
        user_confirmed: true,
      });
      await refreshCompanion();
      setMessages((items) => [
        ...items,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "拍好啦！这张照片已经收进共同相册，之后也可以随时关闭引用或删除。",
          provider: "local",
        },
      ]);
      setExpression("bright");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  const navItems: Array<{
    tab: PanelTab;
    label: string;
    icon: typeof ChatCircleDots;
    badge?: number;
  }> = [
    { tab: "chat", label: "聊天", icon: ChatCircleDots },
    { tab: "memories", label: "相册", icon: BookOpenText },
    {
      tab: "communications",
      label: "通信",
      icon: EnvelopeSimple,
      badge: snapshot?.counts.unread_communications,
    },
    { tab: "relationship", label: "同行", icon: SlidersHorizontal },
    { tab: "control", label: "设置", icon: GearSix },
  ];

  return (
    <main
      className={`march-shell mode-${mode} expression-${expression}`}
      aria-label="三月七网页伙伴"
    >
      {mode === "pet" ? (
        <>
          <nav className="pet-controls" aria-label="网页控制">
            <button
              className="icon-button"
              aria-label="打开 ReHoYo 工作台"
              title="打开 ReHoYo 工作台"
              onClick={openWorkbench}
            >
              <Briefcase weight="fill" />
            </button>
            <button
              className="icon-button"
              aria-label="连接设置"
              title="连接设置"
              onClick={openPairing}
            >
              <LinkSimple weight="bold" />
            </button>
            <button
              className="icon-button"
              aria-label="设置"
              title="设置"
              onClick={() => openPanel("control")}
            >
              <GearSix />
            </button>
          </nav>

          <section className="speech-area" aria-live="polite">
            <div className={`speech-bubble mood-${expression}`}>
              <div className="bubble-meta">
                <span>三月七</span>
                <div className="bubble-actions">
                  <span className="mood-chip">
                    <Sparkle weight="fill" />
                    {expressionCopy[expression]}
                  </span>
                  <span className="status-pill">{statusText}</span>
                  <button
                    className={`bubble-chat-toggle ${
                      bubbleChatOpen ? "active" : ""
                    }`}
                    aria-label="在气泡中对话"
                    onClick={() => setBubbleChatOpen((value) => !value)}
                  >
                    <ChatCircleDots weight="fill" />
                    对话
                  </button>
                </div>
              </div>
              <p>{busy ? "等等，咱认真想想……" : currentBubble}</p>
              {bubbleChatOpen ? (
                <form className="bubble-chat-form" onSubmit={submit}>
                  <input
                    value={draft}
                    maxLength={120}
                    placeholder={
                      deviceToken() ? "和三月七说点什么……" : "请先连接 Orange Pi"
                    }
                    disabled={!deviceToken() || busy}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button disabled={!draft.trim() || busy || !deviceToken()}>
                    <PaperPlaneTilt weight="fill" />
                  </button>
                </form>
              ) : null}
            </div>
          </section>

          <section className="pet-stage">
            <button
              className="character-button"
              aria-label="和三月七打招呼"
              onClick={surpriseMe}
            >
              <img
                src="/assets/march7th-pet.png"
                alt="手持相机、挥手打招呼的三月七 Q 版桌宠"
                draggable={false}
              />
            </button>
          </section>

          <nav className="quick-actions" aria-label="桌宠功能">
            <button onClick={() => void takePhoto()} disabled={!snapshot || photoBusy}>
              <Camera weight="fill" />
              {photoBusy ? "保存中" : "拍照"}
            </button>
            <button onClick={() => openPanel("memories")}>
              <BookOpenText weight="fill" />
              相册
            </button>
            <button onClick={() => openPanel("communications")}>
              <EnvelopeSimple weight="fill" />
              通信
              {snapshot?.counts.unread_communications ? (
                <span className="quick-action-badge">
                  {snapshot.counts.unread_communications}
                </span>
              ) : null}
            </button>
          </nav>
        </>
      ) : (
        <section className="main-panel" aria-label="主面板">
          <nav className="panel-controls" aria-label="面板控制">
            <button
              className="icon-button"
              aria-label="返回桌宠"
              title="返回桌宠"
              onClick={() => setMode("pet")}
            >
              <ArrowLeft weight="bold" />
            </button>
            <button
              className="icon-button"
              aria-label="连接设置"
              title="连接设置"
              onClick={openPairing}
            >
              <LinkSimple weight="bold" />
            </button>
          </nav>

          <nav className="main-nav" aria-label="功能导航">
            <div className="nav-group">
              <button className="nav-row" onClick={openWorkbench}>
                <span className="nav-icon">
                  <Briefcase weight="fill" />
                </span>
                <span className="nav-label">工作台</span>
              </button>
            </div>
            <div className="nav-group">
              <button className="nav-row" disabled title="语音将在下一阶段迁移">
                <span className="nav-icon">
                  <SpeakerSlash />
                </span>
                <span className="nav-label">语音</span>
                <span className="phase-label">后续</span>
              </button>
            </div>
            <div className="nav-group">
              <button
                className="nav-row"
                onClick={() => void takePhoto()}
                disabled={!snapshot?.profile.onboarding_completed || photoBusy}
              >
                <span className="nav-icon">
                  <Camera weight="fill" />
                </span>
                <span className="nav-label">{photoBusy ? "保存中" : "拍照"}</span>
              </button>
            </div>
            <div className="nav-group">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    className={`nav-row ${panelTab === item.tab ? "active" : ""}`}
                    key={item.tab}
                    onClick={() => setPanelTab(item.tab)}
                    disabled={
                      item.tab !== "control" &&
                      !snapshot?.profile.onboarding_completed
                    }
                  >
                    <span className="nav-icon">
                      <Icon weight={panelTab === item.tab ? "fill" : "regular"} />
                    </span>
                    <span className="nav-label">{item.label}</span>
                    {item.badge ? (
                      <span className="nav-badge">{item.badge}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="nav-pet-slot">
              <button
                className="nav-character"
                aria-label="和三月七打招呼"
                onClick={surpriseMe}
              >
                <img src="/assets/march7th-pet.png" alt="三月七" />
              </button>
            </div>
          </nav>

          <section className="main-content">
            {panelTab === "chat" ? (
              <ChatPanel
                messages={messages}
                draft={draft}
                busy={busy}
                notice={notice}
                connected={Boolean(deviceToken())}
                messageEnd={messageEnd}
                onDraft={setDraft}
                onSubmit={submit}
              />
            ) : panelTab === "memories" && snapshot ? (
              <MemoriesPage snapshot={snapshot} onRefresh={refreshCompanion} />
            ) : panelTab === "communications" && snapshot ? (
              <CommunicationsPage
                snapshot={snapshot}
                onRefresh={refreshCompanion}
              />
            ) : panelTab === "relationship" && snapshot ? (
              <RelationshipPage
                snapshot={snapshot}
                onRefresh={refreshCompanion}
                onDeleted={(next) => {
                  setSnapshot(next);
                  setMode("pet");
                }}
              />
            ) : (
              <ControlPanel
                adminTokenValue={admin}
                onNeedPairing={openPairing}
              />
            )}
          </section>
        </section>
      )}

      {snapshot && !snapshot.profile.onboarding_completed ? (
        <Onboarding
          onComplete={(next) => {
            setSnapshot(next);
            setMode("pet");
            setMessages([welcome]);
          }}
        />
      ) : null}

      {notice && mode === "pet" ? (
        <div className="pet-notice">{notice}</div>
      ) : null}

      <dialog id="pairing" className="pairing-dialog">
        <form method="dialog">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">LOCAL PAIRING</span>
              <h2>连接 Orange Pi</h2>
            </div>
            <button className="dialog-close" aria-label="关闭">×</button>
          </div>
          <label>
            <span>设备令牌</span>
            <input
              type="password"
              value={device}
              onChange={(event) => setDevice(event.target.value)}
              placeholder="HARDWARE_PI_DEVICE_TOKEN"
            />
          </label>
          <label>
            <span>管理令牌</span>
            <input
              type="password"
              value={admin}
              onChange={(event) => setAdmin(event.target.value)}
              placeholder="HARDWARE_PI_ADMIN_TOKEN"
            />
          </label>
          <p>令牌只保存在当前浏览器；模型 API Key 始终留在 Pi。</p>
          <button className="primary-action" onClick={persistTokens}>
            保存并连接
          </button>
        </form>
      </dialog>
    </main>
  );
}

function ChatPanel({
  messages,
  draft,
  busy,
  notice,
  connected,
  messageEnd,
  onDraft,
  onSubmit,
}: {
  messages: ChatMessage[];
  draft: string;
  busy: boolean;
  notice: string;
  connected: boolean;
  messageEnd: React.RefObject<HTMLDivElement | null>;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <section className="chat-panel embedded" aria-label="聊天">
      <header className="panel-section-header">
        <div>
          <span className="eyebrow">LOCAL COMPANION CHANNEL</span>
          <h2>聊天</h2>
        </div>
        <span className={`connection-chip ${connected ? "online" : ""}`}>
          {connected ? "PI 已连接" : "等待连接"}
        </span>
      </header>
      <div className="message-list">
        {messages.map((message) => (
          <div
            className={`message ${message.role === "assistant" ? "march" : "you"}`}
            key={message.id}
          >
            {message.content}
            {message.provider ? <small>{message.provider}</small> : null}
          </div>
        ))}
        {busy ? <div className="message march">等等，咱认真想想……</div> : null}
        <div ref={messageEnd} />
      </div>
      <form className="chat-form" onSubmit={onSubmit}>
        <input
          value={draft}
          maxLength={120}
          placeholder={connected ? "和三月七说点什么……" : "先完成 Orange Pi 配对"}
          disabled={!connected || busy}
          onChange={(event) => onDraft(event.target.value)}
        />
        <button disabled={!draft.trim() || busy || !connected}>
          <PaperPlaneTilt weight="fill" />
        </button>
      </form>
      <p className="local-note">
        {notice || "模型不可用时会自动切换为本地回复"}
      </p>
    </section>
  );
}

function ControlPanel({
  adminTokenValue,
  onNeedPairing,
}: {
  adminTokenValue: string;
  onNeedPairing: () => void;
}) {
  const [settings, setSettings] = useState<ControlSettings | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, ProviderView & { api_key: string }>
  >({});
  const [routing, setRouting] =
    useState<ControlSettings["routing"] | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!adminTokenValue) return;
    setBusy("load");
    void fetchControlSettings()
      .then((next) => {
        setSettings(next);
        setRouting(next.routing);
        setDrafts(
          Object.fromEntries(
            (["deepseek", "zhipu", "cosyvoice"] as const).map((name) => [
              name,
              { ...next[name], api_key: "" },
            ]),
          ),
        );
      })
      .catch((error) => setNotice((error as Error).message))
      .finally(() => setBusy(""));
  }, [adminTokenValue]);

  function updateProvider(
    name: string,
    patch: Partial<ProviderView & { api_key: string }>,
  ) {
    setDrafts((current) => ({
      ...current,
      [name]: { ...current[name], ...patch },
    }));
  }

  async function save() {
    if (!routing) return;
    setBusy("save");
    setNotice("");
    try {
      const providers = Object.fromEntries(
        Object.entries(drafts).map(([name, provider]) => [
          name,
          {
            enabled: provider.enabled,
            base_url: provider.base_url,
            model: provider.model,
            ...(provider.api_key.trim()
              ? { api_key: provider.api_key.trim() }
              : {}),
          },
        ]),
      );
      const next = await saveControlSettings({ providers, routing });
      setSettings(next);
      setRouting(next.routing);
      setDrafts(
        Object.fromEntries(
          (["deepseek", "zhipu", "cosyvoice"] as const).map((name) => [
            name,
            { ...next[name], api_key: "" },
          ]),
        ),
      );
      setNotice("统一 API 配置已写入 Orange Pi");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function test(name: "deepseek" | "zhipu") {
    setBusy(`test-${name}`);
    setNotice("");
    try {
      const result = await testProvider(name);
      setNotice(`${name} 连接成功 · ${result.model} · ${result.latency_ms}ms`);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!adminTokenValue) {
    return (
      <section className="settings-panel embedded settings-empty">
        <GearSix weight="duotone" />
        <span className="eyebrow">PI CONTROL PLANE</span>
        <h2>设置</h2>
        <p>填写管理令牌后，可以统一管理模型配置。</p>
        <button className="primary-action" onClick={onNeedPairing}>
          连接 Orange Pi
        </button>
      </section>
    );
  }

  if (!settings || !routing) {
    return (
      <section className="settings-panel embedded settings-empty">
        <span className="eyebrow">PI CONTROL PLANE</span>
        <h2>{busy ? "正在读取设置…" : "无法读取设置"}</h2>
        {notice ? <p>{notice}</p> : null}
      </section>
    );
  }

  return (
    <section className="settings-panel embedded pi-control-panel">
      <header className="panel-section-header">
        <div>
          <span className="eyebrow">PI CONTROL PLANE</span>
          <h2>设置</h2>
          <p>DeepSeek、智谱 GLM 与 CosyVoice 统一由 Orange Pi 管理。</p>
        </div>
        <button className="primary-action" disabled={Boolean(busy)} onClick={save}>
          {busy === "save" ? "保存中…" : "保存全部"}
        </button>
      </header>

      {notice ? <div className="panel-notice">{notice}</div> : null}

      <div className="provider-grid">
        {(["deepseek", "zhipu", "cosyvoice"] as const).map((name) => {
          const provider = drafts[name];
          return (
            <article className="provider-card" key={name}>
              <header>
                <span className={`provider-dot ${provider.configured ? "configured" : ""}`} />
                <div>
                  <strong>
                    {name === "cosyvoice"
                      ? "CosyVoice"
                      : name === "zhipu"
                        ? "智谱 GLM"
                        : "DeepSeek"}
                  </strong>
                  <small>
                    {provider.configured
                      ? `已配置 ${provider.api_key_masked}`
                      : "未配置 API Key"}
                  </small>
                </div>
                <label className="simple-switch">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(event) =>
                      updateProvider(name, { enabled: event.target.checked })
                    }
                  />
                </label>
              </header>
              <label>
                <span>Base URL</span>
                <input
                  value={provider.base_url}
                  onChange={(event) =>
                    updateProvider(name, { base_url: event.target.value })
                  }
                />
              </label>
              <label>
                <span>模型</span>
                <input
                  value={provider.model}
                  onChange={(event) =>
                    updateProvider(name, { model: event.target.value })
                  }
                />
              </label>
              <label>
                <span>更新 API Key</span>
                <input
                  type="password"
                  value={provider.api_key}
                  placeholder={
                    provider.configured ? "留空保持不变" : "输入新的 API Key"
                  }
                  onChange={(event) =>
                    updateProvider(name, { api_key: event.target.value })
                  }
                />
              </label>
              {name !== "cosyvoice" ? (
                <button
                  className="secondary-action"
                  disabled={Boolean(busy)}
                  onClick={() => void test(name)}
                >
                  {busy === `test-${name}` ? "测试中…" : "测试连接"}
                </button>
              ) : (
                <small className="phase-note">语音测试将在后续阶段启用</small>
              )}
            </article>
          );
        })}
      </div>

      <section className="routing-card">
        <div>
          <span className="eyebrow">MODEL ROUTING</span>
          <h3>服务路由</h3>
        </div>
        <div className="routing-grid">
          <RoutingSelect
            label="工作台生成"
            value={routing.workbench_generation}
            onChange={(value) =>
              setRouting({ ...routing, workbench_generation: value })
            }
          />
          <RoutingSelect
            label="桌宠对话"
            value={routing.companion_chat}
            onChange={(value) =>
              setRouting({ ...routing, companion_chat: value })
            }
          />
          <RoutingSelect
            label="语义评审"
            value={routing.companion_review}
            onChange={(value) =>
              setRouting({ ...routing, companion_review: value })
            }
          />
        </div>
      </section>
    </section>
  );
}

function RoutingSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "deepseek" | "zhipu";
  onChange: (value: "deepseek" | "zhipu") => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value as "deepseek" | "zhipu")
        }
      >
        <option value="deepseek">DeepSeek</option>
        <option value="zhipu">智谱 GLM</option>
      </select>
    </label>
  );
}
