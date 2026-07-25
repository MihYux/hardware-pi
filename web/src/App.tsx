import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  adminToken,
  deviceToken,
  fetchCompanionSnapshot,
  fetchControlSettings,
  fetchHistory,
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

type Screen =
  | "companion"
  | "memories"
  | "communications"
  | "relationship"
  | "control";

const expressionCopy: Record<Expression, string> = {
  bright: "陪伴中",
  soft: "认真听着",
  proud: "交给本姑娘",
  curious: "好奇观察中",
};

const welcome: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "开拓者，手机就是咱的新窗口啦！连接 Orange Pi 后，随时都可以来这里聊聊天。",
  provider: "local",
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("companion");
  const [device, setDevice] = useState(deviceToken());
  const [activeDevice, setActiveDevice] = useState(deviceToken());
  const [admin, setAdmin] = useState(adminToken());
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [expression, setExpression] = useState<Expression>("bright");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<"ready" | "offline" | "unauthorized">(
    device ? "offline" : "unauthorized",
  );
  const [notice, setNotice] = useState("");
  const messageEnd = useRef<HTMLDivElement>(null);

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

  const statusCopy = useMemo(() => {
    if (connection === "ready") return expressionCopy[expression];
    if (connection === "unauthorized") return "等待配对";
    return "连接检查中";
  }, [connection, expression]);

  function persistTokens() {
    saveTokens(device, admin);
    setActiveDevice(device.trim());
    setConnection(device.trim() ? "offline" : "unauthorized");
    setNotice("访问令牌已保存在当前手机浏览器");
  }

  async function refreshCompanion() {
    const next = await fetchCompanionSnapshot();
    setSnapshot(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || busy) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    const nextHistory = [...messages, userMessage];
    setMessages(nextHistory);
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
      if (response.fallback) setNotice("当前使用本地离线回复；可在控制面板配置模型");
    } catch (error) {
      setConnection("unauthorized");
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("companion")}>
          <span className="brand-mark">M7</span>
          <span>
            <strong>March 7th</strong>
            <small>HARDWARE PI / LAN TERMINAL</small>
          </span>
        </button>
        <nav aria-label="页面">
          <button
            className={screen === "companion" ? "active" : ""}
            onClick={() => setScreen("companion")}
          >
            陪伴
          </button>
          <button
            className={screen === "memories" ? "active" : ""}
            onClick={() => setScreen("memories")}
            disabled={!snapshot?.profile.onboarding_completed}
          >
            相册
          </button>
          <button
            className={screen === "communications" ? "active" : ""}
            onClick={() => setScreen("communications")}
            disabled={!snapshot?.profile.onboarding_completed}
          >
            通信
            {snapshot?.counts.unread_communications ? (
              <b className="nav-badge">
                {snapshot.counts.unread_communications}
              </b>
            ) : null}
          </button>
          <button
            className={screen === "relationship" ? "active" : ""}
            onClick={() => setScreen("relationship")}
            disabled={!snapshot?.profile.onboarding_completed}
          >
            同行
          </button>
          <button
            className={screen === "control" ? "active" : ""}
            onClick={() => setScreen("control")}
          >
            API 控制面板
          </button>
        </nav>
        <span className={`connection connection-${connection}`}>
          <i />
          {connection === "ready" ? "PI ONLINE" : "PAIRING"}
        </span>
      </header>

      {snapshot && !snapshot.profile.onboarding_completed ? (
        <Onboarding
          onComplete={(next) => {
            setSnapshot(next);
            setScreen("companion");
          }}
        />
      ) : screen === "companion" ? (
        <section className="companion-layout">
          <aside className={`character-stage expression-${expression}`}>
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="status-pill">
              <span />
              {statusCopy}
            </div>
            <div className="character-halo" />
            <img
              className="character"
              src="/assets/march7th-pet.png"
              alt="手持相机的三月七"
            />
            <div className="character-caption">
              <small>COMPANION STATE</small>
              <strong>{expression.toUpperCase()}</strong>
              <span>Orange Pi 正在守护会话与 API Key</span>
            </div>
          </aside>

          <section className="conversation-panel">
            <header className="conversation-heading">
              <div>
                <span className="eyebrow">LOCAL COMPANION CHANNEL</span>
                <h1>手机就是她的新窗口。</h1>
              </div>
              <button
                className="token-button"
                onClick={() => (document.getElementById("pairing") as HTMLDialogElement | null)?.showModal()}
              >
                配对设置
              </button>
            </header>

            <div className="messages" aria-live="polite">
              {messages.map((message) => (
                <article key={message.id} className={`message message-${message.role}`}>
                  <span>{message.role === "assistant" ? "M7" : "YOU"}</span>
                  <div>
                    <p>{message.content}</p>
                    {message.provider ? <small>{message.provider}</small> : null}
                  </div>
                </article>
              ))}
              {busy ? (
                <article className="message message-assistant">
                  <span>M7</span>
                  <div className="thinking"><i /><i /><i /></div>
                </article>
              ) : null}
              <div ref={messageEnd} />
            </div>

            {notice ? <div className="inline-notice">{notice}</div> : null}

            <form className="composer" onSubmit={submit}>
              <textarea
                aria-label="发送给三月七的消息"
                placeholder={deviceToken() ? "和三月七说点什么……" : "先完成设备配对……"}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                disabled={!deviceToken() || busy}
                rows={2}
              />
              <button disabled={!draft.trim() || busy || !deviceToken()}>
                <span>发送</span>
                <b>↗</b>
              </button>
            </form>
          </section>
        </section>
      ) : screen === "memories" && snapshot ? (
        <MemoriesPage
          snapshot={snapshot}
          onRefresh={refreshCompanion}
        />
      ) : screen === "communications" && snapshot ? (
        <CommunicationsPage
          snapshot={snapshot}
          onRefresh={refreshCompanion}
        />
      ) : screen === "relationship" && snapshot ? (
        <RelationshipPage
          snapshot={snapshot}
          onRefresh={refreshCompanion}
          onDeleted={(next) => {
            setSnapshot(next);
            setScreen("companion");
          }}
        />
      ) : (
        <ControlPanel
          adminTokenValue={admin}
          onNeedPairing={() => (document.getElementById("pairing") as HTMLDialogElement | null)?.showModal()}
        />
      )}

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
          <p>令牌只保存在当前手机浏览器；API Key 始终留在 Pi。</p>
          <button className="primary-action" onClick={persistTokens}>保存并连接</button>
        </form>
      </dialog>
    </main>
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
  const [drafts, setDrafts] = useState<Record<string, ProviderView & { api_key: string }>>({});
  const [routing, setRouting] = useState<ControlSettings["routing"] | null>(null);
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

  function updateProvider(name: string, patch: Partial<ProviderView & { api_key: string }>) {
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
            ...(provider.api_key.trim() ? { api_key: provider.api_key.trim() } : {}),
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
      <section className="control-empty">
        <span className="control-lock">⌁</span>
        <span className="eyebrow">ADMIN TOKEN REQUIRED</span>
        <h1>控制面板尚未解锁</h1>
        <p>先填写 Pi 部署时生成的管理令牌。模型 API Key 不会发送到手机。</p>
        <button className="primary-action" onClick={onNeedPairing}>填写管理令牌</button>
      </section>
    );
  }

  if (!settings || !routing) {
    return (
      <section className="control-empty">
        <span className="control-lock">{busy ? "…" : "!"}</span>
        <h1>{busy ? "正在读取统一配置" : "无法读取控制面板"}</h1>
        {notice ? <p>{notice}</p> : null}
      </section>
    );
  }

  return (
    <section className="control-page">
      <header className="control-header">
        <div>
          <span className="eyebrow">UNIFIED API CONTROL PLANE</span>
          <h1>所有模型，一处管理。</h1>
          <p>工作台、手机桌宠与大型 Python 项目共享路由，但永远不会读取完整密钥。</p>
        </div>
        <button className="primary-action" onClick={save} disabled={Boolean(busy)}>
          {busy === "save" ? "保存中…" : "保存全部配置"}
        </button>
      </header>

      {notice ? <div className="control-notice">{notice}</div> : null}

      <div className="provider-grid">
        {(["deepseek", "zhipu", "cosyvoice"] as const).map((name) => {
          const provider = drafts[name];
          return (
            <article className="provider-card" key={name}>
              <header>
                <span className={`provider-dot ${provider.configured ? "configured" : ""}`} />
                <div>
                  <strong>{name === "cosyvoice" ? "CosyVoice" : name === "zhipu" ? "智谱 GLM" : "DeepSeek"}</strong>
                  <small>{provider.configured ? `已配置 ${provider.api_key_masked}` : "未配置 API Key"}</small>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(event) => updateProvider(name, { enabled: event.target.checked })}
                  />
                  <span />
                </label>
              </header>
              <label>
                <span>Base URL</span>
                <input
                  value={provider.base_url}
                  onChange={(event) => updateProvider(name, { base_url: event.target.value })}
                />
              </label>
              <label>
                <span>模型</span>
                <input
                  value={provider.model}
                  onChange={(event) => updateProvider(name, { model: event.target.value })}
                />
              </label>
              <label>
                <span>更新 API Key</span>
                <input
                  type="password"
                  value={provider.api_key}
                  placeholder={provider.configured ? "留空表示保持不变" : "输入新的 API Key"}
                  onChange={(event) => updateProvider(name, { api_key: event.target.value })}
                />
              </label>
              {name !== "cosyvoice" ? (
                <button className="test-button" onClick={() => void test(name)} disabled={Boolean(busy)}>
                  {busy === `test-${name}` ? "测试中…" : "测试连接"}
                </button>
              ) : (
                <span className="phase-note">语音连接测试将在下一迁移阶段启用</span>
              )}
            </article>
          );
        })}
      </div>

      <section className="routing-card">
        <div>
          <span className="eyebrow">MODEL ROUTING</span>
          <h2>服务路由</h2>
        </div>
        <div className="routing-grid">
          <RoutingSelect
            label="工作台生成"
            value={routing.workbench_generation}
            onChange={(value) => setRouting({ ...routing, workbench_generation: value })}
          />
          <RoutingSelect
            label="桌宠对话"
            value={routing.companion_chat}
            onChange={(value) => setRouting({ ...routing, companion_chat: value })}
          />
          <RoutingSelect
            label="桌宠语义评审"
            value={routing.companion_review}
            onChange={(value) => setRouting({ ...routing, companion_review: value })}
          />
          <div className="fixed-route">
            <span>区域联网搜索</span>
            <strong>智谱 Web Search</strong>
          </div>
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
      <select value={value} onChange={(event) => onChange(event.target.value as "deepseek" | "zhipu")}>
        <option value="deepseek">DeepSeek</option>
        <option value="zhipu">智谱 GLM</option>
      </select>
    </label>
  );
}
