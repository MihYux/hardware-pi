from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RuntimeSettings:
    host: str
    port: int
    workbench_port: int
    data_dir: Path
    auth_mode: str
    admin_token: str
    device_token: str
    service_token: str
    bridge_dir: Path

    @property
    def auth_required(self) -> bool:
        return self.auth_mode == "token"

    @classmethod
    def from_env(cls) -> "RuntimeSettings":
        return cls(
            host=os.getenv("HARDWARE_PI_HOST", "0.0.0.0"),
            port=int(os.getenv("HARDWARE_PI_PORT", "8000")),
            workbench_port=int(
                os.getenv("HARDWARE_PI_WORKBENCH_PORT", "3000")
            ),
            data_dir=Path(os.getenv("HARDWARE_PI_DATA_DIR", ".data")).resolve(),
            auth_mode=(
                "token"
                if os.getenv("HARDWARE_PI_AUTH_MODE", "off")
                .strip()
                .lower()
                == "token"
                else "off"
            ),
            admin_token=os.getenv("HARDWARE_PI_ADMIN_TOKEN", ""),
            device_token=os.getenv("HARDWARE_PI_DEVICE_TOKEN", ""),
            service_token=os.getenv("HARDWARE_PI_SERVICE_TOKEN", ""),
            bridge_dir=Path(
                os.getenv(
                    "MARCH7TH_BRIDGE_DIR",
                    str(
                        Path(
                            os.getenv(
                                "HARDWARE_PI_DATA_DIR",
                                ".data",
                            )
                        )
                        / "bridge"
                    ),
                )
            ).resolve(),
        )


runtime = RuntimeSettings.from_env()
