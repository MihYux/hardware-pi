from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl


ProviderName = Literal["deepseek", "zhipu", "cosyvoice"]


class ProviderSettings(BaseModel):
    enabled: bool = True
    base_url: str
    model: str
    api_key: str = ""


class RoutingSettings(BaseModel):
    workbench_generation: Literal["deepseek", "zhipu"] = "deepseek"
    region_search: Literal["zhipu"] = "zhipu"
    companion_chat: Literal["deepseek", "zhipu"] = "deepseek"
    companion_review: Literal["deepseek", "zhipu"] = "deepseek"
    text_to_speech: Literal["cosyvoice"] = "cosyvoice"


class ControlPlaneSettings(BaseModel):
    schema_version: int = 1
    deepseek: ProviderSettings = Field(
        default_factory=lambda: ProviderSettings(
            base_url="https://api.deepseek.com",
            model="deepseek-chat",
        )
    )
    zhipu: ProviderSettings = Field(
        default_factory=lambda: ProviderSettings(
            base_url="https://open.bigmodel.cn/api/paas/v4",
            model="glm-5.2",
        )
    )
    cosyvoice: ProviderSettings = Field(
        default_factory=lambda: ProviderSettings(
            base_url="https://dashscope.aliyuncs.com",
            model="cosyvoice-v3.5-flash",
        )
    )
    routing: RoutingSettings = Field(default_factory=RoutingSettings)
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class ProviderPatch(BaseModel):
    enabled: bool | None = None
    base_url: HttpUrl | None = None
    model: str | None = Field(default=None, min_length=1, max_length=120)
    api_key: str | None = Field(default=None, max_length=400)
    clear_api_key: bool = False


class RoutingPatch(BaseModel):
    workbench_generation: Literal["deepseek", "zhipu"] | None = None
    region_search: Literal["zhipu"] | None = None
    companion_chat: Literal["deepseek", "zhipu"] | None = None
    companion_review: Literal["deepseek", "zhipu"] | None = None
    text_to_speech: Literal["cosyvoice"] | None = None


class SettingsPatch(BaseModel):
    providers: dict[ProviderName, ProviderPatch] = Field(default_factory=dict)
    routing: RoutingPatch | None = None


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2_000)


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2_000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


class ChatResponse(BaseModel):
    session_id: str
    message_id: str
    text: str
    expression: Literal["bright", "soft", "proud", "curious"]
    provider: str
    model: str
    fallback: bool = False


class ProviderTestResponse(BaseModel):
    provider: ProviderName
    configured: bool
    ok: bool
    model: str
    latency_ms: int
    message: str
