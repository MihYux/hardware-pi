from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


VERSION_TYPES = {
    "version_preheat",
    "version_launch",
    "version_sustain",
    "recall",
}
MESSAGE_TYPES = {
    "daily",
    "photo",
    "postcard",
    "relationship",
    *VERSION_TYPES,
}
OBJECTIVE_TO_CONTENT_TYPE = {
    "preheat": "version_preheat",
    "launch": "version_launch",
    "sustain": "version_sustain",
    "recall": "recall",
}


def _parse_datetime(value: str | datetime | None) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _clock_minutes(value: Any) -> int | None:
    if not isinstance(value, str):
        return None
    parts = value.split(":")
    if (
        len(parts) != 2
        or any(len(part) != 2 or not part.isdigit() for part in parts)
    ):
        return None
    hour, minute = (int(part) for part in parts)
    if hour > 23 or minute > 59:
        return None
    return hour * 60 + minute


def is_within_quiet_hours(
    at: str | datetime,
    quiet_hours: dict[str, str],
    time_zone: str,
) -> bool:
    instant = _parse_datetime(at)
    start = _clock_minutes(quiet_hours.get("start"))
    end = _clock_minutes(quiet_hours.get("end"))
    if instant is None or start is None or end is None or start == end:
        return False
    try:
        local = instant.astimezone(ZoneInfo(time_zone))
    except ZoneInfoNotFoundError:
        local = instant
    current = local.hour * 60 + local.minute
    if start < end:
        return start <= current < end
    return current >= start or current < end


def _result(
    allowed: bool,
    reason: str | None,
    content_type: str,
    evaluated_at: datetime,
    **details: Any,
) -> dict[str, Any]:
    return {
        "allowed": allowed,
        "reason": reason,
        "content_type": content_type,
        "evaluated_at": evaluated_at.isoformat(),
        "details": details,
    }


def evaluate_contact_policy(
    *,
    profile: dict[str, Any],
    messages: list[dict[str, Any]],
    content_type: str,
    template_id: str = "",
    example_frequency_bypass: bool = False,
    global_campaign_kill_switch: bool = False,
    quiet_until: str | None = None,
    reduced_content_types: list[str] | None = None,
    player_context: dict[str, Any] | None = None,
    now: str | datetime | None = None,
) -> dict[str, Any]:
    evaluated_at = _parse_datetime(now) or datetime.now(timezone.utc)
    if content_type not in MESSAGE_TYPES:
        return _result(
            False, "invalid_event", "", evaluated_at
        )
    if global_campaign_kill_switch and content_type in VERSION_TYPES:
        return _result(
            False,
            "global_campaign_kill_switch",
            content_type,
            evaluated_at,
        )
    if content_type in VERSION_TYPES and player_context:
        if (
            player_context.get("natural_trigger") is False
            or player_context.get("is_chatting") is True
            or player_context.get("negative_emotion") is True
            or player_context.get("panel_open") is True
        ):
            return _result(
                False,
                "context_not_eligible",
                content_type,
                evaluated_at,
            )
    if not profile.get("onboarding_completed"):
        return _result(
            False, "onboarding_required", content_type, evaluated_at
        )
    if profile.get("paused"):
        return _result(
            False, "companion_paused", content_type, evaluated_at
        )
    if not profile.get("proactive_contact_enabled"):
        return _result(
            False,
            "proactive_contact_disabled",
            content_type,
            evaluated_at,
        )
    if content_type == "recall" and not profile.get("recall_enabled"):
        return _result(
            False,
            "recall_not_authorized",
            content_type,
            evaluated_at,
        )
    if content_type not in profile.get("allowed_content_types", []):
        return _result(
            False,
            "content_type_disabled",
            content_type,
            evaluated_at,
        )
    if is_within_quiet_hours(
        evaluated_at,
        profile.get("quiet_hours", {}),
        str(profile.get("time_zone") or "UTC"),
    ):
        quiet = profile.get("quiet_hours", {})
        return _result(
            False,
            "quiet_hours",
            content_type,
            evaluated_at,
            start=quiet.get("start"),
            end=quiet.get("end"),
            time_zone=profile.get("time_zone"),
        )
    quiet_until_at = _parse_datetime(quiet_until)
    if quiet_until_at and quiet_until_at > evaluated_at:
        return _result(
            False,
            "quiet_period",
            content_type,
            evaluated_at,
            quiet_until=quiet_until_at.isoformat(),
        )

    bypass = (
        content_type in VERSION_TYPES and example_frequency_bypass
    )
    week_threshold = evaluated_at - timedelta(days=7)
    proactive: list[tuple[dict[str, Any], datetime]] = []
    for message in messages:
        sent_at = _parse_datetime(message.get("sent_at"))
        if message.get("delivery_mode") == "proactive" and sent_at:
            proactive.append((message, sent_at))
    weekly = [
        (message, sent_at)
        for message, sent_at in proactive
        if sent_at >= week_threshold
    ]
    limit = int(profile.get("weekly_contact_limit") or 0)
    if not bypass and len(weekly) >= limit:
        return _result(
            False,
            "weekly_contact_limit",
            content_type,
            evaluated_at,
            used=len(weekly),
            limit=limit,
        )
    latest = max((sent_at for _, sent_at in proactive), default=None)
    if (
        not bypass
        and latest
        and latest > evaluated_at - timedelta(hours=24)
    ):
        return _result(
            False,
            "minimum_contact_interval",
            content_type,
            evaluated_at,
            last_sent_at=latest.isoformat(),
            hours=24,
        )
    if (
        not bypass
        and content_type in VERSION_TYPES
        and any(message.get("type") in VERSION_TYPES for message, _ in weekly)
    ):
        return _result(
            False,
            "version_weekly_contact_limit",
            content_type,
            evaluated_at,
            used=1,
            limit=1,
        )
    if not bypass and content_type in (reduced_content_types or []):
        threshold = evaluated_at - timedelta(days=14)
        if any(
            message.get("type") == content_type and sent_at >= threshold
            for message, sent_at in proactive
        ):
            return _result(
                False,
                "reduced_content_frequency",
                content_type,
                evaluated_at,
            )
    if not bypass and template_id:
        threshold = evaluated_at - timedelta(days=7)
        if any(
            message.get("template_id") == template_id
            and sent_at >= threshold
            for message, sent_at in proactive
        ):
            return _result(
                False,
                "duplicate_template",
                content_type,
                evaluated_at,
                template_id=template_id,
            )
    return _result(
        True,
        None,
        content_type,
        evaluated_at,
        weekly_used=len(weekly),
        weekly_limit=limit,
        example_frequency_bypass=bypass,
    )
