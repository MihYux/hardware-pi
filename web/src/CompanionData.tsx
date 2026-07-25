import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  completeOnboarding,
  createMemory,
  deleteCompanionData,
  deleteMemory,
  exportCompanionData,
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
  ["take_photos", "多拍照片", "把漂亮的风景收进共同相册"],
  ["explore_places", "探索新地方", "一起看看没有到过的地方"],
  ["hear_stories", "听新故事", "记住旅途中遇见的人和事"],
  ["walk_slowly", "慢慢同行", "不赶路，也不催促彼此"],
] as const;

const contentLabels: Record<ContentType, string> = {
  daily: "日常",
  photo: "照片",
  postcard: "明信片",
  relationship: "同行",
  version_preheat: "版本预热",
  version_launch: "版本上线",
  version_sustain: "版本持续",
  recall: "低频召回",
};

export function Onboarding({
  onComplete,
}: {
  onComplete: (snapshot: CompanionSnapshot) => void;
}) {
  const [displayName, setDisplayName] = useState("开拓者");
  const [firstChoice, setFirstChoice] =
    useState<(typeof firstChoices)[number][0]>("take_photos");
  const [proactive, setProactive] = useState(false);
  const [memory, setMemory] = useState(true);
  const [personalization, setPersonalization] = useState(true);
  const [acceptedConcept, setAcceptedConcept] = useState(false);
  const [acceptedData, setAcceptedData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const snapshot = await completeOnboarding({
        display_name: displayName.trim(),
        region: "china",
        language: "zh-CN",
        time_zone: "Asia/Shanghai",
        allowed_content_types: ["daily", "photo", "postcard", "relationship"],
        proactive_contact_enabled: proactive,
        recall_enabled: false,
        personalization_enabled: personalization,
        memory_enabled: memory,
        quiet_hours: { start: "22:00", end: "09:00" },
        weekly_contact_limit: 2,
        accepted_concept: acceptedConcept,
        accepted_data_flow: acceptedData,
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
    <section className="data-page onboarding-page">
      <div className="onboarding-intro">
        <span className="eyebrow">FIRST CONNECTION</span>
        <h1>先决定怎样同行。</h1>
        <p>
          这是运行在你自己 Orange Pi 上的概念体验。模型请求只在你主动聊天或允许的功能中发生，
          API Key 始终保留在 Pi。
        </p>
        <div className="privacy-stack">
          <span>01 · 你可以随时暂停同行</span>
          <span>02 · 每条记忆都能关闭引用或删除</span>
          <span>03 · 可导出并删除全部同行数据</span>
        </div>
      </div>

      <form className="onboarding-form data-card" onSubmit={submit}>
        <label>
          <span>希望三月七怎样称呼你</span>
          <input
            value={displayName}
            maxLength={24}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>

        <fieldset>
          <legend>第一次同行想做什么</legend>
          <div className="choice-grid">
            {firstChoices.map(([value, label, detail]) => (
              <label className={`choice-card ${firstChoice === value ? "selected" : ""}`} key={value}>
                <input
                  type="radio"
                  name="first-choice"
                  value={value}
                  checked={firstChoice === value}
                  onChange={() => setFirstChoice(value)}
                  disabled={!memory}
                />
                <strong>{label}</strong>
                <small>{detail}</small>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="setting-list">
          <Toggle
            label="长期记忆"
            detail="只引用你明确确认、且允许引用的记忆"
            checked={memory}
            onChange={setMemory}
          />
          <Toggle
            label="个性化陪伴"
            detail="允许使用称呼和已授权记忆调整回复"
            checked={personalization}
            onChange={setPersonalization}
          />
          <Toggle
            label="主动联系"
            detail="当前只保存偏好，完整联系策略将在下一阶段启用"
            checked={proactive}
            onChange={setProactive}
          />
        </div>

        <label className="consent-row">
          <input
            type="checkbox"
            checked={acceptedConcept}
            onChange={(event) => setAcceptedConcept(event.target.checked)}
          />
          <span>我知道这是非官方概念体验，并可随时退出。</span>
        </label>
        <label className="consent-row">
          <input
            type="checkbox"
            checked={acceptedData}
            onChange={(event) => setAcceptedData(event.target.checked)}
          />
          <span>我知道聊天内容会发送给控制面板中选定的模型服务。</span>
        </label>

        {notice ? <div className="inline-notice">{notice}</div> : null}
        <button
          className="primary-action"
          disabled={
            busy ||
            !displayName.trim() ||
            !acceptedConcept ||
            !acceptedData
          }
        >
          {busy ? "正在建立同行…" : "开始同行"}
        </button>
      </form>
    </section>
  );
}

export function MemoriesPage({ snapshot, onRefresh }: SnapshotProps) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function addMemory(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setNotice("");
    try {
      await createMemory({
        type: "photo",
        title: title.trim(),
        summary: summary.trim(),
        reusable_by_character: true,
        user_confirmed: true,
      });
      setTitle("");
      setSummary("");
      await onRefresh();
      setNotice("这段共同记忆已经保存在 Pi");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function patchMemory(
    memory: MemoryRecord,
    patch: Partial<MemoryRecord>,
  ) {
    setBusy(memory.id);
    try {
      await updateMemory(memory.id, patch);
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

  return (
    <section className="data-page">
      <header className="data-header">
        <div>
          <span className="eyebrow">SHARED MEMORY</span>
          <h1>共同旅行相册</h1>
          <p>
            当前保存 {snapshot.counts.memories} 条记忆。只有“允许引用”且已确认的内容会进入模型上下文。
          </p>
        </div>
        <span className={`memory-master ${snapshot.profile.memory_enabled ? "enabled" : ""}`}>
          {snapshot.profile.memory_enabled ? "记忆引用已开启" : "记忆引用已关闭"}
        </span>
      </header>

      <form className="memory-create data-card" onSubmit={addMemory}>
        <div>
          <span className="eyebrow">NEW MEMORY</span>
          <h2>记下一张今天的照片</h2>
        </div>
        <label>
          <span>标题</span>
          <input
            value={title}
            maxLength={80}
            placeholder="例如：第一次在手机上见面"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          <span>发生了什么</span>
          <textarea
            value={summary}
            maxLength={500}
            rows={3}
            placeholder="这段文字会作为共同记忆保存"
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <button
          className="primary-action"
          disabled={busy === "create" || !title.trim() || !summary.trim()}
        >
          {busy === "create" ? "保存中…" : "保存共同记忆"}
        </button>
      </form>

      {notice ? <div className="control-notice">{notice}</div> : null}

      <div className="memory-grid">
        {snapshot.memories.map((memory) => (
          <article className="memory-card data-card" key={memory.id}>
            <header>
              <span>{memory.type === "choice" ? "同行选择" : "共同照片"}</span>
              <time>{formatDate(memory.created_at)}</time>
            </header>
            <h2>{memory.title}</h2>
            <p>{memory.summary}</p>
            {memory.character_text ? <blockquote>{memory.character_text}</blockquote> : null}
            <div className="memory-actions">
              <label>
                <input
                  type="checkbox"
                  checked={memory.reusable_by_character}
                  disabled={busy === memory.id}
                  onChange={(event) =>
                    void patchMemory(memory, {
                      reusable_by_character: event.target.checked,
                    })
                  }
                />
                允许三月七引用
              </label>
              <button
                className="danger-link"
                disabled={busy === memory.id}
                onClick={() => void removeMemory(memory)}
              >
                删除
              </button>
            </div>
          </article>
        ))}
        {!snapshot.memories.length ? (
          <div className="data-empty">还没有共同记忆。你可以从上方添加第一张照片。</div>
        ) : null}
      </div>
    </section>
  );
}

export function CommunicationsPage({ snapshot, onRefresh }: SnapshotProps) {
  const [selectedId, setSelectedId] = useState(
    snapshot.communications[0]?.id ?? "",
  );
  const [filter, setFilter] = useState<"all" | "unread" | "favorite">("all");
  const [notice, setNotice] = useState("");
  const selected = snapshot.communications.find(
    (item) => item.id === selectedId,
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
    const message = snapshot.communications.find(
      (item) => item.id === selectedId,
    );
    if (!message || message.read_at) return;
    void updateCommunication(message.id, { read: true })
      .then(onRefresh)
      .catch((error) => setNotice((error as Error).message));
  }, [onRefresh, selectedId, snapshot.communications]);

  async function patch(
    message: Communication,
    input: Parameters<typeof updateCommunication>[1],
  ) {
    setNotice("");
    try {
      await updateCommunication(message.id, input);
      await onRefresh();
    } catch (error) {
      setNotice((error as Error).message);
    }
  }

  async function selectMessage(message: Communication) {
    setSelectedId(message.id);
    if (!message.read_at) await patch(message, { read: true });
  }

  return (
    <section className="data-page">
      <header className="data-header">
        <div>
          <span className="eyebrow">CHARACTER COMMUNICATION</span>
          <h1>角色通信中心</h1>
          <p>这里只展示已经通过审核并发送给玩家的角色消息。</p>
        </div>
        <span className="unread-counter">{snapshot.counts.unread_communications} 未读</span>
      </header>

      {notice ? <div className="control-notice">{notice}</div> : null}

      <div className="communications-layout">
        <aside className="message-index data-card">
          <div className="filter-row">
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
          {messages.map((message) => (
            <button
              className={`message-index-item ${selectedId === message.id ? "active" : ""}`}
              key={message.id}
              onClick={() => void selectMessage(message)}
            >
              <span>
                {!message.read_at ? <i /> : null}
                {contentLabels[message.type]}
              </span>
              <strong>{message.title}</strong>
              <small>{formatDate(message.created_at)}</small>
            </button>
          ))}
          {!messages.length ? <div className="data-empty">这个筛选下没有消息。</div> : null}
        </aside>

        <article className="message-detail data-card">
          {selected ? (
            <>
              <span className="eyebrow">{contentLabels[selected.type]}</span>
              <h2>{selected.title}</h2>
              <time>{formatDate(selected.created_at)}</time>
              <p>{selected.body}</p>
              <div className="message-actions">
                <button
                  className={selected.liked ? "active" : ""}
                  onClick={() => void patch(selected, { liked: !selected.liked })}
                >
                  {selected.liked ? "已喜欢" : "喜欢"}
                </button>
                <button
                  className={selected.favorite ? "active" : ""}
                  onClick={() => void patch(selected, { favorite: !selected.favorite })}
                >
                  {selected.favorite ? "已收藏" : "收藏"}
                </button>
                <button
                  className={selected.remind_later ? "active" : ""}
                  onClick={() =>
                    void patch(selected, { remind_later: !selected.remind_later })
                  }
                >
                  {selected.remind_later ? "已稍后看" : "稍后再看"}
                </button>
              </div>
              <footer>审核状态：{selected.review_status} · 消息保存在 Orange Pi</footer>
            </>
          ) : (
            <div className="data-empty">从左侧选择一封通信。</div>
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
      setNotice("同行设置已保存在 Pi");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function downloadExport() {
    setBusy("export");
    try {
      const payload = await exportCompanionData();
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hardware-pi-companion-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("同行数据已导出；API Key 和聊天记录不在导出内容中");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function deleteAll() {
    if (
      !window.confirm(
        "确定删除全部同行资料、记忆和通信吗？API 配置不会被删除，但此操作无法撤销。",
      )
    ) {
      return;
    }
    setBusy("delete");
    try {
      const reset = await deleteCompanionData();
      onDeleted(reset);
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="data-page">
      <header className="data-header">
        <div>
          <span className="eyebrow">RELATIONSHIP CONTROL</span>
          <h1>同行设置</h1>
          <p>暂停不会删除任何资料；关闭记忆后，现有记忆保留但不会提供给模型。</p>
        </div>
        <span className={`relationship-state ${profile.paused ? "paused" : ""}`}>
          {profile.paused ? "同行已暂停" : "同行中"}
        </span>
      </header>

      <form className="relationship-grid" onSubmit={save}>
        <section className="data-card setting-section">
          <h2>基本资料</h2>
          <label>
            <span>称呼</span>
            <input
              value={profile.display_name}
              maxLength={24}
              onChange={(event) =>
                setProfile({ ...profile, display_name: event.target.value })
              }
            />
          </label>
          <div className="time-grid">
            <label>
              <span>勿扰开始</span>
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
              <span>勿扰结束</span>
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
          <label>
            <span>每周主动联系上限：{profile.weekly_contact_limit} 次</span>
            <input
              type="range"
              min={0}
              max={7}
              value={profile.weekly_contact_limit}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  weekly_contact_limit: Number(event.target.value),
                })
              }
            />
          </label>
        </section>

        <section className="data-card setting-section">
          <h2>授权与关系</h2>
          <Toggle
            label="个性化陪伴"
            detail="允许使用称呼和已授权资料"
            checked={profile.personalization_enabled}
            onChange={(checked) =>
              setProfile({ ...profile, personalization_enabled: checked })
            }
          />
          <Toggle
            label="长期记忆"
            detail="允许引用已确认的共同记忆"
            checked={profile.memory_enabled}
            onChange={(checked) =>
              setProfile({ ...profile, memory_enabled: checked })
            }
          />
          <Toggle
            label="主动联系"
            detail="下一阶段启用完整的频率与勿扰执行策略"
            checked={profile.proactive_contact_enabled}
            onChange={(checked) =>
              setProfile({ ...profile, proactive_contact_enabled: checked })
            }
          />
          <Toggle
            label="暂停同行"
            detail="暂停个性化和记忆引用，不删除数据"
            checked={profile.paused}
            onChange={(checked) => setProfile({ ...profile, paused: checked })}
          />
        </section>

        {notice ? <div className="control-notice relationship-notice">{notice}</div> : null}
        <div className="relationship-actions">
          <button className="primary-action" disabled={Boolean(busy)}>
            {busy === "save" ? "保存中…" : "保存同行设置"}
          </button>
          <button type="button" className="secondary-action" onClick={() => void downloadExport()}>
            导出同行数据
          </button>
          <button type="button" className="danger-action" onClick={() => void deleteAll()}>
            删除全部同行数据
          </button>
        </div>
      </form>
    </section>
  );
}

function Toggle({
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
    <label className="setting-toggle">
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <span className="switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span />
      </span>
    </label>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
