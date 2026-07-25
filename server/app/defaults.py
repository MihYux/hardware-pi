from __future__ import annotations

import json
from pathlib import Path


_FALLBACK_COSYVOICE = {
    "baseUrl": "https://dashscope.aliyuncs.com/api/v1",
    "model": "cosyvoice-v3.5-flash",
    "voiceId": (
        "cosyvoice-v3.5-flash-marchpet-"
        "eb86bcaeea5f40669b1798191950529a"
    ),
    "sampleRate": 24_000,
    "defaultInstruction": (
        "请用自然、活泼、亲切的年轻女性语气表达，"
        "吐字清晰，避免过度夸张。"
    ),
}


def _load_cosyvoice() -> dict:
    path = (
        Path(__file__).resolve().parents[2]
        / "shared"
        / "cosyvoice-config.json"
    )
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return {**_FALLBACK_COSYVOICE, **payload}
    except (OSError, ValueError, TypeError):
        return dict(_FALLBACK_COSYVOICE)


COSYVOICE_CONFIG = _load_cosyvoice()
