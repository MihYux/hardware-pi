from datetime import datetime, timezone

from app.contact_policy import (
    evaluate_contact_policy,
    is_within_quiet_hours,
)


def profile(**overrides):
    value = {
        "onboarding_completed": True,
        "paused": False,
        "proactive_contact_enabled": True,
        "recall_enabled": False,
        "allowed_content_types": [
            "version_preheat",
            "version_launch",
            "version_sustain",
        ],
        "quiet_hours": {"start": "22:00", "end": "09:00"},
        "time_zone": "Asia/Shanghai",
        "weekly_contact_limit": 2,
    }
    value.update(overrides)
    return value


def test_quiet_hours_support_cross_midnight_and_timezone():
    assert is_within_quiet_hours(
        "2026-07-25T15:00:00+00:00",
        {"start": "22:00", "end": "09:00"},
        "Asia/Shanghai",
    )
    assert not is_within_quiet_hours(
        "2026-07-25T05:00:00+00:00",
        {"start": "22:00", "end": "09:00"},
        "Asia/Shanghai",
    )


def test_contact_policy_prioritizes_authorization_and_quiet_hours():
    now = datetime(2026, 7, 25, 15, 0, tzinfo=timezone.utc)
    disabled = evaluate_contact_policy(
        profile=profile(proactive_contact_enabled=False),
        messages=[],
        content_type="version_launch",
        now=now,
    )
    quiet = evaluate_contact_policy(
        profile=profile(),
        messages=[],
        content_type="version_launch",
        now=now,
    )

    assert disabled["reason"] == "proactive_contact_disabled"
    assert quiet["reason"] == "quiet_hours"


def test_contact_policy_applies_interval_weekly_and_example_bypass():
    now = datetime(2026, 7, 25, 5, 0, tzinfo=timezone.utc)
    messages = [
        {
            "type": "version_preheat",
            "delivery_mode": "proactive",
            "template_id": "plan-a",
            "sent_at": "2026-07-24T20:00:00+00:00",
        }
    ]
    limited = evaluate_contact_policy(
        profile=profile(),
        messages=messages,
        content_type="version_launch",
        template_id="plan-b",
        now=now,
    )
    bypassed = evaluate_contact_policy(
        profile=profile(),
        messages=messages,
        content_type="version_launch",
        template_id="plan-b",
        example_frequency_bypass=True,
        now=now,
    )

    assert limited["reason"] == "minimum_contact_interval"
    assert bypassed["allowed"] is True


def test_recall_requires_separate_authorization():
    result = evaluate_contact_policy(
        profile=profile(
            allowed_content_types=[
                "version_preheat",
                "version_launch",
                "version_sustain",
                "recall",
            ]
        ),
        messages=[],
        content_type="recall",
        now="2026-07-25T05:00:00+00:00",
    )

    assert result["reason"] == "recall_not_authorized"
