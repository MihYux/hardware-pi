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
  SpeakerHigh,
  SpeakerSlash,
  SpinnerGap,
  Sparkle,
  StopCircle,
} from "@phosphor-icons/react";
import {
  adminToken,
  isAuthenticationError,
  createMemory,
  deviceToken,
  fetchCompanionSnapshot,
  fetchControlSettings,
  fetchHistory,
  fetchServiceInfo,
  fetchVoiceSettings,
  saveControlSettings,
  saveTokens,
  sendChat,
  testProvider,
  testVoice,
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
  VoiceSettings,
} from "./types";
import { createClientId } from "./id";
import { clearWebsiteCacheAndReload } from "./cache";
import { VoicePlayer, type VoiceState } from "./voice";

type PanelTab =
  | "chat"
  | "memories"
  | "communications"
  | "relationship"
  | "voice"
  | "control";

type ConnectionState =
  | "ready"
  | "connecting"
  | "unpaired"
  | "device-unauthorized"
  | "admin-unauthorized"
  | "offline";

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
  const [activeAdmin, setActiveAdmin] = useState(adminToken());
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [authenticationRequired, setAuthenticationRequired] = useState<
    boolean | null
  >(null);
  const [messages, setMessages] = useState<ChatMessage[]>([welcome]);
  const [snapshot, setSnapshot] = useState<CompanionSnapshot | null>(null);
  const [expression, setExpression] = useState<Expression>("bright");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>(
    "connecting",
  );
  const [notice, setNotice] = useState("");
  const [workbenchPort, setWorkbenchPort] = useState(3000);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings | null>(
    null,
  );
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [activeSpeech, setActiveSpeech] = useState("");
  const [cacheResetting, setCacheResetting] = useState(false);
  const messageEnd = useRef<HTMLDivElement>(null);
  const voicePlayer = useRef<VoicePlayer | null>(null);
  if (!voicePlayer.current) {
    voicePlayer.current = new VoicePlayer((state) => {
      setVoiceState(state);
      if (state === "idle" || state === "error") setActiveSpeech("");
    });
  }

  useEffect(() => {
    void fetchServiceInfo()
      .then((service) => {
        setWorkbenchPort(service.modules.workbench.port);
        setAuthenticationRequired(service.authentication.required);
      })
      .catch((error) => {
        setConnection("offline");
        setNotice((error as Error).message);
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (authenticationRequired === null) return;
    if (authenticationRequired && !activeDevice) {
      setSnapshot(null);
      setVoiceSettings(null);
      setConnection("unpaired");
      return;
    }

    setConnection("connecting");
    setNotice(
      authenticationRequired
        ? "正在验证设备令牌和管理令牌…"
        : "正在连接 Orange Pi…",
    );
    void (async () => {
      try {
        const [history, companion] = await Promise.all([
          fetchHistory(),
          fetchCompanionSnapshot(),
        ]);
        if (cancelled) return;
        if (history.length) setMessages(history);
        setSnapshot(companion);
      } catch (error) {
        if (cancelled) return;
        setSnapshot(null);
        setVoiceSettings(null);
        if (isAuthenticationError(error)) {
          setConnection("device-unauthorized");
          setNotice("设备令牌无效，请重新复制 HARDWARE_PI_DEVICE_TOKEN。");
        } else {
          setConnection("offline");
          setNotice((error as Error).message);
        }
        return;
      }

      void fetchVoiceSettings()
        .then((next) => {
          if (!cancelled) setVoiceSettings(next);
        })
        .catch(() => {
          if (!cancelled) setVoiceSettings(null);
        });

      if (authenticationRequired && !activeAdmin) {
        setConnection("ready");
        setNotice("设备已连接；填写管理令牌后可使用统一 API 设置。");
        return;
      }
      try {
        await fetchControlSettings();
        if (cancelled) return;
        setConnection("ready");
        setNotice("");
      } catch (error) {
        if (cancelled) return;
        if (isAuthenticationError(error)) {
          setConnection("admin-unauthorized");
          setNotice(
            "设备已连接，但管理令牌无效；请重新复制 HARDWARE_PI_ADMIN_TOKEN。",
          );
        } else {
          setConnection("offline");
          setNotice((error as Error).message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    activeAdmin,
    activeDevice,
    authenticationRequired,
    connectionAttempt,
  ]);

  useEffect(
    () => () => voicePlayer.current?.stop(false),
    [],
  );

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const currentBubble =
    [...messages].reverse().find((message) => message.role === "assistant")
      ?.content ?? idleLines[0];
  const statusText = useMemo(() => {
    if (connection === "unpaired") return "等待连接 Pi";
    if (connection === "connecting") return "正在连接";
    if (connection === "device-unauthorized") return "设备令牌无效";
    if (connection === "admin-unauthorized") return "管理令牌无效";
    if (connection === "offline") return "Pi 无响应";
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

  function persistTokens(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextDevice = device.trim();
    const nextAdmin = admin.trim();
    saveTokens(nextDevice, nextAdmin);
    setActiveDevice(nextDevice);
    setActiveAdmin(nextAdmin);
    setConnection(nextDevice ? "connecting" : "unpaired");
    setConnectionAttempt((value) => value + 1);
    setNotice(
      nextDevice
        ? "正在验证设备令牌和管理令牌…"
        : "请填写 HARDWARE_PI_DEVICE_TOKEN。",
    );
    (
      document.getElementById("pairing") as HTMLDialogElement | null
    )?.close();
  }

  async function resetWebsiteCache() {
    setCacheResetting(true);
    setNotice("正在清除网站缓存、旧认证和本地会话…");
    await clearWebsiteCacheAndReload();
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
    if (!message || busy || !snapshot) return;
    const userMessage: ChatMessage = {
      id: createClientId(),
      role: "user",
      content: message,
    };
    setMessages((items) => [...items, userMessage]);
    setDraft("");
    setBusy(true);
    setNotice("");
    try {
      if (voiceSettings?.auto_play && voiceSettings.enabled) {
        await voicePlayer.current?.prepare().catch(() => undefined);
      }
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
      if (
        voiceSettings?.auto_play &&
        voiceSettings.enabled &&
        voiceSettings.configured
      ) {
        void playSpeech(response.text, response.expression);
      }
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
        id: createClientId(),
        role: "assistant",
        content: line,
        provider: "local",
      },
    ]);
    setExpression(line.includes("本姑娘") ? "proud" : "bright");
  }

  async function playSpeech(text: string, mood: Expression) {
    if (
      activeSpeech === text &&
      (voiceState === "synthesizing" || voiceState === "speaking")
    ) {
      voicePlayer.current?.stop();
      return;
    }
    if (
      !voiceSettings?.enabled ||
      !voiceSettings.voice_rights_confirmed ||
      !voiceSettings.configured
    ) {
      setNotice("请先在语音页确认授权、配置 CosyVoice 并启用语音");
      openPanel("voice");
      return;
    }
    setActiveSpeech(text);
    setNotice("");
    try {
      await voicePlayer.current?.play(
        text,
        mood,
        voiceSettings.volume,
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  }

  async function refreshVoiceSettings() {
    const next = await fetchVoiceSettings();
    setVoiceSettings(next);
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
          id: createClientId(),
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
              aria-label="认证与网站缓存"
              title="认证与网站缓存"
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
              <button
                className={`speech-play-button bubble-speech-button ${
                  activeSpeech === currentBubble &&
                  voiceState !== "idle"
                    ? "active"
                    : ""
                }`}
                aria-label={
                  activeSpeech === currentBubble &&
                  voiceState !== "idle"
                    ? "停止这段语音"
                    : "播放这段语音"
                }
                onClick={() => void playSpeech(currentBubble, expression)}
              >
                {activeSpeech === currentBubble &&
                voiceState === "synthesizing" ? (
                  <SpinnerGap className="spinning" />
                ) : activeSpeech === currentBubble &&
                  voiceState === "speaking" ? (
                  <StopCircle weight="fill" />
                ) : voiceSettings?.enabled ? (
                  <SpeakerHigh weight="fill" />
                ) : (
                  <SpeakerSlash />
                )}
              </button>
              {bubbleChatOpen ? (
                <form className="bubble-chat-form" onSubmit={submit}>
                  <input
                    value={draft}
                    maxLength={120}
                    placeholder={
                      snapshot ? "和三月七说点什么……" : "正在连接 Orange Pi"
                    }
                    disabled={!snapshot || busy}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <button disabled={!draft.trim() || busy || !snapshot}>
                    <PaperPlaneTilt weight="fill" />
                  </button>
                </form>
              ) : null}
            </div>
          </section>

          <section className="pet-stage">
            <button
              className="character-button"
              type="button"
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
              aria-label="认证与网站缓存"
              title="认证与网站缓存"
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
              <button
                className={`nav-row ${panelTab === "voice" ? "active" : ""}`}
                onClick={() => setPanelTab("voice")}
                title="CosyVoice 语音"
              >
                <span className="nav-icon">
                  {voiceSettings?.enabled ? <SpeakerHigh weight="fill" /> : <SpeakerSlash />}
                </span>
                <span className="nav-label">语音</span>
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
                type="button"
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
                connected={Boolean(snapshot)}
                messageEnd={messageEnd}
                onDraft={setDraft}
                onSubmit={submit}
                onSpeak={playSpeech}
                activeSpeech={activeSpeech}
                voiceState={voiceState}
              />
            ) : panelTab === "voice" ? (
              <VoicePanel
                adminTokenValue={activeAdmin}
                authenticationRequired={authenticationRequired === true}
                onNeedPairing={openPairing}
                onUpdated={refreshVoiceSettings}
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
                adminTokenValue={activeAdmin}
                authenticationRequired={authenticationRequired === true}
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
        <form onSubmit={persistTokens}>
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">LOCAL PAIRING</span>
              <h2>认证与网站缓存</h2>
            </div>
            <button
              className="dialog-close"
              type="button"
              aria-label="关闭"
              onClick={() =>
                (
                  document.getElementById(
                    "pairing",
                  ) as HTMLDialogElement | null
                )?.close()
              }
            >
              ×
            </button>
          </div>
          {authenticationRequired === false ? (
            <div className="authentication-status">
              <strong>当前为局域网免鉴权模式</strong>
              <span>手机无需填写设备令牌或管理令牌即可连接 Orange Pi。</span>
            </div>
          ) : (
            <>
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
              <p>
                令牌只保存在当前浏览器；保存后会分别验证设备接口和管理接口。
                模型 API Key 始终留在 Pi。
              </p>
              <button
                className="primary-action"
                type="submit"
                disabled={!device.trim()}
              >
                {connection === "connecting" ? "重新验证" : "保存并连接"}
              </button>
            </>
          )}
          <section className="cache-reset-card" aria-label="网站缓存">
            <div>
              <strong>网站缓存与本地认证</strong>
              <span>
                清除旧页面、Service Worker、浏览器令牌和本地会话，然后重新载入。
                不会删除 Pi 上的 API Key、记忆、相册或工作台数据。
              </span>
            </div>
            <button
              className="danger-action"
              type="button"
              disabled={cacheResetting}
              onClick={() => void resetWebsiteCache()}
            >
              {cacheResetting ? "正在清除…" : "一键清除并刷新"}
            </button>
          </section>
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
  onSpeak,
  activeSpeech,
  voiceState,
}: {
  messages: ChatMessage[];
  draft: string;
  busy: boolean;
  notice: string;
  connected: boolean;
  messageEnd: React.RefObject<HTMLDivElement | null>;
  onDraft: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onSpeak: (text: string, mood: Expression) => Promise<void>;
  activeSpeech: string;
  voiceState: VoiceState;
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
            {message.role === "assistant" ? (
              <button
                className={`speech-play-button message-speech-button ${
                  activeSpeech === message.content &&
                  voiceState !== "idle"
                    ? "active"
                    : ""
                }`}
                aria-label={
                  activeSpeech === message.content &&
                  voiceState !== "idle"
                    ? "停止这段语音"
                    : "播放这段语音"
                }
                onClick={() =>
                  void onSpeak(
                    message.content,
                    message.content.includes("？") ? "curious" : "bright",
                  )
                }
              >
                {activeSpeech === message.content &&
                voiceState === "synthesizing" ? (
                  <SpinnerGap className="spinning" />
                ) : activeSpeech === message.content &&
                  voiceState === "speaking" ? (
                  <StopCircle weight="fill" />
                ) : (
                  <SpeakerHigh weight="fill" />
                )}
              </button>
            ) : null}
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

function VoicePanel({
  adminTokenValue,
  authenticationRequired,
  onNeedPairing,
  onUpdated,
}: {
  adminTokenValue: string;
  authenticationRequired: boolean;
  onNeedPairing: () => void;
  onUpdated: () => Promise<void>;
}) {
  const [provider, setProvider] = useState<
    (ProviderView & { api_key: string }) | null
  >(null);
  const [voice, setVoice] = useState<VoiceSettings | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const previewAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (authenticationRequired && !adminTokenValue) return;
    setBusy("load");
    void fetchControlSettings()
      .then((settings) => {
        setProvider({ ...settings.cosyvoice, api_key: "" });
        setVoice(settings.voice);
      })
      .catch((error) => setNotice((error as Error).message))
      .finally(() => setBusy(""));
  }, [adminTokenValue, authenticationRequired]);

  useEffect(
    () => () => {
      previewAudio.current?.pause();
      previewAudio.current = null;
    },
    [],
  );

  async function save(preview: boolean) {
    if (!provider || !voice) return;
    setBusy(preview ? "preview" : "save");
    setNotice("");
    try {
      const next = await saveControlSettings({
        providers: {
          cosyvoice: {
            enabled: provider.enabled,
            base_url: provider.base_url,
            model: provider.model,
            ...(provider.api_key.trim()
              ? { api_key: provider.api_key.trim() }
              : {}),
          },
        },
        voice,
      });
      setProvider({ ...next.cosyvoice, api_key: "" });
      setVoice(next.voice);
      await onUpdated();
      if (!preview) {
        setNotice("语音设置已保存到 Orange Pi");
        return;
      }
      const result = await testVoice();
      previewAudio.current?.pause();
      const url = URL.createObjectURL(result.audio);
      const audio = new Audio(url);
      audio.volume = next.voice.volume;
      previewAudio.current = audio;
      audio.addEventListener(
        "ended",
        () => URL.revokeObjectURL(url),
        { once: true },
      );
      await audio.play();
      setNotice(`试听成功 · ${result.characters} 字 · ${result.model}`);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (authenticationRequired && !adminTokenValue) {
    return (
      <section className="settings-panel embedded settings-empty">
        <SpeakerHigh weight="duotone" />
        <span className="eyebrow">VOICE OUTPUT</span>
        <h2>CosyVoice 语音</h2>
        <p>填写管理令牌后，可以配置和试听复刻音色。</p>
        <button className="primary-action" onClick={onNeedPairing}>
          连接 Orange Pi
        </button>
      </section>
    );
  }

  if (!provider || !voice) {
    return (
      <section className="settings-panel embedded settings-empty">
        <span className="eyebrow">VOICE OUTPUT</span>
        <h2>{busy ? "正在读取语音设置…" : "无法读取语音设置"}</h2>
        {notice ? <p>{notice}</p> : null}
      </section>
    );
  }

  return (
    <section className="settings-panel embedded voice-panel">
      <header className="panel-section-header">
        <div>
          <span className="eyebrow">VOICE OUTPUT · PCM STREAM</span>
          <h2>CosyVoice 复刻音色</h2>
          <p>音频由 Pi 生成并以实时 PCM 队列发送到手机。</p>
        </div>
        <SpeakerHigh weight="duotone" />
      </header>

      <div className="voice-panel-scroll">
        <article className="voice-provider-card">
          <div className="voice-provider-heading">
            <span
              className={`provider-dot ${
                provider.configured ? "configured" : ""
              }`}
            />
            <span>
              <strong>DashScope · {provider.model}</strong>
              <small>
                {provider.configured
                  ? `已配置 ${provider.api_key_masked}`
                  : "尚未配置 API Key"}
              </small>
            </span>
          </div>
          <div className="voice-field-grid">
            <label>
              <span>Base URL</span>
              <input
                value={provider.base_url}
                onChange={(event) =>
                  setProvider({ ...provider, base_url: event.target.value })
                }
              />
            </label>
            <label>
              <span>CosyVoice 模型 ID</span>
              <input
                value={provider.model}
                onChange={(event) =>
                  setProvider({ ...provider, model: event.target.value })
                }
              />
            </label>
            <label className="voice-field-wide">
              <span>DashScope API Key</span>
              <input
                type="password"
                autoComplete="off"
                value={provider.api_key}
                placeholder={
                  provider.configured ? "留空保持不变" : "sk-..."
                }
                onChange={(event) =>
                  setProvider({ ...provider, api_key: event.target.value })
                }
              />
            </label>
            <label className="voice-field-wide">
              <span>复刻音色 ID</span>
              <input
                value={voice.voice_id}
                onChange={(event) =>
                  setVoice({ ...voice, voice_id: event.target.value })
                }
              />
            </label>
          </div>
        </article>

        <label className="voice-rights-row">
          <input
            type="checkbox"
            checked={voice.voice_rights_confirmed}
            onChange={(event) => {
              const confirmed = event.target.checked;
              setVoice({
                ...voice,
                voice_rights_confirmed: confirmed,
                enabled: confirmed ? voice.enabled : false,
                auto_play: confirmed ? voice.auto_play : false,
              });
            }}
          />
          <span>
            <strong>声音使用授权确认</strong>
            <small>
              我确认对声音样本、复刻音色及当前用途拥有必要授权，
              并会在授权撤回时停止使用。
            </small>
          </span>
        </label>

        <div className="voice-toggle-grid">
          <ToggleSetting
            label="语音输出"
            detail="允许气泡和聊天消息独立播放"
            checked={voice.enabled}
            disabled={!voice.voice_rights_confirmed}
            onChange={(enabled) =>
              setVoice({
                ...voice,
                enabled,
                auto_play: enabled ? voice.auto_play : false,
              })
            }
          />
          <ToggleSetting
            label="自动朗读"
            detail="模型回复后自动加入实时播放队列"
            checked={voice.auto_play}
            disabled={!voice.enabled}
            onChange={(auto_play) =>
              setVoice({ ...voice, auto_play })
            }
          />
        </div>

        <div className="voice-control-grid">
          <label>
            <span>语速</span>
            <select
              value={voice.rate}
              onChange={(event) =>
                setVoice({ ...voice, rate: Number(event.target.value) })
              }
            >
              <option value={0.9}>舒缓 · 0.9×</option>
              <option value={1}>自然 · 1.0×</option>
              <option value={1.1}>轻快 · 1.1×</option>
            </select>
          </label>
          <label>
            <span>手机播放音量 · {Math.round(voice.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={voice.volume}
              onChange={(event) =>
                setVoice({ ...voice, volume: Number(event.target.value) })
              }
            />
          </label>
        </div>

        {notice ? <div className="panel-notice">{notice}</div> : null}
        <div className="voice-actions">
          <button
            className="secondary-action"
            disabled={Boolean(busy)}
            onClick={() => void save(false)}
          >
            {busy === "save" ? "保存中…" : "保存语音设置"}
          </button>
          <button
            className="primary-action"
            disabled={
              Boolean(busy) ||
              !voice.voice_rights_confirmed ||
              (!provider.configured && !provider.api_key.trim())
            }
            onClick={() => void save(true)}
          >
            {busy === "preview" ? "生成试听中…" : "保存并试听"}
          </button>
        </div>
      </div>
    </section>
  );
}

function ToggleSetting({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="voice-toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ControlPanel({
  adminTokenValue,
  authenticationRequired,
  onNeedPairing,
}: {
  adminTokenValue: string;
  authenticationRequired: boolean;
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
  const [testResults, setTestResults] = useState<
    Record<string, { kind: "progress" | "success" | "error"; text: string }>
  >({});

  useEffect(() => {
    if (authenticationRequired && !adminTokenValue) return;
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
  }, [adminTokenValue, authenticationRequired]);

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
    const provider = drafts[name];
    if (!provider.configured && !provider.api_key.trim()) {
      setTestResults((current) => ({
        ...current,
        [name]: {
          kind: "error",
          text: "请先填写 API Key，再执行保存并测试。",
        },
      }));
      return;
    }
    setBusy(`test-${name}`);
    setNotice("");
    setTestResults((current) => ({
      ...current,
      [name]: {
        kind: "progress",
        text: "正在保存当前配置并请求模型…",
      },
    }));
    try {
      const next = await saveControlSettings({
        providers: {
          [name]: {
            enabled: provider.enabled,
            base_url: provider.base_url,
            model: provider.model,
            ...(provider.api_key.trim()
              ? { api_key: provider.api_key.trim() }
              : {}),
          },
        },
      });
      setSettings(next);
      setDrafts((current) => ({
        ...current,
        [name]: { ...next[name], api_key: "" },
      }));
      const result = await testProvider(name);
      const message = `连接成功 · ${result.model} · ${result.latency_ms}ms`;
      setTestResults((current) => ({
        ...current,
        [name]: { kind: "success", text: message },
      }));
    } catch (error) {
      setTestResults((current) => ({
        ...current,
        [name]: { kind: "error", text: (error as Error).message },
      }));
    } finally {
      setBusy("");
    }
  }

  if (authenticationRequired && !adminTokenValue) {
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
                <span>{name === "cosyvoice" ? "CosyVoice 模型 ID" : "模型 ID"}</span>
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
                  {busy === `test-${name}` ? "测试中…" : "保存并测试"}
                </button>
              ) : (
                <small className="phase-note">详细授权与试听请打开“语音”页</small>
              )}
              {testResults[name] ? (
                <small
                  className={`provider-test-result ${testResults[name].kind}`}
                  aria-live="polite"
                >
                  {testResults[name].text}
                </small>
              ) : null}
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
