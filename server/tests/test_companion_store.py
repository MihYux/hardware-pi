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
