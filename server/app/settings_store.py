from __future__ import annotations

import json
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path

from .models import (
    ControlPlaneSettings,
    ProviderName,
    SettingsPatch,
)


def _mask_key(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "••••••••"
    return f"{value[:3]}••••{value[-4:]}"


class SettingsStore:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.path = data_dir / "control-plane.json"
        self._lock = threading.RLock()

    def _bootstrap(self) -> ControlPlaneSettings:
        settings = ControlPlaneSettings()
        settings.deepseek.api_key = os.getenv("DEEPSEEK_API_KEY", "")
        settings.deepseek.model = os.getenv(
            "DEEPSEEK_MODEL", settings.deepseek.model
        )
        settings.deepseek.base_url = os.getenv(
            "DEEPSEEK_BASE_URL", settings.deepseek.base_url
        ).rstrip("/")
        settings.zhipu.api_key = os.getenv("ZHIPU_API_KEY", "")
        settings.zhipu.model = os.getenv("GLM_MODEL", settings.zhipu.model)
        settings.zhipu.base_url = os.getenv(
            "GLM_BASE_URL", settings.zhipu.base_url
        ).rstrip("/")
        settings.cosyvoice.api_key = os.getenv("DASHSCOPE_API_KEY", "")
        settings.cosyvoice.model = os.getenv(
            "COSYVOICE_MODEL", settings.cosyvoice.model
        )
        return settings

    def _merge_missing_environment(
        self, settings: ControlPlaneSettings
    ) -> bool:
        changed = False
        environment_keys = {
            "deepseek": os.getenv("DEEPSEEK_API_KEY", ""),
            "zhipu": os.getenv("ZHIPU_API_KEY", ""),
            "cosyvoice": os.getenv("DASHSCOPE_API_KEY", ""),
        }
        for name, value in environment_keys.items():
            provider = getattr(settings, name)
            if not provider.api_key and value:
                provider.api_key = value
                changed = True
        return changed

    def load(self) -> ControlPlaneSettings:
        with self._lock:
            if not self.path.exists():
                settings = self._bootstrap()
                self.save(settings)
                return settings
            settings = ControlPlaneSettings.model_validate_json(
                self.path.read_text(encoding="utf-8")
            )
            if self._merge_missing_environment(settings):
                self.save(settings)
            return settings

    def save(self, settings: ControlPlaneSettings) -> ControlPlaneSettings:
        with self._lock:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            settings.updated_at = datetime.now(timezone.utc).isoformat()
            payload = settings.model_dump_json(indent=2)
            descriptor, temporary_name = tempfile.mkstemp(
                prefix="control-plane.", suffix=".tmp", dir=self.data_dir
            )
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    handle.write(payload)
                    handle.write("\n")
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chmod(temporary_name, 0o600)
                os.replace(temporary_name, self.path)
            finally:
                if os.path.exists(temporary_name):
                    os.unlink(temporary_name)
            return settings

    def patch(self, patch: SettingsPatch) -> ControlPlaneSettings:
        with self._lock:
            settings = self.load()
            for name, provider_patch in patch.providers.items():
                provider = getattr(settings, name)
                update = provider_patch.model_dump(exclude_none=True)
                clear_api_key = bool(update.pop("clear_api_key", False))
                if clear_api_key:
                    provider.api_key = ""
                api_key = update.pop("api_key", None)
                if api_key is not None and api_key.strip():
                    provider.api_key = api_key.strip()
                if "base_url" in update:
                    update["base_url"] = str(update["base_url"]).rstrip("/")
                for key, value in update.items():
                    setattr(provider, key, value)
            if patch.routing:
                for key, value in patch.routing.model_dump(
                    exclude_none=True
                ).items():
                    setattr(settings.routing, key, value)
            return self.save(settings)

    def public_view(self) -> dict:
        settings = self.load()
        payload = settings.model_dump()
        for name in ("deepseek", "zhipu", "cosyvoice"):
            provider = payload[name]
            raw_key = provider.pop("api_key")
            provider["configured"] = bool(raw_key)
            provider["api_key_masked"] = _mask_key(raw_key)
        return payload

    def provider(self, name: ProviderName):
        return getattr(self.load(), name)
