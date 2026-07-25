from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path


class ConversationStore:
    def __init__(self, data_dir: Path):
        self.path = data_dir / "hardware-pi.db"
        self._lock = threading.RLock()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    provider TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS messages_session_created "
                "ON messages(session_id, created_at)"
            )

    def _connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def append(
        self,
        message_id: str,
        session_id: str,
        role: str,
        content: str,
        provider: str = "",
    ) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                "INSERT INTO messages(id, session_id, role, content, provider, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    message_id,
                    session_id,
                    role,
                    content,
                    provider,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    def recent(self, session_id: str, limit: int = 20) -> list[dict]:
        safe_limit = max(1, min(limit, 100))
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                "SELECT id, role, content, provider, created_at "
                "FROM messages WHERE session_id = ? "
                "ORDER BY created_at DESC LIMIT ?",
                (session_id, safe_limit),
            ).fetchall()
        return [
            {
                "id": row[0],
                "role": row[1],
                "content": row[2],
                "provider": row[3],
                "createdAt": row[4],
            }
            for row in reversed(rows)
        ]
