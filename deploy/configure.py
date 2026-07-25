from __future__ import annotations

import getpass
import sys
from pathlib import Path


def read_values(lines: list[str]) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def replace_value(lines: list[str], key: str, value: str) -> list[str]:
    prefix = f"{key}="
    for index, line in enumerate(lines):
        if line.startswith(prefix):
            lines[index] = f"{prefix}{value}"
            return lines
    lines.append(f"{prefix}{value}")
    return lines


def configure(path: Path) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    values = read_values(lines)
    print("\n配置模型 API Key（输入内容不会回显，直接回车可跳过或保留现值）")
    providers = (
        ("DEEPSEEK_API_KEY", "DeepSeek API Key"),
        ("ZHIPU_API_KEY", "智谱 API Key"),
        ("DASHSCOPE_API_KEY", "DashScope / CosyVoice API Key"),
    )
    for key, label in providers:
        suffix = " [已配置]" if values.get(key) else ""
        value = getpass.getpass(f"{label}{suffix}: ").strip()
        if value:
            lines = replace_value(lines, key, value)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        "\nCosyVoice 模型 ID: cosyvoice-v3.5-flash\n"
        "复刻音色 ID: "
        "cosyvoice-v3.5-flash-marchpet-"
        "eb86bcaeea5f40669b1798191950529a"
    )
    print(f"配置已写入 {path}")


if __name__ == "__main__":
    configure(Path(sys.argv[1]).resolve())
