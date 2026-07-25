from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


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


class VoiceOutputSettings(BaseModel):
    enabled: bool = False
    auto_play: bool = False
    volume: float = Field(default=0.86, ge=0, le=1)
    rate: float = Field(default=1, ge=0.7, le=1.3)
    voice_rights_confirmed: bool = False
    voice_id: str = Field(
        default=(
            "cosyvoice-v3.5-flash-marchpet-"
            "eb86bcaeea5f40669b1798191950529a"
        ),
        min_length=1,
        max_length=240,
    )
    sample_rate: int = Field(default=24_000, ge=8_000, le=48_000)
    instruction: str = Field(
        default=(
            "请用自然、活泼、亲切的年轻女性语气表达，"
            "吐字清晰，避免过度夸张。"
        ),
        max_length=120,
    )


class VoiceOutputPatch(BaseModel):
    enabled: bool | None = None
    auto_play: bool | None = None
    volume: float | None = Field(default=None, ge=0, le=1)
    rate: float | None = Field(default=None, ge=0.7, le=1.3)
    voice_rights_confirmed: bool | None = None
    voice_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=240,
    )
    sample_rate: int | None = Field(
        default=None,
        ge=8_000,
        le=48_000,
    )
    instruction: str | None = Field(default=None, max_length=120)


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
    voice: VoiceOutputSettings = Field(default_factory=VoiceOutputSettings)
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
    voice: VoiceOutputPatch | None = None


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


class TtsRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2_000)
    mood: Literal["bright", "soft", "proud", "curious"] = "bright"


ContentType = Literal[
    "daily",
    "photo",
    "postcard",
    "relationship",
    "version_preheat",
    "version_launch",
    "version_sustain",
    "recall",
]
MemoryType = Literal[
    "choice",
    "photo",
    "postcard",
    "milestone",
    "version",
    "return",
]
FirstJoinChoice = Literal[
    "take_photos",
    "explore_places",
    "hear_stories",
    "walk_slowly",
]


class QuietHours(BaseModel):
    start: str = "22:00"
    end: str = "09:00"

    @field_validator("start", "end")
    @classmethod
    def validate_clock(cls, value: str) -> str:
        parts = value.split(":")
        if (
            len(parts) != 2
            or not all(part.isdigit() for part in parts)
            or len(parts[0]) != 2
            or len(parts[1]) != 2
        ):
            raise ValueError("勿扰时间必须使用 HH:MM 格式。")
        hour, minute = (int(part) for part in parts)
        if hour > 23 or minute > 59:
            raise ValueError("勿扰时间无效。")
        return value


class CompanionPreferences(BaseModel):
    display_name: str = Field(min_length=1, max_length=24)
    region: Literal["china", "japan", "north_america"] = "china"
    language: str = Field(default="zh-CN", min_length=2, max_length=24)
    time_zone: str = Field(default="Asia/Shanghai", min_length=1, max_length=80)
    allowed_content_types: list[ContentType] = Field(
        default_factory=lambda: ["daily", "photo", "postcard", "relationship"],
        max_length=8,
    )
    proactive_contact_enabled: bool = False
    recall_enabled: bool = False
    personalization_enabled: bool = True
    memory_enabled: bool = True
    quiet_hours: QuietHours = Field(default_factory=QuietHours)
    weekly_contact_limit: int = Field(default=2, ge=0, le=7)


class OnboardingRequest(CompanionPreferences):
    accepted_concept: bool
    accepted_data_flow: bool
    first_join_choice: FirstJoinChoice | None = None
    consent_version: str = Field(default="hardware-pi-v1", max_length=80)


class CompanionProfilePatch(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=24)
    region: Literal["china", "japan", "north_america"] | None = None
    language: str | None = Field(default=None, min_length=2, max_length=24)
    time_zone: str | None = Field(default=None, min_length=1, max_length=80)
    allowed_content_types: list[ContentType] | None = Field(
        default=None,
        max_length=8,
    )
    proactive_contact_enabled: bool | None = None
    recall_enabled: bool | None = None
    personalization_enabled: bool | None = None
    memory_enabled: bool | None = None
    quiet_hours: QuietHours | None = None
    weekly_contact_limit: int | None = Field(default=None, ge=0, le=7)
    paused: bool | None = None


class MemoryCreate(BaseModel):
    type: MemoryType = "photo"
    title: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=500)
    character_text: str = Field(default="", max_length=500)
    reusable_by_character: bool = True
    user_confirmed: bool = True


class MemoryPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=80)
    summary: str | None = Field(default=None, min_length=1, max_length=500)
    character_text: str | None = Field(default=None, max_length=500)
    reusable_by_character: bool | None = None
    user_confirmed: bool | None = None


class CommunicationPatch(BaseModel):
    read: bool | None = None
    favorite: bool | None = None
    liked: bool | None = None
    remind_later: bool | None = None
