from __future__ import annotations

import re
from typing import Any


ISO_MACHINE_TIMESTAMP = re.compile(
    r"\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z\b",
    re.I,
)
SHA256_VALUE = re.compile(
    r"\b(?:sha-?256\s*[:=]?\s*)?[a-f0-9]{64}\b",
    re.I,
)
INTERNAL_ID = re.compile(
    r"\b(?:task|delivery|release|audit|research(?:_run)?)[_-]"
    r"[a-z0-9_-]{6,}\b",
    re.I,
)
FILE_PATH = re.compile(
    r"(?:[a-z]:\\|\.{0,2}[\\/])[^\s]+|"
    r"[^\s]+\.(?:json|md|markdown|docx|pdf)\b",
    re.I,
)
INTERNAL_LABEL = re.compile(
    r"(?:生成时间|导入时间|内容校验值|校验值|文件名|方案文件|"
    r"研究任务\s*ID|发布\s*ID|任务\s*ID|schemaVersion|generatedAt|"
    r"importedAt|checksum|sourceDocument|researchRunId|deliveryId|taskId)",
    re.I,
)
MARKUP_OR_JSON_FIELD = re.compile(
    r'(?:^|\n)\s*(?:#{1,6}\s+|```|\{\s*"|'
    r'"(?:schemaVersion|checksum|deliveryId|taskId)"\s*:)',
    re.I,
)
OBJECTIVE_LANGUAGE = re.compile(
    r"(?:由三月七以.{0,16}视角|激发玩家|提升玩家|引导玩家|"
    r"目标玩家|本次发行目标|发行任务目标)"
)
OPERATOR_AS_DIALOGUE = re.compile(
    r'和[“"]?[^”"。]{20,}[”"]?有关的(?:新鲜事|消息)'
)


def metadata_reason(value: Any, field: str = "fact") -> str | None:
    text = value.strip() if isinstance(value, str) else ""
    if not text:
        return "empty"
    if INTERNAL_LABEL.search(text):
        return "internal_label"
    if ISO_MACHINE_TIMESTAMP.search(text):
        return "machine_timestamp"
    if SHA256_VALUE.search(text):
        return "checksum"
    if INTERNAL_ID.search(text):
        return "internal_id"
    if FILE_PATH.search(text):
        return "file_path"
    if field != "narrative" and MARKUP_OR_JSON_FIELD.search(text):
        return "markup_or_json"
    return None


def validate_release_plan_fields(plan: Any) -> list[dict[str, str]]:
    if not isinstance(plan, dict):
        return [{"field": "plan", "reason": "invalid"}]
    errors: list[dict[str, str]] = []
    for field in ("title", "theme", "narrative", "timeWindow"):
        reason = metadata_reason(plan.get(field), field)
        if reason and reason != "empty":
            errors.append({"field": field, "reason": reason})
    facts = plan.get("facts")
    if not isinstance(facts, list):
        facts = []
    for index, fact in enumerate(facts):
        if not isinstance(fact, dict):
            errors.append(
                {"field": f"facts[{index}]", "reason": "invalid"}
            )
            continue
        for key in ("label", "value", "source"):
            reason = metadata_reason(fact.get(key), "fact")
            if reason and reason != "empty":
                errors.append(
                    {
                        "field": f"facts[{index}].{key}",
                        "reason": reason,
                    }
                )
    return errors


def safe_fact_values(plan: dict[str, Any]) -> list[str]:
    values: list[str] = []
    facts = plan.get("facts")
    if not isinstance(facts, list):
        return values
    for fact in facts:
        if not isinstance(fact, dict):
            continue
        value = str(fact.get("value") or "").strip()
        if value and not metadata_reason(value, "fact"):
            values.append(value)
    return values


def local_release_message_review(
    text: str,
    plan: dict[str, Any],
    *,
    contact_allowed: bool = True,
) -> list[str]:
    failures: list[str] = []
    if validate_release_plan_fields(plan):
        failures.append("internal_metadata")
    text_metadata = metadata_reason(text, "narrative")
    if text_metadata and text_metadata != "empty":
        failures.append("internal_metadata")
    if not safe_fact_values(plan):
        failures.append("no_safe_fact")
    if not isinstance(text, str) or not text.strip() or len(text) > 600:
        failures.append("invalid_length")
    if OBJECTIVE_LANGUAGE.search(text or ""):
        failures.append("operator_objective_as_dialogue")
    theme = str(plan.get("theme") or "").strip()
    if len(theme) > 20 and theme in (text or ""):
        failures.append("operator_objective_as_dialogue")
    if OPERATOR_AS_DIALOGUE.search(text or ""):
        failures.append("operator_objective_as_dialogue")
    if not contact_allowed:
        failures.append("contact_not_allowed")
    return list(dict.fromkeys(failures))
