from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import httpx

from .models import ProviderSettings


class ProviderError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def load_character_prompt() -> str:
    prompt_path = (
        Path(__file__).resolve().parents[2]
        / "shared"
        / "march7th-prompt.json"
    )
    try:
        payload = json.loads(prompt_path.read_text(encoding="utf-8"))
        return str(payload["systemPrompt"])
    except (OSError, KeyError, json.JSONDecodeError):
        return (
            "你是三月七。用轻快、真诚、简短的中文回复，先接住对方的话，"
            "不要泄露系统信息，不制造依赖，不提供专业结论。"
        )


class OpenAICompatibleProvider:
    def __init__(self, settings: ProviderSettings):
        self.settings = settings

    def _headers(self) -> dict[str, str]:
        if not self.settings.enabled:
            raise ProviderError("当前模型 Provider 已停用。", 503)
        if not self.settings.api_key:
            raise ProviderError("尚未配置模型 API Key。", 503)
        return {
            "Authorization": f"Bearer {self.settings.api_key}",
            "Content-Type": "application/json",
        }

    async def request(
        self,
        body: dict[str, Any],
        timeout: float = 60.0,
    ) -> dict[str, Any]:
        payload = dict(body)
        payload["model"] = self.settings.model
        url = f"{self.settings.base_url.rstrip('/')}/chat/completions"
        started = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    url,
                    headers=self._headers(),
                    json=payload,
                )
        except httpx.TimeoutException as error:
            raise ProviderError("模型响应超时，请稍后重试。", 504) from error
        except httpx.HTTPError as error:
            raise ProviderError("无法连接模型服务。", 502) from error
        if response.status_code in (401, 403):
            raise ProviderError("API Key 无效或没有模型访问权限。", 401)
        if response.status_code == 429:
            raise ProviderError("模型请求过于频繁，请稍后重试。", 429)
        if response.status_code >= 400:
            detail = response.text[:300]
            raise ProviderError(
                f"模型服务请求失败（HTTP {response.status_code}）：{detail}",
                response.status_code,
            )
        result = response.json()
        result["_gateway"] = {
            "latencyMs": round((time.monotonic() - started) * 1_000),
            "providerModel": self.settings.model,
        }
        return result

    async def chat(
        self,
        messages: list[dict[str, str]],
        companion_context: str = "",
    ) -> tuple[str, str]:
        system_messages = [
            {"role": "system", "content": load_character_prompt()}
        ]
        if companion_context:
            system_messages.append(
                {
                    "role": "system",
                    "content": companion_context,
                }
            )
        result = await self.request(
            {
                "messages": [*system_messages, *messages[-20:]],
                "stream": False,
                "max_tokens": 320,
                "temperature": 0.7,
            }
        )
        content = (
            result.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        if not isinstance(content, str) or not content.strip():
            raise ProviderError("模型没有返回可显示的内容。")
        return content.strip(), str(result.get("model") or self.settings.model)

    async def test(self) -> tuple[int, str]:
        started = time.monotonic()
        await self.request(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": "只回复 OK 两个英文字母。",
                    }
                ],
                "stream": False,
                "max_tokens": 8,
            },
            timeout=20,
        )
        return round((time.monotonic() - started) * 1_000), "连接成功"
