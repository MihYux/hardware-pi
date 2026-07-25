import json
from pathlib import Path

from app.release_bridge import ReleaseBridgeConsumer, delivery_checksum


def delivery(delivery_id: str = "delivery_test123") -> dict:
    return {
        "schemaVersion": 1,
        "deliveryId": delivery_id,
        "publishedAt": "2026-07-25T05:00:00+00:00",
        "exampleMode": True,
        "sourceId": delivery_id,
        "taskId": "plan-public",
        "regionId": "china",
        "rolloutPercent": 100,
        "region": {
            "id": "china",
            "code": "CN",
            "name": "中国",
            "language": "zh-CN",
            "timeZone": "Asia/Shanghai",
            "quietHours": {"start": "22:00", "end": "09:00"},
        },
        "plan": {
            "id": "plan-public",
            "title": "新的同行故事",
            "objective": "launch",
            "theme": "和玩家分享新版本里值得留意的故事",
            "narrative": "从具体见闻自然说起",
            "timeWindow": "午后",
            "facts": [
                {
                    "id": "fact-public",
                    "label": "新见闻",
                    "value": "新的旅途中会遇到一群喜欢拍照的伙伴",
                    "source": "已审核公开方案",
                }
            ],
        },
        "source": None,
    }


def write_envelope(root: Path, payload: dict, checksum: str) -> None:
    inbox = root / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    path = inbox / f"{payload['deliveryId']}.json"
    path.write_text(
        json.dumps(
            {**payload, "checksum": checksum},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def test_bridge_consumes_exactly_once_and_writes_receipt(tmp_path: Path):
    calls = []
    payload = delivery()
    write_envelope(tmp_path, payload, delivery_checksum(payload))
    consumer = ReleaseBridgeConsumer(
        tmp_path,
        lambda item, checksum: calls.append((item, checksum))
        or {"status": "queued"},
    )

    first = consumer.scan()
    write_envelope(tmp_path, payload, delivery_checksum(payload))
    second = consumer.scan()

    assert first["consumed"] == 1
    assert second["consumed"] == 1
    assert len(calls) == 1
    receipt = json.loads(
        (
            tmp_path
            / "processed"
            / f"{payload['deliveryId']}.receipt.json"
        ).read_text(encoding="utf-8")
    )
    assert receipt["result"]["status"] == "queued"


def test_bridge_quarantines_bad_checksum_and_metadata(tmp_path: Path):
    bad_checksum = delivery("delivery_bad_checksum")
    write_envelope(tmp_path, bad_checksum, "0" * 64)
    metadata = delivery("delivery_bad_metadata")
    metadata["plan"]["facts"][0]["value"] = (
        "deliveryId: delivery_internal_123456"
    )
    write_envelope(tmp_path, metadata, delivery_checksum(metadata))
    consumer = ReleaseBridgeConsumer(
        tmp_path,
        lambda _item, _checksum: {"status": "queued"},
    )

    result = consumer.scan()

    assert result["newly_quarantined"] == 2
    assert result["quarantined"] == 2
    errors = [
        path.read_text(encoding="utf-8")
        for path in (tmp_path / "quarantine").glob("*.error.txt")
    ]
    assert any("checksum" in item.lower() for item in errors)
    assert any("metadata" in item.lower() for item in errors)
