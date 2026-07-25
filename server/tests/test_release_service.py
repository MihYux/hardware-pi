import asyncio
from pathlib import Path

from app.companion_store import CompanionStore
from app.models import OnboardingRequest
from app.release_bridge import delivery_checksum
from app.release_service import ReleaseService
from app.settings_store import SettingsStore
from test_release_bridge import delivery


def test_release_service_delivers_safe_authorized_message(
    tmp_path: Path,
):
    store = CompanionStore(tmp_path)
    store.initialize()
    store.onboard(
        OnboardingRequest(
            display_name="开拓者",
            accepted_concept=True,
            accepted_data_flow=True,
            proactive_contact_enabled=True,
            allowed_content_types=[
                "daily",
                "photo",
                "postcard",
                "relationship",
                "version_preheat",
                "version_launch",
                "version_sustain",
            ],
            quiet_hours={"start": "00:00", "end": "00:00"},
        )
    )
    payload = delivery()
    store.queue_release_delivery(payload, delivery_checksum(payload))
    service = ReleaseService(store, SettingsStore(tmp_path))

    result = asyncio.run(service.process_pending(force=True))

    assert result["delivered"] == 1
    message = store.communications()[0]
    assert message["delivery_mode"] == "proactive"
    assert message["source_delivery_id"] == payload["deliveryId"]
    assert "新的旅途中" in message["body"]
    assert store.release_status()["counts"]["delivered"] == 1


def test_release_service_defers_until_player_enables_contact(
    tmp_path: Path,
):
    store = CompanionStore(tmp_path)
    store.initialize()
    store.onboard(
        OnboardingRequest(
            display_name="开拓者",
            accepted_concept=True,
            accepted_data_flow=True,
        )
    )
    payload = delivery()
    store.queue_release_delivery(payload, delivery_checksum(payload))
    service = ReleaseService(store, SettingsStore(tmp_path))

    result = asyncio.run(service.process_pending(force=True))

    assert result["deferred"] == 1
    status = store.release_status()
    assert status["counts"]["deferred"] == 1
    assert (
        status["recent"][0]["last_reason"]
        == "proactive_contact_disabled"
    )
