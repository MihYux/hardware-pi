from __future__ import annotations

import hashlib
import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .release_safety import validate_release_plan_fields


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def delivery_checksum(delivery: dict[str, Any]) -> str:
    serialized = json.dumps(
        delivery,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def validate_delivery_envelope(
    envelope: dict[str, Any],
    *,
    expected_name: str | None = None,
) -> tuple[dict[str, Any], str]:
    parsed = dict(envelope)
    checksum = parsed.pop("checksum", None)
    delivery_id = parsed.get("deliveryId")
    if (
        parsed.get("schemaVersion") != 1
        or not isinstance(delivery_id, str)
        or not delivery_id
    ):
        raise ValueError("Invalid delivery contract")
    if expected_name is not None and expected_name != delivery_id:
        raise ValueError("Delivery filename mismatch")
    if (
        not isinstance(checksum, str)
        or checksum != delivery_checksum(parsed)
    ):
        raise ValueError("Delivery checksum mismatch")
    errors = validate_release_plan_fields(parsed.get("plan"))
    if errors:
        detail = ",".join(
            f"{item['field']}:{item['reason']}" for item in errors
        )
        raise ValueError(f"Delivery contains internal metadata: {detail}")
    return parsed, checksum


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(
        f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp"
    )
    temporary.write_text(content, encoding="utf-8")
    os.replace(temporary, path)


class ReleaseBridgeConsumer:
    def __init__(
        self,
        root_dir: Path,
        on_delivery: Callable[[dict[str, Any], str], dict[str, Any]],
    ):
        self.root_dir = root_dir
        self.inbox_dir = root_dir / "inbox"
        self.processed_dir = root_dir / "processed"
        self.quarantine_dir = root_dir / "quarantine"
        self.on_delivery = on_delivery
        self._lock = threading.Lock()

    def initialize(self) -> None:
        self.inbox_dir.mkdir(parents=True, exist_ok=True)
        self.processed_dir.mkdir(parents=True, exist_ok=True)
        self.quarantine_dir.mkdir(parents=True, exist_ok=True)

    def status(self) -> dict[str, Any]:
        self.initialize()
        return {
            "root": str(self.root_dir),
            "inbox": len(list(self.inbox_dir.glob("*.json"))),
            "processed": len(
                list(self.processed_dir.glob("*.receipt.json"))
            ),
            "quarantined": len(
                [
                    path
                    for path in self.quarantine_dir.glob("*.json")
                    if not path.name.endswith(".receipt.json")
                ]
            ),
        }

    def scan(self) -> dict[str, Any]:
        if not self._lock.acquire(blocking=False):
            return {"busy": True, "consumed": 0, **self.status()}
        consumed = 0
        quarantined = 0
        try:
            self.initialize()
            for source_path in sorted(self.inbox_dir.glob("*.json")):
                try:
                    if self._consume(source_path):
                        consumed += 1
                except Exception as error:
                    quarantined += 1
                    self._quarantine(source_path, error)
        finally:
            self._lock.release()
        return {
            "busy": False,
            "consumed": consumed,
            "newly_quarantined": quarantined,
            **self.status(),
        }

    def _consume(self, source_path: Path) -> bool:
        parsed = json.loads(source_path.read_text(encoding="utf-8"))
        if not isinstance(parsed, dict):
            raise ValueError("Invalid delivery contract")
        parsed, checksum = validate_delivery_envelope(
            parsed,
            expected_name=source_path.stem,
        )
        delivery_id = parsed["deliveryId"]
        receipt_path = (
            self.processed_dir / f"{delivery_id}.receipt.json"
        )
        if not receipt_path.exists():
            result = self.on_delivery(parsed, checksum)
            receipt = {
                "deliveryId": delivery_id,
                "processedAt": utc_now(),
                "checksum": checksum,
                "result": result,
            }
            atomic_write(
                receipt_path,
                json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
            )
        source_path.unlink(missing_ok=True)
        return True

    def _quarantine(self, source_path: Path, error: Exception) -> None:
        if not source_path.exists():
            return
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
        destination = self.quarantine_dir / f"{stamp}-{source_path.name}"
        os.replace(source_path, destination)
        atomic_write(
            Path(f"{destination}.error.txt"),
            f"{error}\n",
        )
