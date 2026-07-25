from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from .provider import ProviderError
from .settings_store import SettingsStore


MAX_SPEECH_CHARACTERS = 600
MAX_AUDIO_BYTES = 8 * 1024 * 1024
MAX_STREAM_AUDIO_BYTES = 12 * 1024 * 1024
MOOD_INSTRUCTIONS = {
    "bright": "请用自然、活泼、亲切的年轻女性语气表达，吐字清晰。",
    "soft": "请用温柔、认真、让人安心的年轻女性语气表达。",
    "proud": "请用轻快、带一点小得意但不过度夸张的语气表达。",
    "curious": "请用好奇、灵动、自然停顿的年轻女性语气表达。",
}


class TtsError(ProviderError):
    def __init__(
        self,
        message: str,
        code: str = "TTS_REQUEST_FAILED",
        status_code: int = 502,
    ):
        super().__init__(message, status_code)
        self.code = code


@dataclass(frozen=True)
class AudioResult:
    audio: bytes
    mime_type: str
    characters: int
    model: str
    voice_id: str


def sanitize_speech_text(text: str) -> str:
    if not isinstance(text, str):
        raise TtsError("朗读文本格式不正确。", "INVALID_TEXT", 400)
    cleaned = re.sub(r"```[\s\S]*?```", " ", text)
    cleaned = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", cleaned)
    cleaned = re.sub(r"[*_#>`~]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    cleaned = cleaned[:MAX_SPEECH_CHARACTERS]
    if not cleaned:
        raise TtsError("没有可朗读的文本。", "EMPTY_TEXT", 400)
    return cleaned


def validate_audio_url(value: str) -> str:
    parsed = urlparse(value)
    hostname = (parsed.hostname or "").lower()
    if (
        parsed.scheme not in {"http", "https"}
        or not (
            hostname == "aliyuncs.com"
            or hostname.endswith(".aliyuncs.com")
        )
    ):
        raise TtsError(
            "CosyVoice 返回了不受信任的音频地址。",
            "UNTRUSTED_AUDIO_URL",
        )
    return parsed._replace(scheme="https").geturl()


def _provider_error(status_code: int) -> TtsError:
    if status_code in (401, 403):
        return TtsError(
            "DashScope API Key 无效，或没有 CosyVoice 调用权限。",
            "AUTH_FAILED",
            401,
        )
    if status_code == 429:
        return TtsError(
            "CosyVoice 请求太频繁了，请稍后再试。",
            "RATE_LIMITED",
            429,
        )
    if status_code >= 500:
        return TtsError(
            "CosyVoice 服务暂时不可用，请稍后重试。",
            "PROVIDER_UNAVAILABLE",
            503,
        )
    return TtsError(
        f"CosyVoice 请求失败（HTTP {status_code}）。",
        "TTS_REQUEST_FAILED",
        502,
    )


class TtsService:
    def __init__(
        self,
        settings_store: SettingsStore,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.settings_store = settings_store
        self.transport = transport

    def public_settings(self) -> dict[str, Any]:
        settings = self.settings_store.load()
        provider = settings.cosyvoice
        return {
            **settings.voice.model_dump(),
            "provider": "dashscope",
            "base_url": provider.base_url,
            "model": provider.model,
            "configured": bool(provider.api_key),
            "provider_enabled": provider.enabled,
        }

    def _configuration(
        self,
        *,
        require_enabled: bool,
    ) -> tuple[Any, Any]:
        settings = self.settings_store.load()
        provider = settings.cosyvoice
        voice = settings.voice
        if not voice.voice_rights_confirmed:
            raise TtsError(
                "请先确认你拥有声音样本和复刻音色的使用授权。",
                "VOICE_RIGHTS_UNCONFIRMED",
                403,
            )
        if require_enabled and not voice.enabled:
            raise TtsError(
                "语音输出当前已关闭。",
                "TTS_DISABLED",
                409,
            )
        if not provider.enabled:
            raise TtsError(
                "CosyVoice Provider 当前已停用。",
                "PROVIDER_DISABLED",
                503,
            )
        if not provider.api_key:
            raise TtsError(
                "请先配置 DashScope API Key。",
                "API_KEY_MISSING",
                503,
            )
        return provider, voice

    @staticmethod
    def _endpoint(base_url: str) -> str:
        base = base_url.rstrip("/")
        if not base.endswith("/api/v1"):
            base = f"{base}/api/v1"
        return f"{base}/services/audio/tts/SpeechSynthesizer"

    @staticmethod
    def _input(
        *,
        text: str,
        voice: Any,
        mood: str,
        audio_format: str,
    ) -> dict[str, Any]:
        instruction = MOOD_INSTRUCTIONS.get(mood) or voice.instruction
        return {
            "text": text,
            "voice": voice.voice_id,
            "format": audio_format,
            "sample_rate": voice.sample_rate,
            "volume": 50,
            "rate": voice.rate,
            "pitch": 1,
            "language_hints": ["zh"],
            **({"instruction": instruction[:120]} if instruction else {}),
        }

    async def synthesize(
        self,
        text: str,
        *,
        mood: str = "bright",
        require_enabled: bool = True,
    ) -> AudioResult:
        provider, voice = self._configuration(
            require_enabled=require_enabled
        )
        clean = sanitize_speech_text(text)
        headers = {
            "Authorization": f"Bearer {provider.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": provider.model,
            "input": self._input(
                text=clean,
                voice=voice,
                mood=mood,
                audio_format="wav",
            ),
        }
        try:
            async with httpx.AsyncClient(
                timeout=45,
                transport=self.transport,
            ) as client:
                response = await client.post(
                    self._endpoint(provider.base_url),
                    headers=headers,
                    json=payload,
                )
                if response.status_code >= 400:
                    raise _provider_error(response.status_code)
                result = response.json()
                remote_url = (
                    result.get("output", {}).get("audio", {}).get("url")
                )
                if not isinstance(remote_url, str) or not remote_url:
                    raise TtsError(
                        "CosyVoice 没有返回音频地址。",
                        "EMPTY_AUDIO_RESPONSE",
                    )
                audio_response = await client.get(
                    validate_audio_url(remote_url)
                )
                if audio_response.status_code >= 400:
                    raise TtsError(
                        "无法下载 CosyVoice 生成的音频。",
                        "AUDIO_DOWNLOAD_FAILED",
                    )
                audio = audio_response.content
        except TtsError:
            raise
        except httpx.TimeoutException as error:
            raise TtsError(
                "CosyVoice 响应超时，请稍后重试。",
                "REQUEST_TIMEOUT",
                504,
            ) from error
        except (httpx.HTTPError, ValueError) as error:
            raise TtsError(
                "无法连接 CosyVoice，请检查网络设置。",
                "NETWORK_ERROR",
            ) from error
        if not audio or len(audio) > MAX_AUDIO_BYTES:
            raise TtsError(
                "CosyVoice 返回的音频大小不正确。",
                "INVALID_AUDIO_SIZE",
            )
        return AudioResult(
            audio=audio,
            mime_type="audio/wav",
            characters=int(result.get("usage", {}).get("characters") or len(clean)),
            model=provider.model,
            voice_id=voice.voice_id,
        )

    async def stream_events(
        self,
        text: str,
        *,
        mood: str = "bright",
    ) -> AsyncIterator[bytes]:
        try:
            provider, voice = self._configuration(require_enabled=True)
            clean = sanitize_speech_text(text)
            headers = {
                "Authorization": f"Bearer {provider.api_key}",
                "Content-Type": "application/json",
                "X-DashScope-SSE": "enable",
            }
            payload = {
                "model": provider.model,
                "input": self._input(
                    text=clean,
                    voice=voice,
                    mood=mood,
                    audio_format="pcm",
                ),
            }
            yield self._event(
                "started",
                {
                    "sampleRate": voice.sample_rate,
                    "model": provider.model,
                    "voiceId": voice.voice_id,
                },
            )
            audio_bytes = 0
            chunks = 0
            async with httpx.AsyncClient(
                timeout=60,
                transport=self.transport,
            ) as client:
                async with client.stream(
                    "POST",
                    self._endpoint(provider.base_url),
                    headers=headers,
                    json=payload,
                ) as response:
                    if response.status_code >= 400:
                        raise _provider_error(response.status_code)
                    data_lines: list[str] = []
                    async for line in response.aiter_lines():
                        if line.startswith("data:"):
                            data_lines.append(line[5:].strip())
                            continue
                        if line or not data_lines:
                            continue
                        parsed = json.loads("\n".join(data_lines))
                        data_lines.clear()
                        if parsed.get("code"):
                            raise TtsError(
                                "CosyVoice 流式合成失败，请稍后重试。",
                                str(parsed.get("code")),
                            )
                        output = parsed.get("output") or {}
                        audio = (output.get("audio") or {}).get("data")
                        if isinstance(audio, str) and audio:
                            padding = (
                                2
                                if audio.endswith("==")
                                else 1
                                if audio.endswith("=")
                                else 0
                            )
                            audio_bytes += len(audio) * 3 // 4 - padding
                            if audio_bytes > MAX_STREAM_AUDIO_BYTES:
                                raise TtsError(
                                    "CosyVoice 返回的音频流过大。",
                                    "STREAM_TOO_LARGE",
                                )
                            yield self._event(
                                "audio",
                                {
                                    "audioBase64": audio,
                                    "index": chunks,
                                    "sampleRate": voice.sample_rate,
                                },
                            )
                            chunks += 1
                    if data_lines:
                        parsed = json.loads("\n".join(data_lines))
                        output = parsed.get("output") or {}
                        audio = (output.get("audio") or {}).get("data")
                        if isinstance(audio, str) and audio:
                            yield self._event(
                                "audio",
                                {
                                    "audioBase64": audio,
                                    "index": chunks,
                                    "sampleRate": voice.sample_rate,
                                },
                            )
                            chunks += 1
            if not chunks:
                raise TtsError(
                    "CosyVoice 没有返回流式音频数据。",
                    "EMPTY_AUDIO_STREAM",
                )
            yield self._event(
                "complete",
                {
                    "characters": len(clean),
                    "audioChunks": chunks,
                    "audioBytes": audio_bytes,
                    "sampleRate": voice.sample_rate,
                },
            )
        except TtsError as error:
            yield self._event(
                "error",
                {"message": str(error), "code": error.code},
            )
        except Exception:
            yield self._event(
                "error",
                {
                    "message": "无法连接 CosyVoice 流式服务，请检查网络设置。",
                    "code": "NETWORK_ERROR",
                },
            )

    @staticmethod
    def _event(event: str, payload: dict[str, Any]) -> bytes:
        data = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        return f"event: {event}\ndata: {data}\n\n".encode("utf-8")
