import asyncio
import base64
import json
from pathlib import Path

import httpx
import pytest

from app.models import (
    ProviderPatch,
    SettingsPatch,
    VoiceOutputPatch,
)
from app.settings_store import SettingsStore
from app.tts_service import (
    TtsError,
    TtsService,
    sanitize_speech_text,
    validate_audio_url,
)


def configured_store(tmp_path: Path) -> SettingsStore:
    store = SettingsStore(tmp_path)
    store.patch(
        SettingsPatch(
            providers={
                "cosyvoice": ProviderPatch(
                    api_key="sk-dashscope-test",
                    base_url="https://dashscope.aliyuncs.com",
                    model="cosyvoice-v3.5-flash",
                )
            },
            voice=VoiceOutputPatch(
                voice_rights_confirmed=True,
                enabled=True,
                auto_play=True,
                voice_id="cosyvoice-v3.5-flash-test-voice",
            ),
        )
    )
    return store


def test_speech_sanitization_and_audio_url_allowlist():
    assert sanitize_speech_text(
        " **你好** [页面](https://example.com) ```secret``` "
    ) == "你好 页面"
    assert (
        validate_audio_url("http://audio.aliyuncs.com/a.wav")
        == "https://audio.aliyuncs.com/a.wav"
    )
    with pytest.raises(TtsError, match="不受信任"):
        validate_audio_url("https://example.com/a.wav")


def test_non_streaming_synthesis_keeps_key_on_server(tmp_path: Path):
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(
                200,
                json={
                    "output": {
                        "audio": {
                            "url": "https://audio.aliyuncs.com/test.wav"
                        }
                    },
                    "usage": {"characters": 4},
                },
            )
        return httpx.Response(200, content=b"RIFFtest-wave")

    service = TtsService(
        configured_store(tmp_path),
        transport=httpx.MockTransport(handler),
    )
    result = asyncio.run(service.synthesize("你好，开拓者"))

    assert result.audio == b"RIFFtest-wave"
    assert result.characters == 4
    post = requests[0]
    assert post.headers["authorization"] == "Bearer sk-dashscope-test"
    body = json.loads(post.content)
    assert body["model"] == "cosyvoice-v3.5-flash"
    assert body["input"]["format"] == "wav"
    assert body["input"]["voice"].endswith("test-voice")


def test_streaming_synthesis_forwards_pcm_as_safe_sse(tmp_path: Path):
    pcm = b"\x00\x00\x10\x00"
    provider_sse = (
        "data: "
        + json.dumps(
            {
                "output": {
                    "audio": {
                        "data": base64.b64encode(pcm).decode()
                    }
                }
            }
        )
        + "\n\n"
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text=provider_sse)

    service = TtsService(
        configured_store(tmp_path),
        transport=httpx.MockTransport(handler),
    )

    async def collect() -> bytes:
        return b"".join(
            [
                chunk
                async for chunk in service.stream_events(
                    "流式语音",
                    mood="bright",
                )
            ]
        )

    events = asyncio.run(collect()).decode()
    assert "event: started" in events
    assert "event: audio" in events
    assert base64.b64encode(pcm).decode() in events
    assert "event: complete" in events
