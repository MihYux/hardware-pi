from pathlib import Path

import pytest

from app.companion_store import CompanionStore
from app.models import (
    CommunicationPatch,
    CompanionProfilePatch,
    MemoryCreate,
    MemoryPatch,
    OnboardingRequest,
)


def onboarded_store(tmp_path: Path) -> CompanionStore:
    store = CompanionStore(tmp_path)
    store.initialize()
    store.onboard(
        OnboardingRequest(
            display_name="开拓者",
            accepted_concept=True,
            accepted_data_flow=True,
            first_join_choice="take_photos",
        )
    )
    return store


def test_onboarding_creates_user_controlled_memory_and_welcome_message(
    tmp_path: Path,
):
    store = onboarded_store(tmp_path)
    snapshot = store.snapshot()

    assert snapshot["profile"]["onboarding_completed"] is True
    assert snapshot["counts"] == {
        "memories": 1,
        "communications": 1,
        "unread_communications": 1,
    }
    assert snapshot["memories"][0]["source_type"] == "onboarding"
    assert "玩家已明确允许引用" in store.prompt_context()


def test_onboarding_requires_both_disclosures(tmp_path: Path):
    store = CompanionStore(tmp_path)
    store.initialize()

    with pytest.raises(ValueError, match="必须确认"):
        store.onboard(
            OnboardingRequest(
                display_name="开拓者",
                accepted_concept=True,
                accepted_data_flow=False,
            )
        )


def test_memory_lifecycle_and_export_exclude_secrets(tmp_path: Path):
    store = onboarded_store(tmp_path)
    memory = store.create_memory(
        MemoryCreate(
            title="今天的第一张照片",
            summary="在手机上为 Hardware Pi 记录了一张共同记忆。",
        )
    )
    updated = store.update_memory(
        memory["id"],
        MemoryPatch(reusable_by_character=False),
    )

    assert updated
    assert updated["reusable_by_character"] is False
    exported = store.export_data()
    assert len(exported["memories"]) == 2
    assert "api_key" not in str(exported).lower()
    assert store.delete_memory(memory["id"]) is True


def test_profile_pause_disables_prompt_context(tmp_path: Path):
    store = onboarded_store(tmp_path)
    store.update_profile(CompanionProfilePatch(paused=True))

    assert store.profile()["paused"] is True
    assert store.prompt_context() == ""


def test_communication_state_and_relationship_data_reset(tmp_path: Path):
    store = onboarded_store(tmp_path)
    message = store.communications()[0]
    updated = store.update_communication(
        message["id"],
        CommunicationPatch(read=True, favorite=True, liked=True),
    )

    assert updated
    assert updated["read_at"]
    assert updated["favorite"] is True
    reset = store.delete_all()
    assert reset["profile"]["onboarding_completed"] is False
    assert reset["counts"]["memories"] == 0
    assert reset["counts"]["communications"] == 0


def test_official_v4_import_is_safe_idempotent_and_consent_aware(
    tmp_path: Path,
):
    store = CompanionStore(tmp_path)
    store.initialize()
    payload = {
        "schemaVersion": 4,
        "scope": "rehoyo-companion-local-data",
        "data": {
            "schemaVersion": 4,
            "profile": {
                "displayName": "旧版开拓者",
                "region": "japan",
                "language": "zh-CN",
                "timeZone": "Asia/Tokyo",
                "allowedContentTypes": [
                    "daily",
                    "relationship",
                    "version_launch",
                ],
                "reducedContentTypes": ["version_launch"],
                "proactiveContactEnabled": True,
                "recallEnabled": False,
                "personalizationEnabled": True,
                "memoryEnabled": True,
                "quietHours": {"start": "23:00", "end": "08:00"},
                "weeklyContactLimit": 3,
                "onboardingCompleted": True,
                "consentVersion": "rehoyo-companion-consent-v1",
            },
            "relationship": {
                "joinedAt": "2026-07-01T00:00:00.000Z",
                "paused": False,
                "quietUntil": "2026-08-01T00:00:00.000Z",
            },
            "memories": [
                {
                    "id": "memory-confirmed",
                    "type": "photo",
                    "title": "旧版共同照片",
                    "summary": "玩家明确确认保存的一次拍照记忆。",
                    "characterText": "咱把这张照片收好啦！",
                    "createdAt": "2026-07-02T00:00:00.000Z",
                    "reusableByCharacter": True,
                    "userConfirmed": True,
                    "status": "confirmed",
                },
                {
                    "id": "memory-candidate",
                    "type": "choice",
                    "title": "等待确认的同行选择",
                    "summary": "这条记录仍需要玩家确认。",
                    "characterText": "",
                    "createdAt": "2026-07-03T00:00:00.000Z",
                    "reusableByCharacter": True,
                    "userConfirmed": False,
                    "origin": "explicit",
                },
                {
                    "id": "memory-hidden",
                    "type": "choice",
                    "title": "自动提取记录",
                    "summary": "未确认的隐藏记录不应进入 Pi。",
                    "createdAt": "2026-07-04T00:00:00.000Z",
                    "userConfirmed": False,
                    "origin": "automatic",
                    "hidden": True,
                },
            ],
            "messages": [
                {
                    "id": "message-approved",
                    "characterId": "march-7th",
                    "playerId": "player",
                    "type": "version_launch",
                    "title": "旧版已审核通信",
                    "body": "开拓者，咱们又有新的旅行故事啦。",
                    "createdAt": "2026-07-05T00:00:00.000Z",
                    "eventId": "event-public",
                    "reviewStatus": "approved",
                    "sentAt": "2026-07-05T00:00:00.000Z",
                    "deliveryMode": "proactive",
                    "readAt": None,
                    "favorite": True,
                    "liked": False,
                    "remindLater": False,
                    "trace": {"templateId": "template-public"},
                },
                {
                    "id": "message-draft",
                    "characterId": "march-7th",
                    "playerId": "player",
                    "type": "daily",
                    "title": "未审核草稿",
                    "body": "这条不能显示。",
                    "createdAt": "2026-07-05T00:00:00.000Z",
                    "eventId": "event-draft",
                    "reviewStatus": "draft",
                },
            ],
        },
    }

    first = store.import_v4(payload)
    second = store.import_v4(payload)

    assert first["imported"] == {
        "profile": True,
        "memories": 2,
        "communications": 1,
        "skipped_memories": 1,
        "skipped_communications": 1,
    }
    assert second["imported"]["memories"] == 0
    assert second["imported"]["communications"] == 0
    profile = store.profile()
    assert profile["display_name"] == "旧版开拓者"
    assert profile["reduced_content_types"] == ["version_launch"]
    assert profile["quiet_until"].startswith("2026-08-01")
    assert len(store.memories()) == 2
    assert sum(item["user_confirmed"] for item in store.memories()) == 1
    assert "等待确认的同行选择" not in store.prompt_context()
    assert store.communications()[0]["delivery_mode"] == "proactive"


def test_v4_memory_only_export_is_supported(tmp_path: Path):
    store = CompanionStore(tmp_path)
    store.initialize()

    result = store.import_v4(
        {
            "schemaVersion": 4,
            "characterId": "march-7th",
            "memories": [
                {
                    "id": "memory-export-only",
                    "type": "photo",
                    "title": "只导出的相册记录",
                    "summary": "来自正式版的记忆专用导出。",
                    "createdAt": "2026-07-02T00:00:00.000Z",
                    "reusableByCharacter": True,
                    "userConfirmed": True,
                }
            ],
        }
    )

    assert result["imported"]["profile"] is False
    assert result["imported"]["memories"] == 1
