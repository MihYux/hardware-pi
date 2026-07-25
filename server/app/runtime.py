from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RuntimeSettings:
    host: str
    port: int
    data_dir: Path
    admin_token: str
    device_token: str
    service_token: str

    @classmethod
    def from_env(cls) -> "RuntimeSettings":
        return cls(
            host=os.getenv("HARDWARE_PI_HOST", "0.0.0.0"),
            port=int(os.getenv("HARDWARE_PI_PORT", "8000")),
            data_dir=Path(os.getenv("HARDWARE_PI_DATA_DIR", ".data")).resolve(),
            admin_token=os.getenv("HARDWARE_PI_ADMIN_TOKEN", ""),
            device_token=os.getenv("HARDWARE_PI_DEVICE_TOKEN", ""),
            service_token=os.getenv("HARDWARE_PI_SERVICE_TOKEN", ""),
        )


runtime = RuntimeSettings.from_env()
