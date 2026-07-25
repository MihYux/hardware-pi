import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowsClockwise,
  Bell,
  BookOpenText,
  Camera,
  CheckCircle,
  Database,
  DownloadSimple,
  EnvelopeSimple,
  Footprints,
  Heart,
  MapTrifold,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  Sparkle,
  Star,
  Trash,
} from "@phosphor-icons/react";
import {
  completeOnboarding,
  deleteCompanionData,
  deleteMemory,
  exportCompanionData,
  importCompanionData,
  scanReleaseQueue,
  updateCommunication,
  updateCompanionProfile,
  updateMemory,
} from "./api";
import type {
  Communication,
  CompanionProfile,
  CompanionSnapshot,
  ContentType,
  MemoryRecord,
} from "./types";

type SnapshotProps = {
  snapshot: CompanionSnapshot;
  onRefresh: () => Promise<void>;
};

const firstChoices = [
  {
    value: "take_photos",
    label: "拍很多照片",
    description: "把沿途值得记住的瞬间都留下来",
    icon: Camera,
  },
  {
    value: "explore_places",
    label: "探索新地方",
    description: "一起去没见过的地方转一转",
    icon: MapTrifold,
  },
  {
    value: "hear_stories",
    label: "听新的故事",
    description: "慢慢认识旅途中遇到的人和事",
    icon: BookOpenText,
  },
  {
    value: "walk_slowly",
    label: "什么都不赶",
    description: "不用完成任务，只是一起慢慢走",
    icon: Footprints,
  },
] as const;

const contentLabels: Record<ContentType, string> = {
  daily: "日常",
  photo: "照片",
  postcard: "明信片",
  relationship: "同行",
  version_preheat: "版本预热",
  version_launch: "版本上线",
  version_sustain: "版本持续",
  recall: "召回",
};

export function Onboarding({
  onComplete,
}: {
  onComplete: (snapshot: CompanionSnapshot) => void;
}) {
  const [step, setStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [displayName, setDisplayName] = useState("开拓者");
  const [proactive, setProactive] = useState(false);
  const [memory, setMemory] = useState(true);
  const [personalization, setPersonalization] = useState(true);
  const [recall, setRecall] = useState(false);
  const [weeklyLimit, setWeeklyLimit] = useState(2);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("09:00");
  const [firstChoice, setFirstChoice] =
    useState<(typeof firstChoices)[number]["value"]>("take_photos");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function finish() {
    setBusy(true);
    setNotice("");
    try {
      const snapshot = await completeOnboarding({
        display_name: displayName.trim(),
        region: "china",
        language: "zh-CN",
        time_zone: "Asia/Shanghai",
        allowed_content_types: [
          "daily",
          "photo",
          "postcard",
          "relationship",
          "version_preheat",
          "version_launch",
          "version_sustain",
        ],
        proactive_contact_enabled: proactive,
        recall_enabled: recall,
        personalization_enabled: personalization,
        memory_enabled: memory,
        quiet_hours: { start: quietStart, end: quietEnd },
        weekly_contact_limit: weeklyLimit,
        accepted_concept: true,
        accepted_data_flow: true,
        first_join_choice: memory ? firstChoice : null,
        consent_version: "hardware-pi-v1",
      });
      onComplete(snapshot);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="companion-onboarding"
      role="dialog"
      aria-modal="true"
      aria-label="开始角色同行计划"
    >
      <div className="onboarding-progress" aria-label="首次进入进度">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={index <= step ? "active" : ""} />
        ))}
      </div>

      <div className="onboarding-content">
        {step === 0 ? (
          <div className="onboarding-step onboarding-welcome">
            <div className="onboarding-hero-icon">
              <Sparkle weight="fill" />
            </div>
            <span className="eyebrow">REHOYO · 角色同行计划</span>
            <h1>让喜欢的角色，陪你走过每一次旅程。</h1>
            <p>
              这是运行在 Orange Pi 上的本地概念体验。你选择三月七后，
              她会通过手机桌宠、共同相册和通信中心进行低打扰陪伴。
            </p>
            <div className="onboarding-disclosure-grid">
              <article>
                <ShieldCheck weight="duotone" />
                <strong>由你主动选择</strong>
                <span>联系、记忆、版本内容和召回都能关闭</span>
              </article>
              <article>
                <Database weight="duotone" />
                <strong>数据留在 Pi</strong>
                <span>API Key 不会发送到手机浏览器</span>
              </article>
            </div>
            <div className="onboarding-ai-note">
              <strong>AI 与第三方服务说明</strong>
              <p>
                在线聊天启用后，输入会发送给控制面板中选择的模型；
                普通聊天不会自动保存为长期记忆，只有明确确认的内容才会进入相册。
              </p>
            </div>
            <label className="onboarding-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>我理解这是概念体验，并愿意继续设置角色同行。</span>
            </label>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="onboarding-step onboarding-character">
            <span className="eyebrow">选择同行角色 · MVP</span>
            <h1>这一次，和三月七同行</h1>
            <div className="onboarding-character-card">
              <div>
                <img src="/assets/march7th-pet.png" alt="三月七" />
              </div>
              <section>
                <span>星穹列车乘员</span>
                <h2>三月七</h2>
                <p>
                  活泼、亲近，喜欢拍照和记录新的回忆。
                  真正重要的时候，她也会认真地陪在同伴身边。
                </p>
              </section>
            </div>
            <div className="onboarding-boundaries">
              <article>
                <strong>她可能会做</strong>
                <ul>
                  <li>通过手机提供低打扰陪伴</li>
                  <li>保存明确确认的共同记忆</li>
                  <li>展示经过审核的角色通信</li>
                </ul>
              </article>
              <article>
                <strong>她不会做</strong>
                <ul>
                  <li>擅自读取真实账号或消费数据</li>
                  <li>未经确认永久保存普通聊天</li>
                  <li>绕过你的授权、勿扰或删除选择</li>
                </ul>
              </article>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="onboarding-step onboarding-preferences">
            <span className="eyebrow">授权与偏好</span>
            <h1>你希望怎样被联系？</h1>
            <p className="onboarding-step-note">
              这些设置之后都能更改。外部项目不能覆盖你的选择。
            </p>
            <label className="onboarding-name-field">
              希望角色怎样称呼你
              <input
                value={displayName}
                maxLength={24}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="onboarding-toggle-row">
              <span>
                <strong>允许主动联系</strong>
                <small>遵守勿扰时段、24 小时间隔和每周上限</small>
              </span>
              <input
                type="checkbox"
                checked={proactive}
                onChange={(event) => setProactive(event.target.checked)}
              />
            </label>
            <div className="onboarding-content-types">
              <span>数据和关系控制</span>
              <ToggleRow
                label="有限个性化"
                detail="只使用明确允许的称呼和偏好"
                checked={personalization}
                onChange={setPersonalization}
              />
              <ToggleRow
                label="长期记忆"
                detail="可随时查看、关闭引用和删除"
                checked={memory}
                onChange={setMemory}
              />
              <ToggleRow
                label="低频召回"
                detail="默认关闭，需要单独同意"
                checked={recall}
                onChange={setRecall}
              />
            </div>
            <div className="onboarding-compact-grid">
              <label>
                <span>每周主动消息上限</span>
                <select
                  value={weeklyLimit}
                  onChange={(event) => setWeeklyLimit(Number(event.target.value))}
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((value) => (
                    <option key={value} value={value}>{value} 次</option>
                  ))}
                </select>
              </label>
              <label>
                <span>勿扰开始</span>
                <input
                  type="time"
                  value={quietStart}
                  onChange={(event) => setQuietStart(event.target.value)}
                />
              </label>
              <label>
                <span>勿扰结束</span>
                <input
                  type="time"
                  value={quietEnd}
                  onChange={(event) => setQuietEnd(event.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="onboarding-step onboarding-first-choice">
            <span className="eyebrow">建立第一次共同记忆</span>
            <h1>如果下一次一起旅行，你最想做什么？</h1>
            <p className="onboarding-step-note">
              {memory
                ? "完成后，这个选择会成为第一条可管理的共同记忆。"
                : "你关闭了长期记忆，这个选择不会写入相册。"}
            </p>
            <div className="first-choice-grid">
              {firstChoices.map((choice) => {
                const Icon = choice.icon;
                const selected = firstChoice === choice.value;
                return (
                  <button
                    type="button"
                    className={selected ? "selected" : ""}
                    key={choice.value}
                    onClick={() => setFirstChoice(choice.value)}
                  >
                    <Icon weight={selected ? "fill" : "duotone"} />
                    <span>
                      <strong>{choice.label}</strong>
                      <small>{choice.description}</small>
                    </span>
                    {selected ? <CheckCircle weight="fill" /> : null}
                  </button>
                );
              })}
            </div>
            <div className="onboarding-summary">
              <ShieldCheck weight="fill" />
              <p>
                主动联系每周最多 {weeklyLimit} 次，勿扰时间{" "}
                {quietStart}～{quietEnd}，召回{recall ? "已开启" : "保持关闭"}。
              </p>
            </div>
          </div>
        ) : null}

        {notice ? <div className="panel-notice error">{notice}</div> : null}
      </div>

      <div className="onboarding-actions">
        <button
          type="button"
          className="onboarding-back"
          disabled={step === 0 || busy}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
        >
          <ArrowLeft weight="bold" />
          上一步
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="onboarding-next"
            disabled={(step === 0 && !consent) || !displayName.trim()}
            onClick={() => setStep((value) => Math.min(3, value + 1))}
          >
            继续
            <ArrowRight weight="bold" />
          </button>
        ) : (
          <button
            type="button"
            className="onboarding-next"
            disabled={busy || !displayName.trim()}
            onClick={() => void finish()}
          >
            <Sparkle weight="fill" />
            {busy ? "正在建立同行…" : "开始同行"}
          </button>
        )}
      </div>
    </section>
  );
}

export function MemoriesPage({ snapshot, onRefresh }: SnapshotProps) {
  const [filter, setFilter] = useState<"all" | "choice" | "photo">("all");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const memories = snapshot.memories.filter(
    (memory) => filter === "all" || memory.type === filter,
  );

  async function toggleMemoryEnabled() {
    setBusy("master");
    try {
      await updateCompanionProfile({
        memory_enabled: !snapshot.profile.memory_enabled,
      });
      await onRefresh();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function patchMemory(
    memory: MemoryRecord,
    reusable: boolean,
  ) {
    setBusy(memory.id);
    try {
      await updateMemory(memory.id, {
        reusable_by_character: reusable,
      });
      await onRefresh();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function removeMemory(memory: MemoryRecord) {
    if (!window.confirm(`确定删除“${memory.title}”吗？删除后无法恢复。`)) return;
    setBusy(memory.id);
    try {
      await deleteMemory(memory.id);
      await onRefresh();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function clearMemories() {
    if (!window.confirm("确定清空全部共同记忆吗？此操作无法撤销。")) return;
    setBusy("clear");
    try {
      await Promise.all(snapshot.memories.map((memory) => deleteMemory(memory.id)));
      await onRefresh();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function downloadExport() {
    const payload = await exportCompanionData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hardware-pi-companion-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  return (
    <section className="album-panel embedded" aria-label="共同旅行相册">
      <header className="panel-section-header">
        <div>
          <span className="eyebrow">SHARED JOURNEY ALBUM</span>
          <h2>共同旅行相册</h2>
          <p>只保存你明确确认的选择和照片。</p>
        </div>
        <BookOpenText weight="duotone" />
      </header>
      <div className="album-privacy-bar">
        <span>
          <ShieldCheck weight="fill" />
          <span>
            <strong>长期记忆</strong>
            <small>
              {snapshot.profile.memory_enabled
                ? "三月七可以引用你允许的记忆"
                : "现有记录保留，但不会提供给模型"}
            </small>
          </span>
        </span>
        <button
          disabled={Boolean(busy)}
          className={snapshot.profile.memory_enabled ? "active" : ""}
          onClick={() => void toggleMemoryEnabled()}
        >
          {snapshot.profile.memory_enabled ? "已开启" : "已关闭"}
        </button>
      </div>
      <div className="album-filters">
        {([
          ["all", "全部"],
          ["choice", "同行选择"],
          ["photo", "照片"],
        ] as const).map(([value, label]) => (
          <button
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {notice ? <div className="panel-notice">{notice}</div> : null}
      <div className="album-memory-list">
        {memories.map((memory) => (
          <article className="memory-card" key={memory.id}>
            <div className="memory-visual">
              {memory.type === "photo" ? (
                <Camera weight="duotone" />
              ) : (
                <Footprints weight="duotone" />
              )}
              <span>{memory.type === "photo" ? "共同照片" : "同行选择"}</span>
            </div>
            <div className="memory-card-content">
              <div className="memory-card-meta">
                <time>{formatDate(memory.created_at)}</time>
                {memory.user_confirmed ? (
                  <span className="confirmed-memory">
                    <CheckCircle weight="fill" />
                    已确认
                  </span>
                ) : null}
              </div>
              <h3>{memory.title}</h3>
              <p>{memory.summary}</p>
              {memory.character_text ? <blockquote>{memory.character_text}</blockquote> : null}
              <div className="memory-card-actions">
                <button
                  className={`memory-reference-toggle ${
                    memory.reusable_by_character ? "active" : ""
                  }`}
                  disabled={busy === memory.id}
                  onClick={() =>
                    void patchMemory(memory, !memory.reusable_by_character)
                  }
                >
                  <ShieldCheck weight="fill" />
                  {memory.reusable_by_character ? "允许未来引用" : "不再引用"}
                </button>
                <button
                  className="memory-delete-button"
                  disabled={busy === memory.id}
                  aria-label={`删除 ${memory.title}`}
                  onClick={() => void removeMemory(memory)}
                >
                  <Trash />
                </button>
              </div>
            </div>
          </article>
        ))}
        {!memories.length ? (
          <div className="album-empty">
            <Camera weight="duotone" />
            <strong>还没有这一类共同记忆</strong>
            <p>点左侧“拍照”可以保存一张新的共同照片。</p>
          </div>
        ) : null}
      </div>
      <footer className="album-footer">
        <button className="album-export-button" onClick={() => void downloadExport()}>
          <DownloadSimple />
          导出同行数据
        </button>
        <button
          className="album-clear-button"
          disabled={!snapshot.memories.length || busy === "clear"}
          onClick={() => void clearMemories()}
        >
          <Trash />
          清空相册
        </button>
      </footer>
    </section>
  );
}

export function CommunicationsPage({ snapshot, onRefresh }: SnapshotProps) {
  const [selectedId, setSelectedId] = useState(
    snapshot.communications[0]?.id ?? "",
  );
  const [filter, setFilter] = useState<"all" | "unread" | "favorite">("all");
  const [notice, setNotice] = useState("");
  const [scanning, setScanning] = useState(false);
  const markedRead = useRef(new Set<string>());
  const selected = snapshot.communications.find(
    (message) => message.id === selectedId,
  );
  const messages = useMemo(
    () =>
      snapshot.communications.filter((message) => {
        if (filter === "unread") return !message.read_at;
        if (filter === "favorite") return message.favorite;
        return true;
      }),
    [filter, snapshot.communications],
  );

  useEffect(() => {
    if (!selected || selected.read_at || markedRead.current.has(selected.id)) return;
    markedRead.current.add(selected.id);
    void updateCommunication(selected.id, { read: true })
      .then(onRefresh)
      .catch((error) => setNotice((error as Error).message));
  }, [onRefresh, selected]);

  async function patch(
    message: Communication,
    input: Parameters<typeof updateCommunication>[1],
  ) {
    try {
      await updateCommunication(message.id, input);
      await onRefresh();
    } catch (error) {
      setNotice((error as Error).message);
    }
  }

  async function scan() {
    setScanning(true);
    setNotice("");
    try {
      const result = await scanReleaseQueue();
      await onRefresh();
      const processing = result.processing;
      setNotice(
        `检查完成：发送 ${processing.delivered}，延后 ${processing.deferred}，拒绝 ${processing.rejected}`,
      );
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="communication-panel embedded" aria-label="角色通信中心">
      <header className="panel-section-header">
        <div>
          <span className="eyebrow">CHARACTER COMMUNICATION</span>
          <h2>角色通信中心</h2>
          <p>只展示已经审核并发送的角色消息。</p>
        </div>
        <EnvelopeSimple weight="duotone" />
      </header>
      <div className="release-queue-status">
        <span>
          <strong>{snapshot.release_delivery.counts.queued}</strong>
          等待
        </span>
        <span>
          <strong>{snapshot.release_delivery.counts.deferred}</strong>
          因联系策略延后
        </span>
        <span>
          <strong>{snapshot.release_delivery.counts.delivered}</strong>
          已发送
        </span>
        <span>
          <strong>{snapshot.release_delivery.counts.rejected}</strong>
          审核拒绝
        </span>
        <button disabled={scanning} onClick={() => void scan()}>
          <ArrowsClockwise className={scanning ? "spinning" : ""} />
          {scanning ? "正在检查" : "检查发行队列"}
        </button>
      </div>
      <div className="communication-filters">
        {(["all", "unread", "favorite"] as const).map((value) => (
          <button
            className={filter === value ? "active" : ""}
            key={value}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "全部" : value === "unread" ? "未读" : "收藏"}
          </button>
        ))}
      </div>
      {notice ? <div className="panel-notice error">{notice}</div> : null}
      <div className="communication-body">
        <div className="communication-list">
          {messages.map((message) => (
            <button
              className={`communication-list-item ${
                !message.read_at ? "unread" : ""
              } ${selectedId === message.id ? "active" : ""}`}
              key={message.id}
              onClick={() => setSelectedId(message.id)}
            >
              <span className="communication-list-meta">
                <EnvelopeSimple weight="fill" />
                {contentLabels[message.type]}
                {message.favorite ? <Star weight="fill" /> : null}
              </span>
              <strong>{message.title}</strong>
              <time>{formatDate(message.created_at)}</time>
            </button>
          ))}
          {!messages.length ? (
            <div className="communication-list-empty">这个筛选下没有消息。</div>
          ) : null}
        </div>
        <article className="communication-detail">
          {selected ? (
            <>
              <span className="eyebrow">{contentLabels[selected.type]}</span>
              <h3>{selected.title}</h3>
              <time>{formatDate(selected.created_at)}</time>
              <p>{selected.body}</p>
              <div className="communication-actions">
                <button
                  className={selected.liked ? "active" : ""}
                  onClick={() => void patch(selected, { liked: !selected.liked })}
                >
                  <Heart weight={selected.liked ? "fill" : "regular"} />
                  {selected.liked ? "已喜欢" : "喜欢"}
                </button>
                <button
                  className={selected.favorite ? "active" : ""}
                  onClick={() =>
                    void patch(selected, { favorite: !selected.favorite })
                  }
                >
                  <Star weight={selected.favorite ? "fill" : "regular"} />
                  {selected.favorite ? "已收藏" : "收藏"}
                </button>
                <button
                  className={selected.remind_later ? "active" : ""}
                  onClick={() =>
                    void patch(selected, {
                      remind_later: !selected.remind_later,
                    })
                  }
                >
                  <Bell weight={selected.remind_later ? "fill" : "regular"} />
                  稍后再看
                </button>
              </div>
              <footer>
                审核状态：{selected.review_status}
                {selected.delivery_mode === "proactive"
                  ? ` · ${selected.review_mode === "hybrid" ? "模型 + 本地规则" : "本地规则降级"}`
                  : ""}
                {" · "}数据保存在 Orange Pi
              </footer>
            </>
          ) : (
            <div className="communication-detail-empty">选择一封通信查看内容。</div>
          )}
        </article>
      </div>
    </section>
  );
}

export function RelationshipPage({
  snapshot,
  onRefresh,
  onDeleted,
}: SnapshotProps & { onDeleted: (snapshot: CompanionSnapshot) => void }) {
  const [profile, setProfile] = useState(snapshot.profile);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => setProfile(snapshot.profile), [snapshot.profile]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setNotice("");
    try {
      await updateCompanionProfile({
        display_name: profile.display_name,
        proactive_contact_enabled: profile.proactive_contact_enabled,
        recall_enabled: profile.recall_enabled,
        personalization_enabled: profile.personalization_enabled,
        memory_enabled: profile.memory_enabled,
        quiet_hours: profile.quiet_hours,
        weekly_contact_limit: profile.weekly_contact_limit,
        paused: profile.paused,
      });
      await onRefresh();
      setNotice("同行设置已保存");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function downloadExport() {
    const payload = await exportCompanionData();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hardware-pi-companion-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  async function deleteAll() {
    if (
      !window.confirm(
        "确定删除全部同行资料、记忆和通信吗？API 配置不会被删除。",
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      onDeleted(await deleteCompanionData());
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function importLegacy(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setNotice("导入文件不能超过 5 MB");
      return;
    }
    if (
      !window.confirm(
        "将正式桌面版 v4 导出合并到当前 Pi。不会导入 API Key、自由聊天、Campaign 后台数据或执行日志；同一记录不会重复写入。继续吗？",
      )
    ) {
      if (importInput.current) importInput.current.value = "";
      return;
    }
    setBusy("import");
    setNotice("");
    try {
      const payload = JSON.parse(await file.text());
      const result = await importCompanionData(payload);
      await onRefresh();
      setNotice(
        `导入完成：记忆 ${result.imported.memories} 条，通信 ${result.imported.communications} 条`,
      );
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
      if (importInput.current) importInput.current.value = "";
    }
  }

  return (
    <section className="companion-settings-panel embedded" aria-label="同行设置">
      <header className="panel-section-header">
        <div>
          <span className="eyebrow">COMPANION CONTROL</span>
          <h2>同行设置</h2>
          <p>所有授权都可以随时调整。</p>
        </div>
        <SlidersIcon />
      </header>
      <form className="companion-settings-scroll" onSubmit={save}>
        <div className={`companion-status-card ${profile.paused ? "paused" : ""}`}>
          {profile.paused ? (
            <PauseCircle weight="fill" />
          ) : (
            <PlayCircle weight="fill" />
          )}
          <span>
            <strong>{profile.paused ? "角色同行已暂停" : "角色同行正在运行"}</strong>
            <small>
              {profile.paused
                ? "记忆和个性化上下文不会提供给模型"
                : `已有 ${snapshot.counts.memories} 条共同记忆`}
            </small>
          </span>
          <button
            type="button"
            onClick={() => setProfile({ ...profile, paused: !profile.paused })}
          >
            {profile.paused ? "恢复" : "暂停"}
          </button>
        </div>

        <label className="companion-setting-field">
          角色对你的称呼
          <input
            value={profile.display_name}
            maxLength={24}
            onChange={(event) =>
              setProfile({ ...profile, display_name: event.target.value })
            }
          />
        </label>

        <ToggleRow
          label="允许主动联系"
          detail="关闭后只响应你的主动操作"
          checked={profile.proactive_contact_enabled}
          onChange={(checked) =>
            setProfile({ ...profile, proactive_contact_enabled: checked })
          }
        />

        <div className="companion-setting-time-grid">
          <label>
            每周主动上限
            <select
              value={profile.weekly_contact_limit}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  weekly_contact_limit: Number(event.target.value),
                })
              }
            >
              {[0, 1, 2, 3, 4, 5, 6, 7].map((value) => (
                <option key={value} value={value}>{value} 次</option>
              ))}
            </select>
          </label>
          <label>
            勿扰开始
            <input
              type="time"
              value={profile.quiet_hours.start}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  quiet_hours: {
                    ...profile.quiet_hours,
                    start: event.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            勿扰结束
            <input
              type="time"
              value={profile.quiet_hours.end}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  quiet_hours: {
                    ...profile.quiet_hours,
                    end: event.target.value,
                  },
                })
              }
            />
          </label>
        </div>

        <div className="companion-setting-toggle-grid">
          <ToggleRow
            label="有限个性化"
            detail="使用称呼和已授权资料"
            checked={profile.personalization_enabled}
            onChange={(checked) =>
              setProfile({ ...profile, personalization_enabled: checked })
            }
          />
          <ToggleRow
            label="长期记忆"
            detail="允许引用已确认记忆"
            checked={profile.memory_enabled}
            onChange={(checked) =>
              setProfile({ ...profile, memory_enabled: checked })
            }
          />
          <ToggleRow
            label="低频召回"
            detail="需要单独授权"
            checked={profile.recall_enabled}
            onChange={(checked) =>
              setProfile({ ...profile, recall_enabled: checked })
            }
          />
        </div>

        {notice ? <div className="panel-notice">{notice}</div> : null}
        <button className="companion-save-settings" disabled={Boolean(busy)}>
          {busy === "save" ? "保存中…" : "保存同行设置"}
        </button>

        <section className="companion-danger-zone">
          <strong>数据管理</strong>
          <p>导出不包含 API Key；删除后无法恢复，但不会删除模型配置。</p>
          <div>
            <input
              ref={importInput}
              className="legacy-import-input"
              type="file"
              accept="application/json,.json"
              onChange={(event) =>
                void importLegacy(event.target.files?.[0])
              }
            />
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => importInput.current?.click()}
            >
              <Database />
              {busy === "import" ? "导入中" : "导入正式版 v4"}
            </button>
            <button type="button" onClick={() => void downloadExport()}>
              <DownloadSimple />
              导出数据
            </button>
            <button type="button" onClick={() => void deleteAll()}>
              <Trash />
              删除全部
            </button>
          </div>
        </section>
      </form>
    </section>
  );
}

function ToggleRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="companion-setting-toggle">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function SlidersIcon() {
  return <ShieldCheck weight="duotone" />;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
