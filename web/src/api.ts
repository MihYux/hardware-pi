import type {
  ChatMessage,
  ChatResponse,
  Communication,
  CompanionProfile,
  CompanionSnapshot,
  ControlSettings,
  MemoryRecord,
} from "./types";

const DEVICE_TOKEN_KEY = "rehoyo.hardwarePi.deviceToken";
const ADMIN_TOKEN_KEY = "rehoyo.hardwarePi.adminToken";
const SESSION_KEY = "rehoyo.hardwarePi.sessionId";

export function deviceToken() {
  return localStorage.getItem(DEVICE_TOKEN_KEY) || "";
}

export function adminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

export function saveTokens(device: string, admin: string) {
  localStorage.setItem(DEVICE_TOKEN_KEY, device.trim());
  localStorage.setItem(ADMIN_TOKEN_KEY, admin.trim());
}

export function sessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const next = `phone-${crypto.randomUUID()}`;
  localStorage.setItem(SESSION_KEY, next);
  return next;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.detail || "请求失败");
  }
  return payload as T;
}

export async function fetchServiceInfo(): Promise<{
  version: string;
  modules: {
    companion: { port: number };
    workbench: { port: number };
  };
}> {
  const response = await fetch("/api/v1/health");
  return parseResponse(response);
}

export async function fetchHistory(): Promise<ChatMessage[]> {
  const response = await fetch(`/api/v1/conversations/${encodeURIComponent(sessionId())}`, {
    headers: { Authorization: `Bearer ${deviceToken()}` },
  });
  const payload = await parseResponse<{ messages: ChatMessage[] }>(response);
  return payload.messages;
}

export async function sendChat(
  message: string,
  history: ChatMessage[],
): Promise<ChatResponse> {
  const response = await fetch("/api/v1/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deviceToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId(),
      message,
      history: history.slice(-20).map((item) => ({
        role: item.role,
        content: item.content,
      })),
    }),
  });
  return parseResponse<ChatResponse>(response);
}

export async function fetchControlSettings(): Promise<ControlSettings> {
  const response = await fetch("/api/v1/control/settings", {
    headers: { "X-Admin-Token": adminToken() },
  });
  return parseResponse<ControlSettings>(response);
}

export async function saveControlSettings(input: unknown): Promise<ControlSettings> {
  const response = await fetch("/api/v1/control/settings", {
    method: "PUT",
    headers: {
      "X-Admin-Token": adminToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  return parseResponse<ControlSettings>(response);
}

export async function testProvider(provider: "deepseek" | "zhipu") {
  const response = await fetch(`/api/v1/control/providers/${provider}/test`, {
    method: "POST",
    headers: { "X-Admin-Token": adminToken() },
  });
  return parseResponse<{
    ok: boolean;
    model: string;
    latency_ms: number;
    message: string;
  }>(response);
}

function deviceHeaders(json = false): HeadersInit {
  return {
    Authorization: `Bearer ${deviceToken()}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

export async function fetchCompanionSnapshot(): Promise<CompanionSnapshot> {
  const response = await fetch("/api/v1/companion/snapshot", {
    headers: deviceHeaders(),
  });
  return parseResponse<CompanionSnapshot>(response);
}

export async function completeOnboarding(
  input: unknown,
): Promise<CompanionSnapshot> {
  const response = await fetch("/api/v1/companion/onboarding", {
    method: "POST",
    headers: deviceHeaders(true),
    body: JSON.stringify(input),
  });
  return parseResponse<CompanionSnapshot>(response);
}

export async function updateCompanionProfile(
  input: Partial<CompanionProfile>,
): Promise<CompanionProfile> {
  const response = await fetch("/api/v1/companion/profile", {
    method: "PUT",
    headers: deviceHeaders(true),
    body: JSON.stringify(input),
  });
  return parseResponse<CompanionProfile>(response);
}

export async function createMemory(input: {
  type: MemoryRecord["type"];
  title: string;
  summary: string;
  reusable_by_character: boolean;
  user_confirmed: boolean;
}): Promise<MemoryRecord> {
  const response = await fetch("/api/v1/memories", {
    method: "POST",
    headers: deviceHeaders(true),
    body: JSON.stringify(input),
  });
  return parseResponse<MemoryRecord>(response);
}

export async function updateMemory(
  memoryId: string,
  input: Partial<MemoryRecord>,
): Promise<MemoryRecord> {
  const response = await fetch(`/api/v1/memories/${encodeURIComponent(memoryId)}`, {
    method: "PATCH",
    headers: deviceHeaders(true),
    body: JSON.stringify(input),
  });
  return parseResponse<MemoryRecord>(response);
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const response = await fetch(`/api/v1/memories/${encodeURIComponent(memoryId)}`, {
    method: "DELETE",
    headers: deviceHeaders(),
  });
  if (!response.ok) await parseResponse(response);
}

export async function updateCommunication(
  messageId: string,
  input: {
    read?: boolean;
    favorite?: boolean;
    liked?: boolean;
    remind_later?: boolean;
  },
): Promise<Communication> {
  const response = await fetch(
    `/api/v1/communications/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: deviceHeaders(true),
      body: JSON.stringify(input),
    },
  );
  return parseResponse<Communication>(response);
}

export async function scanReleaseQueue(): Promise<{
  processing: {
    delivered: number;
    deferred: number;
    rejected: number;
  };
}> {
  const response = await fetch("/api/v1/release/scan", {
    method: "POST",
    headers: { "X-Admin-Token": adminToken() },
  });
  return parseResponse(response);
}

export async function exportCompanionData(): Promise<unknown> {
  const response = await fetch("/api/v1/companion/export", {
    headers: deviceHeaders(),
  });
  return parseResponse(response);
}

export async function deleteCompanionData(): Promise<CompanionSnapshot> {
  const response = await fetch("/api/v1/companion/data", {
    method: "DELETE",
    headers: deviceHeaders(),
  });
  return parseResponse<CompanionSnapshot>(response);
}
