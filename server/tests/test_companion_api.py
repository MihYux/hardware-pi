from pathlib import Path

from fastapi.testclient import TestClient

from app import main
from app.companion_store import CompanionStore
from app.conversations import ConversationStore
from app.security import require_device
from app.security import require_service
from app.settings_store import SettingsStore


def test_companion_api_flow(tmp_path: Path, monkeypatch):
    companion = CompanionStore(tmp_path)
    monkeypatch.setattr(main, "companion_store", companion)
    monkeypatch.setattr(main, "conversation_store", ConversationStore(tmp_path))
    monkeypatch.setattr(main, "settings_store", SettingsStore(tmp_path))
    main.app.dependency_overrides[require_device] = lambda: None

    try:
        with TestClient(main.app) as client:
            initial = client.get("/api/v1/companion/snapshot")
            assert initial.status_code == 200
            assert initial.json()["profile"]["onboarding_completed"] is False

            onboarded = client.post(
                "/api/v1/companion/onboarding",
                json={
                    "display_name": "开拓者",
                    "accepted_concept": True,
                    "accepted_data_flow": True,
                    "first_join_choice": "hear_stories",
                },
            )
            assert onboarded.status_code == 200
            assert onboarded.json()["counts"]["memories"] == 1

            created = client.post(
                "/api/v1/memories",
                json={
                    "type": "photo",
                    "title": "Pi 上的第一天",
                    "summary": "手机已经可以显示人物和共同相册。",
                    "reusable_by_character": True,
                    "user_confirmed": True,
                },
            )
            assert created.status_code == 201
            memory_id = created.json()["id"]

            disabled = client.patch(
                f"/api/v1/memories/{memory_id}",
                json={"reusable_by_character": False},
            )
            assert disabled.status_code == 200
            assert disabled.json()["reusable_by_character"] is False

            exported = client.get("/api/v1/companion/export")
            assert exported.status_code == 200
            assert len(exported.json()["memories"]) == 2

            reset = client.delete("/api/v1/companion/data")
            assert reset.status_code == 200
            assert reset.json()["profile"]["onboarding_completed"] is False
    finally:
        main.app.dependency_overrides.clear()


def test_workbench_search_uses_control_plane_route(monkeypatch):
    calls = []

    class FakeProvider:
        async def passthrough(self, path, **kwargs):
            calls.append((path, kwargs))
            return {"search_result": [{"title": "ok"}]}

    monkeypatch.setattr(
        main,
        "workbench_zhipu_provider",
        lambda: FakeProvider(),
    )
    main.app.dependency_overrides[require_service] = lambda: None
    try:
        with TestClient(main.app) as client:
            response = client.post(
                "/api/zhipu/v1/web_search",
                json={"search_query": "崩坏：星穹铁道"},
            )
            assert response.status_code == 200
            assert response.json()["search_result"][0]["title"] == "ok"
            assert calls == [
                (
                    "web_search",
                    {"body": {"search_query": "崩坏：星穹铁道"}},
                )
            ]
    finally:
        main.app.dependency_overrides.clear()


def test_v4_import_api_requires_explicit_confirmation(
    tmp_path: Path,
    monkeypatch,
):
    companion = CompanionStore(tmp_path)
    monkeypatch.setattr(main, "companion_store", companion)
    monkeypatch.setattr(main, "conversation_store", ConversationStore(tmp_path))
    monkeypatch.setattr(main, "settings_store", SettingsStore(tmp_path))
    main.app.dependency_overrides[require_device] = lambda: None
    payload = {
        "schemaVersion": 4,
        "memories": [
            {
                "id": "memory-api-import",
                "type": "photo",
                "title": "API 导入记忆",
                "summary": "来自正式桌面版记忆导出的记录。",
                "createdAt": "2026-07-02T00:00:00.000Z",
                "reusableByCharacter": True,
                "userConfirmed": True,
            }
        ],
    }

    try:
        with TestClient(main.app) as client:
            rejected = client.post(
                "/api/v1/companion/import",
                json={
                    "accepted_data_import": False,
                    "payload": payload,
                },
            )
            imported = client.post(
                "/api/v1/companion/import",
                json={
                    "accepted_data_import": True,
                    "payload": payload,
                },
            )

        assert rejected.status_code == 400
        assert imported.status_code == 200
        assert imported.json()["imported"]["memories"] == 1
    finally:
        main.app.dependency_overrides.clear()
