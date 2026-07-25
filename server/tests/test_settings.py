from pathlib import Path

from app.models import ProviderPatch, SettingsPatch
from app.settings_store import SettingsStore


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
