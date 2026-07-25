from __future__ import annotations

import json
import hashlib
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from .models import (
    CommunicationPatch,
    CompanionProfilePatch,
    MemoryCreate,
    MemoryPatch,
    OnboardingRequest,
)
from .safety import review_output


FIRST_JOIN_CHOICES = {
    "take_photos": (
        "想和三月七拍下更多风景",
        "下一次一起旅行时，想拍很多照片。",
        "说好啦，下次碰见漂亮的风景，咱可要拉着你多拍几张！",
    ),
    "explore_places": (
        "想和三月七探索新地方",
        "下一次一起旅行时，想探索没有去过的新地方。",
        "探索新地方？这可太对咱胃口了。到时候谁先喊累谁就负责请果汁！",
    ),
    "hear_stories": (
        "想和三月七听更多故事",
        "下一次一起旅行时，想听一路上遇见的新故事。",
        "好呀，故事可不能只听一半。等咱们遇见有意思的人，就一起把后续问清楚！",
    ),
    "walk_slowly": (
        "想和三月七慢慢同行",
        "下一次一起旅行时，想什么都不赶，慢慢走。",
        "慢慢走也挺好嘛。重要的不是赶多远，是咱们真的一起走过。",
    ),
}
CONTENT_TYPES = {
    "daily",
    "photo",
    "postcard",
    "relationship",
    "version_preheat",
    "version_launch",
    "version_sustain",
    "recall",
}
MEMORY_TYPES = {
    "choice",
    "photo",
    "postcard",
    "milestone",
    "version",
    "return",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def legacy_id(kind: str, value: object) -> str:
    digest = hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:20]
    return f"legacy-v4-{kind}-{digest}"


def valid_iso(value: object, fallback: str) -> str:
    if not isinstance(value, str) or len(value) > 40:
        return fallback
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return fallback
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def bounded_int(
    value: object,
    minimum: int,
    maximum: int,
    fallback: int,
) -> int:
    if isinstance(value, bool):
        return fallback
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return min(maximum, max(minimum, parsed))


def safe_visible(value: object, maximum: int) -> str:
    clean = str(value or "").strip()[:maximum]
    if not clean or review_output(clean) != clean:
        return ""
    return clean


class CompanionStore:
    def __init__(self, data_dir: Path):
        self.path = data_dir / "hardware-pi.db"
        self._lock = threading.RLock()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock, self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS companion_profile (
                    id TEXT PRIMARY KEY CHECK (id = 'primary'),
                    display_name TEXT NOT NULL,
                    region TEXT NOT NULL,
                    language TEXT NOT NULL,
                    time_zone TEXT NOT NULL,
                    allowed_content_types TEXT NOT NULL,
                    reduced_content_types TEXT NOT NULL DEFAULT '[]',
                    proactive_contact_enabled INTEGER NOT NULL,
                    recall_enabled INTEGER NOT NULL,
                    personalization_enabled INTEGER NOT NULL,
                    memory_enabled INTEGER NOT NULL,
                    quiet_start TEXT NOT NULL,
                    quiet_end TEXT NOT NULL,
                    weekly_contact_limit INTEGER NOT NULL,
                    onboarding_completed INTEGER NOT NULL,
                    consent_version TEXT NOT NULL,
                    paused INTEGER NOT NULL,
                    quiet_until TEXT,
                    joined_at TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    character_text TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    reusable_by_character INTEGER NOT NULL,
                    user_confirmed INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS communications (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    review_status TEXT NOT NULL,
                    sent_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    read_at TEXT,
                    favorite INTEGER NOT NULL,
                    liked INTEGER NOT NULL,
                    remind_later INTEGER NOT NULL,
                    action_kind TEXT NOT NULL,
                    action_target_id TEXT,
                    delivery_mode TEXT NOT NULL DEFAULT 'system',
                    template_id TEXT NOT NULL DEFAULT '',
                    source_delivery_id TEXT NOT NULL DEFAULT '',
                    review_mode TEXT NOT NULL DEFAULT 'local_rules',
                    review_reason TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS release_deliveries (
                    delivery_id TEXT PRIMARY KEY,
                    checksum TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    last_reason TEXT NOT NULL DEFAULT '',
                    next_attempt_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    delivered_at TEXT
                );

                CREATE TABLE IF NOT EXISTS companion_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    action TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS memories_created
                ON memories(created_at DESC);
                CREATE INDEX IF NOT EXISTS communications_created
                ON communications(created_at DESC);
                CREATE INDEX IF NOT EXISTS release_delivery_queue
                ON release_deliveries(status, next_attempt_at);
                """
            )
            self._ensure_column(
                connection,
                "companion_profile",
                "reduced_content_types",
                "TEXT NOT NULL DEFAULT '[]'",
            )
            self._ensure_column(
                connection,
                "companion_profile",
                "quiet_until",
                "TEXT",
            )
            self._ensure_column(
                connection,
                "communications",
                "delivery_mode",
                "TEXT NOT NULL DEFAULT 'system'",
            )
            self._ensure_column(
                connection,
                "communications",
                "template_id",
                "TEXT NOT NULL DEFAULT ''",
            )
            self._ensure_column(
                connection,
                "communications",
                "source_delivery_id",
                "TEXT NOT NULL DEFAULT ''",
            )
            self._ensure_column(
                connection,
                "communications",
                "review_mode",
                "TEXT NOT NULL DEFAULT 'local_rules'",
            )
            self._ensure_column(
                connection,
                "communications",
                "review_reason",
                "TEXT NOT NULL DEFAULT ''",
            )
            self._ensure_profile(connection)

    @staticmethod
    def _ensure_column(
        connection: sqlite3.Connection,
        table: str,
        column: str,
        declaration: str,
    ) -> None:
        existing = {
            row["name"]
            for row in connection.execute(
                f"PRAGMA table_info({table})"
            ).fetchall()
        }
        if column not in existing:
            connection.execute(
                f"ALTER TABLE {table} ADD COLUMN {column} {declaration}"
            )

    def _ensure_profile(self, connection: sqlite3.Connection) -> None:
        now = utc_now()
        connection.execute(
            """
            INSERT OR IGNORE INTO companion_profile(
                id, display_name, region, language, time_zone,
                allowed_content_types, reduced_content_types,
                proactive_contact_enabled,
                recall_enabled, personalization_enabled, memory_enabled,
                quiet_start, quiet_end, weekly_contact_limit,
                onboarding_completed, consent_version, paused, quiet_until,
                joined_at,
                updated_at
            ) VALUES (
                'primary', '开拓者', 'china', 'zh-CN', 'Asia/Shanghai',
                '["daily","photo","postcard","relationship"]', '[]',
                0, 0, 1, 1, '22:00', '09:00', 2, 0, '', 0,
                NULL, NULL, ?
            )
            """,
            (now,),
        )

    def _audit(
        self,
        connection: sqlite3.Connection,
        action: str,
        target_id: str = "primary",
    ) -> None:
        connection.execute(
            "INSERT INTO companion_audit(action, target_id, created_at) "
            "VALUES (?, ?, ?)",
            (action, target_id, utc_now()),
        )

    @staticmethod
    def _profile_dict(row: sqlite3.Row) -> dict:
        return {
            "display_name": row["display_name"],
            "region": row["region"],
            "language": row["language"],
            "time_zone": row["time_zone"],
            "allowed_content_types": json.loads(
                row["allowed_content_types"]
            ),
            "reduced_content_types": json.loads(
                row["reduced_content_types"]
            ),
            "proactive_contact_enabled": bool(
                row["proactive_contact_enabled"]
            ),
            "recall_enabled": bool(row["recall_enabled"]),
            "personalization_enabled": bool(
                row["personalization_enabled"]
            ),
            "memory_enabled": bool(row["memory_enabled"]),
            "quiet_hours": {
                "start": row["quiet_start"],
                "end": row["quiet_end"],
            },
            "weekly_contact_limit": row["weekly_contact_limit"],
            "onboarding_completed": bool(row["onboarding_completed"]),
            "consent_version": row["consent_version"],
            "paused": bool(row["paused"]),
            "quiet_until": row["quiet_until"],
            "joined_at": row["joined_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _memory_dict(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "type": row["type"],
            "title": row["title"],
            "summary": row["summary"],
            "character_text": row["character_text"],
            "source_type": row["source_type"],
            "reusable_by_character": bool(
                row["reusable_by_character"]
            ),
            "user_confirmed": bool(row["user_confirmed"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    @staticmethod
    def _communication_dict(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "type": row["type"],
            "title": row["title"],
            "body": row["body"],
            "review_status": row["review_status"],
            "sent_at": row["sent_at"],
            "created_at": row["created_at"],
            "read_at": row["read_at"],
            "favorite": bool(row["favorite"]),
            "liked": bool(row["liked"]),
            "remind_later": bool(row["remind_later"]),
            "action": {
                "kind": row["action_kind"],
                "target_id": row["action_target_id"],
            },
            "delivery_mode": row["delivery_mode"],
            "template_id": row["template_id"],
            "source_delivery_id": row["source_delivery_id"],
            "review_mode": row["review_mode"],
            "review_reason": row["review_reason"],
        }

    def profile(self) -> dict:
        with self._lock, self._connect() as connection:
            self._ensure_profile(connection)
            row = connection.execute(
                "SELECT * FROM companion_profile WHERE id = 'primary'"
            ).fetchone()
        return self._profile_dict(row)

    def memories(self) -> list[dict]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM memories ORDER BY created_at DESC"
            ).fetchall()
        return [self._memory_dict(row) for row in rows]

    def communications(self) -> list[dict]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM communications
                WHERE review_status = 'approved' AND sent_at IS NOT NULL
                ORDER BY created_at DESC
                """
            ).fetchall()
        return [self._communication_dict(row) for row in rows]

    def policy_messages(self) -> list[dict]:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT * FROM communications
                WHERE review_status = 'approved' AND sent_at IS NOT NULL
                ORDER BY sent_at DESC
                """
            ).fetchall()
        return [self._communication_dict(row) for row in rows]

    def release_status(self) -> dict:
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM release_deliveries
                GROUP BY status
                """
            ).fetchall()
            recent = connection.execute(
                """
                SELECT delivery_id, status, last_reason, created_at,
                       updated_at, delivered_at
                FROM release_deliveries
                ORDER BY created_at DESC
                LIMIT 10
                """
            ).fetchall()
        counts = {
            "queued": 0,
            "deferred": 0,
            "delivered": 0,
            "rejected": 0,
        }
        for row in rows:
            counts[row["status"]] = row["count"]
        return {
            "counts": counts,
            "recent": [dict(row) for row in recent],
        }

    def snapshot(self) -> dict:
        profile = self.profile()
        memories = self.memories()
        communications = self.communications()
        return {
            "schema_version": 1,
            "profile": profile,
            "memories": memories,
            "communications": communications,
            "release_delivery": self.release_status(),
            "counts": {
                "memories": len(memories),
                "communications": len(communications),
                "unread_communications": sum(
                    not item["read_at"] for item in communications
                ),
            },
        }

    def onboard(self, request: OnboardingRequest) -> dict:
        if not request.accepted_concept or not request.accepted_data_flow:
            raise ValueError("必须确认概念体验和模型数据流说明。")
        now = utc_now()
        allowed = list(dict.fromkeys(request.allowed_content_types))
        if request.recall_enabled and "recall" not in allowed:
            allowed.append("recall")
        if not request.recall_enabled:
            allowed = [item for item in allowed if item != "recall"]
        with self._lock, self._connect() as connection:
            self._ensure_profile(connection)
            connection.execute(
                """
                UPDATE companion_profile SET
                    display_name = ?, region = ?, language = ?,
                    time_zone = ?, allowed_content_types = ?,
                    reduced_content_types = ?,
                    proactive_contact_enabled = ?, recall_enabled = ?,
                    personalization_enabled = ?, memory_enabled = ?,
                    quiet_start = ?, quiet_end = ?,
                    weekly_contact_limit = ?, onboarding_completed = 1,
                    consent_version = ?, paused = 0,
                    joined_at = COALESCE(joined_at, ?), updated_at = ?
                WHERE id = 'primary'
                """,
                (
                    request.display_name.strip(),
                    request.region,
                    request.language,
                    request.time_zone,
                    json.dumps(allowed, ensure_ascii=False),
                    json.dumps(
                        request.reduced_content_types,
                        ensure_ascii=False,
                    ),
                    int(request.proactive_contact_enabled),
                    int(request.recall_enabled),
                    int(request.personalization_enabled),
                    int(request.memory_enabled),
                    request.quiet_hours.start,
                    request.quiet_hours.end,
                    request.weekly_contact_limit,
                    request.consent_version,
                    now,
                    now,
                ),
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO communications(
                    id, type, title, body, review_status, sent_at,
                    created_at, read_at, favorite, liked, remind_later,
                    action_kind, action_target_id
                ) VALUES (
                    'message-welcome', 'relationship', '同行已经开始',
                    ?, 'approved', ?, ?, NULL, 0, 0, 0, 'none', NULL
                )
                """,
                (
                    f"{request.display_name.strip()}，欢迎登上 Hardware Pi！"
                    "从现在起，记忆和通信都由你控制，随时可以暂停、导出或删除。",
                    now,
                    now,
                ),
            )
            if request.memory_enabled and request.first_join_choice:
                title, summary, character_text = FIRST_JOIN_CHOICES[
                    request.first_join_choice
                ]
                connection.execute(
                    """
                    INSERT OR IGNORE INTO memories(
                        id, type, title, summary, character_text, source_type,
                        reusable_by_character, user_confirmed,
                        created_at, updated_at
                    ) VALUES (
                        'memory-first-join', 'choice', ?, ?, ?, 'onboarding',
                        1, 1, ?, ?
                    )
                    """,
                    (title, summary, character_text, now, now),
                )
            self._audit(connection, "onboarding.completed")
        return self.snapshot()

    def update_profile(self, patch: CompanionProfilePatch) -> dict:
        update = patch.model_dump(exclude_none=True)
        if not update:
            return self.profile()
        if (
            "recall_enabled" in update
            and "allowed_content_types" not in update
        ):
            update["allowed_content_types"] = self.profile()[
                "allowed_content_types"
            ]
        columns = {
            "display_name": "display_name",
            "region": "region",
            "language": "language",
            "time_zone": "time_zone",
            "proactive_contact_enabled": "proactive_contact_enabled",
            "recall_enabled": "recall_enabled",
            "personalization_enabled": "personalization_enabled",
            "memory_enabled": "memory_enabled",
            "weekly_contact_limit": "weekly_contact_limit",
            "paused": "paused",
            "quiet_until": "quiet_until",
        }
        assignments: list[str] = []
        values: list[object] = []
        for field, column in columns.items():
            if field not in update:
                continue
            value = update[field]
            if isinstance(value, bool):
                value = int(value)
            if isinstance(value, datetime):
                value = value.astimezone(timezone.utc).isoformat()
            assignments.append(f"{column} = ?")
            values.append(value)
        if "allowed_content_types" in update:
            allowed = list(dict.fromkeys(update["allowed_content_types"]))
            recall = update.get("recall_enabled")
            if recall is True and "recall" not in allowed:
                allowed.append("recall")
            if recall is False:
                allowed = [item for item in allowed if item != "recall"]
            assignments.append("allowed_content_types = ?")
            values.append(json.dumps(allowed, ensure_ascii=False))
        if "reduced_content_types" in update:
            reduced = list(
                dict.fromkeys(update["reduced_content_types"])
            )
            assignments.append("reduced_content_types = ?")
            values.append(json.dumps(reduced, ensure_ascii=False))
        if "quiet_hours" in update:
            quiet = update["quiet_hours"]
            assignments.extend(["quiet_start = ?", "quiet_end = ?"])
            values.extend([quiet["start"], quiet["end"]])
        assignments.append("updated_at = ?")
        values.append(utc_now())
        values.append("primary")
        with self._lock, self._connect() as connection:
            self._ensure_profile(connection)
            connection.execute(
                f"UPDATE companion_profile SET {', '.join(assignments)} "
                "WHERE id = ?",
                values,
            )
            self._audit(connection, "profile.updated")
        return self.profile()

    def create_memory(self, request: MemoryCreate) -> dict:
        memory_id = f"memory-{uuid4()}"
        now = utc_now()
        character_text = (
            request.character_text.strip()
            or "这张记忆咱收好啦！以后想起的时候，再一起聊聊。"
        )
        with self._lock, self._connect() as connection:
            profile = connection.execute(
                "SELECT onboarding_completed FROM companion_profile "
                "WHERE id = 'primary'"
            ).fetchone()
            if not profile or not profile["onboarding_completed"]:
                raise ValueError("请先完成首次进入设置。")
            connection.execute(
                """
                INSERT INTO memories(
                    id, type, title, summary, character_text, source_type,
                    reusable_by_character, user_confirmed,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?)
                """,
                (
                    memory_id,
                    request.type,
                    request.title.strip(),
                    request.summary.strip(),
                    character_text,
                    int(request.reusable_by_character),
                    int(request.user_confirmed),
                    now,
                    now,
                ),
            )
            self._audit(connection, "memory.created", memory_id)
            row = connection.execute(
                "SELECT * FROM memories WHERE id = ?", (memory_id,)
            ).fetchone()
        return self._memory_dict(row)

    def update_memory(self, memory_id: str, patch: MemoryPatch) -> dict | None:
        update = patch.model_dump(exclude_none=True)
        if not update:
            return self.get_memory(memory_id)
        allowed = {
            "title": "title",
            "summary": "summary",
            "character_text": "character_text",
            "reusable_by_character": "reusable_by_character",
            "user_confirmed": "user_confirmed",
        }
        assignments = []
        values: list[object] = []
        for field, value in update.items():
            if field not in allowed:
                continue
            if isinstance(value, bool):
                value = int(value)
            assignments.append(f"{allowed[field]} = ?")
            values.append(value)
        assignments.append("updated_at = ?")
        values.extend([utc_now(), memory_id])
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                f"UPDATE memories SET {', '.join(assignments)} WHERE id = ?",
                values,
            )
            if not cursor.rowcount:
                return None
            self._audit(connection, "memory.updated", memory_id)
            row = connection.execute(
                "SELECT * FROM memories WHERE id = ?", (memory_id,)
            ).fetchone()
        return self._memory_dict(row)

    def get_memory(self, memory_id: str) -> dict | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM memories WHERE id = ?", (memory_id,)
            ).fetchone()
        return self._memory_dict(row) if row else None

    def delete_memory(self, memory_id: str) -> bool:
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM memories WHERE id = ?", (memory_id,)
            )
            if cursor.rowcount:
                self._audit(connection, "memory.deleted", memory_id)
        return bool(cursor.rowcount)

    def update_communication(
        self,
        message_id: str,
        patch: CommunicationPatch,
    ) -> dict | None:
        update = patch.model_dump(exclude_none=True)
        if not update:
            return self.get_communication(message_id)
        assignments = []
        values: list[object] = []
        mapping = {
            "favorite": "favorite",
            "liked": "liked",
            "remind_later": "remind_later",
        }
        if "read" in update:
            assignments.append("read_at = ?")
            values.append(utc_now() if update["read"] else None)
        for field, column in mapping.items():
            if field in update:
                assignments.append(f"{column} = ?")
                values.append(int(update[field]))
        values.append(message_id)
        with self._lock, self._connect() as connection:
            cursor = connection.execute(
                f"UPDATE communications SET {', '.join(assignments)} "
                "WHERE id = ? AND review_status = 'approved'",
                values,
            )
            if not cursor.rowcount:
                return None
            self._audit(connection, "communication.updated", message_id)
            row = connection.execute(
                "SELECT * FROM communications WHERE id = ?",
                (message_id,),
            ).fetchone()
        return self._communication_dict(row)

    def get_communication(self, message_id: str) -> dict | None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM communications WHERE id = ? "
                "AND review_status = 'approved'",
                (message_id,),
            ).fetchone()
        return self._communication_dict(row) if row else None

    def import_v4(self, envelope: dict) -> dict:
        if not isinstance(envelope, dict):
            raise ValueError("导入文件不是有效的 JSON 对象。")
        data = (
            envelope.get("data")
            if envelope.get("scope") == "rehoyo-companion-local-data"
            else envelope
        )
        if not isinstance(data, dict):
            raise ValueError("导入文件缺少同行数据。")
        schema_version = envelope.get(
            "schemaVersion",
            data.get("schemaVersion"),
        )
        if schema_version != 4:
            raise ValueError("目前只支持正式桌面版 schemaVersion 4。")
        profile = data.get("profile")
        relationship = data.get("relationship")
        memories = data.get("memories", envelope.get("memories", []))
        messages = data.get("messages", [])
        if not isinstance(profile, dict):
            profile = {}
        if not isinstance(relationship, dict):
            relationship = {}
        if not isinstance(memories, list) or not isinstance(messages, list):
            raise ValueError("导入文件中的记忆或通信格式无效。")

        now = utc_now()
        imported = {
            "profile": False,
            "memories": 0,
            "communications": 0,
            "skipped_memories": 0,
            "skipped_communications": 0,
        }
        with self._lock, self._connect() as connection:
            self._ensure_profile(connection)
            if profile and profile.get("onboardingCompleted") is True:
                region = (
                    profile.get("region")
                    if profile.get("region")
                    in {"china", "japan", "north_america"}
                    else "china"
                )
                time_zone = (
                    profile.get("timeZone")
                    if profile.get("timeZone")
                    in {
                        "Asia/Shanghai",
                        "Asia/Tokyo",
                        "America/Los_Angeles",
                    }
                    else "Asia/Shanghai"
                )
                allowed = [
                    item
                    for item in profile.get("allowedContentTypes", [])
                    if item in CONTENT_TYPES
                ]
                reduced = [
                    item
                    for item in profile.get("reducedContentTypes", [])
                    if item in CONTENT_TYPES
                ]
                recall = profile.get("recallEnabled") is True
                if recall and "recall" not in allowed:
                    allowed.append("recall")
                if not recall:
                    allowed = [item for item in allowed if item != "recall"]
                quiet = profile.get("quietHours")
                if not isinstance(quiet, dict):
                    quiet = {}
                quiet_start = str(quiet.get("start") or "22:00")[:5]
                quiet_end = str(quiet.get("end") or "09:00")[:5]
                display_name = safe_visible(
                    profile.get("displayName"),
                    24,
                ) or "开拓者"
                joined_at = valid_iso(
                    relationship.get("joinedAt"),
                    now,
                )
                quiet_until = (
                    valid_iso(relationship.get("quietUntil"), now)
                    if relationship.get("quietUntil")
                    else None
                )
                connection.execute(
                    """
                    UPDATE companion_profile SET
                        display_name = ?, region = ?, language = ?,
                        time_zone = ?, allowed_content_types = ?,
                        reduced_content_types = ?,
                        proactive_contact_enabled = ?, recall_enabled = ?,
                        personalization_enabled = ?, memory_enabled = ?,
                        quiet_start = ?, quiet_end = ?,
                        weekly_contact_limit = ?,
                        onboarding_completed = 1, consent_version = ?,
                        paused = ?, quiet_until = ?, joined_at = ?,
                        updated_at = ?
                    WHERE id = 'primary'
                    """,
                    (
                        display_name,
                        region,
                        str(profile.get("language") or "zh-CN")[:24],
                        time_zone,
                        json.dumps(allowed, ensure_ascii=False),
                        json.dumps(reduced, ensure_ascii=False),
                        int(
                            profile.get("proactiveContactEnabled")
                            is True
                        ),
                        int(recall),
                        int(
                            profile.get("personalizationEnabled")
                            is not False
                        ),
                        int(profile.get("memoryEnabled") is not False),
                        quiet_start,
                        quiet_end,
                        bounded_int(
                            profile.get("weeklyContactLimit"),
                            0,
                            7,
                            2,
                        ),
                        str(
                            profile.get("consentVersion")
                            or "rehoyo-companion-consent-v1"
                        )[:80],
                        int(relationship.get("paused") is True),
                        quiet_until,
                        joined_at,
                        now,
                    ),
                )
                imported["profile"] = True

            for item in memories[:2_000]:
                if not isinstance(item, dict):
                    imported["skipped_memories"] += 1
                    continue
                memory_type = item.get("type")
                source_id = item.get("id")
                title = safe_visible(item.get("title"), 80)
                summary = safe_visible(item.get("summary"), 500)
                if (
                    memory_type not in MEMORY_TYPES
                    or not isinstance(source_id, str)
                    or not source_id
                    or not title
                    or not summary
                ):
                    imported["skipped_memories"] += 1
                    continue
                confirmed = (
                    item.get("userConfirmed") is True
                    and item.get("status") not in {"rejected", "deleted"}
                )
                if (
                    not confirmed
                    and (
                        item.get("hidden") is True
                        or item.get("origin") == "automatic"
                    )
                ):
                    imported["skipped_memories"] += 1
                    continue
                character_text = safe_visible(
                    item.get("characterText"),
                    500,
                )
                created_at = valid_iso(item.get("createdAt"), now)
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO memories(
                        id, type, title, summary, character_text,
                        source_type, reusable_by_character, user_confirmed,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'legacy_v4', ?, ?, ?, ?)
                    """,
                    (
                        legacy_id("memory", source_id),
                        memory_type,
                        title,
                        summary,
                        character_text,
                        int(
                            confirmed
                            and item.get("reusableByCharacter") is True
                        ),
                        int(confirmed),
                        created_at,
                        now,
                    ),
                )
                imported["memories"] += int(bool(cursor.rowcount))

            for item in messages[:2_000]:
                if not isinstance(item, dict):
                    imported["skipped_communications"] += 1
                    continue
                content_type = item.get("type")
                source_id = item.get("id")
                title = safe_visible(item.get("title"), 80)
                body = safe_visible(item.get("body"), 600)
                sent_at = item.get("sentAt")
                if (
                    content_type not in CONTENT_TYPES
                    or not isinstance(source_id, str)
                    or not source_id
                    or item.get("reviewStatus") != "approved"
                    or not isinstance(sent_at, str)
                    or not title
                    or not body
                ):
                    imported["skipped_communications"] += 1
                    continue
                action = item.get("action")
                if not isinstance(action, dict):
                    action = {}
                action_kind = action.get("kind")
                if action_kind not in {
                    "none",
                    "open_album",
                    "open_version_demo",
                }:
                    action_kind = "none"
                trace = item.get("trace")
                if not isinstance(trace, dict):
                    trace = {}
                created_at = valid_iso(item.get("createdAt"), now)
                cursor = connection.execute(
                    """
                    INSERT OR IGNORE INTO communications(
                        id, type, title, body, review_status, sent_at,
                        created_at, read_at, favorite, liked,
                        remind_later, action_kind, action_target_id,
                        delivery_mode, template_id, source_delivery_id,
                        review_mode, review_reason
                    ) VALUES (
                        ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?,
                        ?, ?, '', 'local_rules', 'legacy_v4_import'
                    )
                    """,
                    (
                        legacy_id("message", source_id),
                        content_type,
                        title,
                        body,
                        valid_iso(sent_at, created_at),
                        created_at,
                        (
                            valid_iso(item.get("readAt"), created_at)
                            if item.get("readAt")
                            else None
                        ),
                        int(item.get("favorite") is True),
                        int(item.get("liked") is True),
                        int(item.get("remindLater") is True),
                        action_kind,
                        str(action.get("targetId") or "")[:160] or None,
                        (
                            "proactive"
                            if item.get("deliveryMode") == "proactive"
                            else "system"
                        ),
                        str(trace.get("templateId") or "")[:160],
                    ),
                )
                imported["communications"] += int(bool(cursor.rowcount))
            self._audit(connection, "legacy_v4.imported")
        return {
            "imported": imported,
            "snapshot": self.snapshot(),
        }

    def export_data(self) -> dict:
        snapshot = self.snapshot()
        return {
            "schema_version": snapshot["schema_version"],
            "exported_at": utc_now(),
            "profile": snapshot["profile"],
            "memories": snapshot["memories"],
            "communications": snapshot["communications"],
        }

    def delete_all(self) -> dict:
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM memories")
            connection.execute("DELETE FROM communications")
            connection.execute("DELETE FROM release_deliveries")
            connection.execute("DELETE FROM companion_audit")
            connection.execute("DELETE FROM companion_profile")
            self._ensure_profile(connection)
            self._audit(connection, "companion_data.deleted")
        return self.snapshot()

    def queue_release_delivery(
        self,
        delivery: dict,
        checksum: str,
    ) -> dict:
        delivery_id = str(delivery.get("deliveryId") or "")
        if not delivery_id:
            raise ValueError("发行交付缺少 deliveryId。")
        now = utc_now()
        payload = json.dumps(
            delivery,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        with self._lock, self._connect() as connection:
            existing = connection.execute(
                """
                SELECT checksum, status FROM release_deliveries
                WHERE delivery_id = ?
                """,
                (delivery_id,),
            ).fetchone()
            if existing and existing["checksum"] != checksum:
                raise ValueError("同一 deliveryId 的校验值发生冲突。")
            connection.execute(
                """
                INSERT OR IGNORE INTO release_deliveries(
                    delivery_id, checksum, payload, status, attempts,
                    last_reason, next_attempt_at, created_at, updated_at,
                    delivered_at
                ) VALUES (?, ?, ?, 'queued', 0, '', ?, ?, ?, NULL)
                """,
                (delivery_id, checksum, payload, now, now, now),
            )
            if not existing:
                self._audit(
                    connection,
                    "release_delivery.queued",
                    delivery_id,
                )
            row = connection.execute(
                """
                SELECT status, last_reason FROM release_deliveries
                WHERE delivery_id = ?
                """,
                (delivery_id,),
            ).fetchone()
        return {
            "status": row["status"],
            "reason": row["last_reason"],
        }

    def pending_release_deliveries(
        self,
        *,
        limit: int = 10,
        now: str | None = None,
        force: bool = False,
    ) -> list[dict]:
        threshold = now or utc_now()
        with self._lock, self._connect() as connection:
            if force:
                rows = connection.execute(
                    """
                    SELECT * FROM release_deliveries
                    WHERE status IN ('queued', 'deferred')
                    ORDER BY created_at ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
            else:
                rows = connection.execute(
                    """
                    SELECT * FROM release_deliveries
                    WHERE status IN ('queued', 'deferred')
                      AND next_attempt_at <= ?
                    ORDER BY created_at ASC
                    LIMIT ?
                    """,
                    (threshold, limit),
                ).fetchall()
        return [
            {
                "delivery_id": row["delivery_id"],
                "checksum": row["checksum"],
                "payload": json.loads(row["payload"]),
                "status": row["status"],
                "attempts": row["attempts"],
            }
            for row in rows
        ]

    def defer_release_delivery(
        self,
        delivery_id: str,
        reason: str,
        *,
        retry_after_seconds: int = 60,
    ) -> None:
        now = datetime.now(timezone.utc)
        retry_at = now + timedelta(seconds=retry_after_seconds)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE release_deliveries
                SET status = 'deferred', attempts = attempts + 1,
                    last_reason = ?, next_attempt_at = ?, updated_at = ?
                WHERE delivery_id = ?
                  AND status IN ('queued', 'deferred')
                """,
                (
                    reason,
                    retry_at.isoformat(),
                    now.isoformat(),
                    delivery_id,
                ),
            )

    def reject_release_delivery(
        self,
        delivery_id: str,
        reason: str,
    ) -> None:
        now = utc_now()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE release_deliveries
                SET status = 'rejected', attempts = attempts + 1,
                    last_reason = ?, updated_at = ?
                WHERE delivery_id = ?
                  AND status IN ('queued', 'deferred')
                """,
                (reason, now, delivery_id),
            )
            self._audit(
                connection,
                "release_delivery.rejected",
                delivery_id,
            )

    def deliver_release_message(
        self,
        *,
        delivery_id: str,
        content_type: str,
        title: str,
        body: str,
        template_id: str,
        review_mode: str,
        review_reason: str,
    ) -> dict | None:
        now = utc_now()
        message_id = f"release-{delivery_id}"
        with self._lock, self._connect() as connection:
            delivery = connection.execute(
                """
                SELECT status FROM release_deliveries
                WHERE delivery_id = ?
                """,
                (delivery_id,),
            ).fetchone()
            if not delivery or delivery["status"] == "delivered":
                return self.get_communication(message_id)
            connection.execute(
                """
                INSERT OR IGNORE INTO communications(
                    id, type, title, body, review_status, sent_at,
                    created_at, read_at, favorite, liked, remind_later,
                    action_kind, action_target_id, delivery_mode,
                    template_id, source_delivery_id, review_mode,
                    review_reason
                ) VALUES (
                    ?, ?, ?, ?, 'approved', ?, ?, NULL, 0, 0, 0,
                    'open_version_demo', ?, 'proactive', ?, ?, ?, ?
                )
                """,
                (
                    message_id,
                    content_type,
                    title,
                    body,
                    now,
                    now,
                    delivery_id,
                    template_id,
                    delivery_id,
                    review_mode,
                    review_reason,
                ),
            )
            connection.execute(
                """
                UPDATE release_deliveries
                SET status = 'delivered', attempts = attempts + 1,
                    last_reason = '', updated_at = ?, delivered_at = ?
                WHERE delivery_id = ?
                """,
                (now, now, delivery_id),
            )
            self._audit(
                connection,
                "release_delivery.delivered",
                delivery_id,
            )
            row = connection.execute(
                "SELECT * FROM communications WHERE id = ?",
                (message_id,),
            ).fetchone()
        return self._communication_dict(row) if row else None

    def prompt_context(self) -> str:
        snapshot = self.snapshot()
        profile = snapshot["profile"]
        if (
            not profile["onboarding_completed"]
            or profile["paused"]
            or not profile["personalization_enabled"]
        ):
            return ""
        lines = [f"玩家希望被称为：{profile['display_name']}。"]
        if profile["memory_enabled"]:
            reusable = [
                item
                for item in snapshot["memories"]
                if item["reusable_by_character"] and item["user_confirmed"]
            ][:5]
            if reusable:
                lines.append("玩家已明确允许引用的共同记忆：")
                lines.extend(
                    f"- {item['title']}：{item['summary']}"
                    for item in reusable
                )
        lines.append(
            "这些资料只能用于自然陪伴，不得声称掌握未列出的隐私，"
            "也不要暗示玩家必须继续关系。"
        )
        return "\n".join(lines)
