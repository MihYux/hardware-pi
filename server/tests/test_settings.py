from pathlib import Path
import json

import pytest

from app.models import (
    ControlPlaneSettings,
    ProviderPatch,
    SettingsPatch,
    VoiceOutputPatch,
)
from app.settings_store import SettingsStore


def test_defaults_match_official_desktop_models(tmp_path: Path):
    settings = SettingsStore(tmp_path).load()
    shared = json.loads(
        (
            Path(__file__).resolve().parents[2]
            / "shared"
            / "cosyvoice-config.json"
        ).read_text(encoding="utf-8")
    )

    assert settings.schema_version == 2
    assert settings.deepseek.model == "deepseek-v4-flash"
    assert settings.cosyvoice.base_url == (
        "https://dashscope.aliyuncs.com/api/v1"
    )
    assert settings.cosyvoice.model == shared["model"]
    assert settings.voice.voice_id == shared["voiceId"]


def test_v1_default_models_are_migrated_without_losing_secrets(
    tmp_path: Path,
):
    legacy = ControlPlaneSettings()
    legacy.schema_version = 1
    legacy.deepseek.model = "deepseek-chat"
    legacy.deepseek.api_key = "sk-existing-deepseek-key"
    legacy.cosyvoice.base_url = "https://dashscope.aliyuncs.com"
    legacy.cosyvoice.api_key = "sk-existing-dashscope-key"
    tmp_path.mkdir(parents=True, exist_ok=True)
    (tmp_path / "control-plane.json").write_text(
        legacy.model_dump_json(indent=2),
        encoding="utf-8",
    )

    migrated = SettingsStore(tmp_path).load()

    assert migrated.schema_version == 2
    assert migrated.deepseek.model == "deepseek-v4-flash"
    assert migrated.deepseek.api_key == "sk-existing-deepseek-key"
    assert migrated.cosyvoice.base_url == (
        "https://dashscope.aliyuncs.com/api/v1"
    )
    assert migrated.cosyvoice.api_key == "sk-existing-dashscope-key"


def test_settings_mask_and_preserve_secret(tmp_path: Path):
    store = SettingsStore(tmp_path)
    store.patch(
        SettingsPatch(
            providers={
                "deepseek": ProviderPatch(
                    api_key="sk-test-secret-1234",
                    model="deepseek-chat",
                )
            }
        )
    )

    public = store.public_view()
    assert public["deepseek"]["configured"] is True
    assert public["deepseek"]["api_key_masked"] == "sk-••••1234"
    assert "api_key" not in public["deepseek"]

    store.patch(
        SettingsPatch(
            providers={"deepseek": ProviderPatch(model="deepseek-next")}
        )
    )
    assert store.provider("deepseek").api_key == "sk-test-secret-1234"
    assert store.provider("deepseek").model == "deepseek-next"


def test_settings_clear_secret(tmp_path: Path):
    store = SettingsStore(tmp_path)
    store.patch(
        SettingsPatch(
            providers={
                "deepseek": ProviderPatch(api_key="sk-temporary")
            }
        )
    )
    store.patch(
        SettingsPatch(
            providers={
                "deepseek": ProviderPatch(clear_api_key=True)
            }
        )
    )
    assert store.provider("deepseek").api_key == ""


def test_missing_persisted_secret_can_bootstrap_from_environment(
    tmp_path: Path, monkeypatch
):
    store = SettingsStore(tmp_path)
    store.load()
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-from-orange-pi-env")

    assert store.load().deepseek.api_key == "sk-from-orange-pi-env"


def test_voice_output_requires_rights_and_revocation_disables_autoplay(
    tmp_path: Path,
):
    store = SettingsStore(tmp_path)

    with pytest.raises(ValueError, match="确认"):
        store.patch(
            SettingsPatch(
                voice=VoiceOutputPatch(enabled=True)
            )
        )

    enabled = store.patch(
        SettingsPatch(
            voice=VoiceOutputPatch(
                voice_rights_confirmed=True,
                enabled=True,
                auto_play=True,
            )
        )
    )
    assert enabled.voice.auto_play is True

    revoked = store.patch(
        SettingsPatch(
            voice=VoiceOutputPatch(voice_rights_confirmed=False)
        )
    )
    assert revoked.voice.enabled is False
    assert revoked.voice.auto_play is False
