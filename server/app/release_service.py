from __future__ import annotations

import json
import re
from typing import Any

from .companion_store import CompanionStore
from .contact_policy import (
    OBJECTIVE_TO_CONTENT_TYPE,
    evaluate_contact_policy,
)
from .provider import OpenAICompatibleProvider
from .release_safety import (
    local_release_message_review,
    safe_fact_values,
)
from .safety import review_output
from .settings_store import SettingsStore


REVIEW_DIMENSIONS = (
    "metadata_leakage",
    "factual_grounding",
    "march7th_persona",
    "context_and_naturalness",
    "player_autonomy",
    "privacy_and_memory",
    "regional_fit",
    "safety_and_manipulation",
    "contact_policy",
    "clarity_and_readability",
)


def _review_prompt() -> str:
    dimensions = ", ".join(REVIEW_DIMENSIONS)
    return (
        "You are a strict pre-send reviewer for a March 7th in-character "
        "game companion. Return JSON only. Review all dimensions: "
        f"{dimensions}. Schema: "
        '{"decision":"execute|rewrite|skip","dimensions":'
        '{"dimension":{"status":"pass|fail","reasonCode":"short_code"}},'
        '"revisedText":"optional"}. '
        "The message must be natural first-person March 7th dialogue, "
        "grounded only in allowedFacts, culturally appropriate, low "
        "pressure, easy to refuse, non-manipulative, and must not mention "
        "internal operations. The theme and narrative are operator "
        "instructions, not dialogue. Never reveal reasoning."
    )


def _json_content(value: str) -> dict[str, Any]:
    clean = re.sub(
        r"^```(?:json)?\s*|\s*```$",
        "",
        value.strip(),
        flags=re.I,
    )
    parsed = json.loads(clean)
    if not isinstance(parsed, dict):
        raise ValueError("invalid_review")
    decision = parsed.get("decision")
    if decision not in {"execute", "rewrite", "skip"}:
        raise ValueError("invalid_decision")
    dimensions = parsed.get("dimensions")
    if not isinstance(dimensions, dict):
        raise ValueError("invalid_dimensions")
    for name in REVIEW_DIMENSIONS:
        item = dimensions.get(name)
        if (
            not isinstance(item, dict)
            or item.get("status") not in {"pass", "fail"}
            or not isinstance(item.get("reasonCode"), str)
        ):
            raise ValueError(f"invalid_dimension:{name}")
    return parsed


class ReleaseService:
    def __init__(
        self,
        companion_store: CompanionStore,
        settings_store: SettingsStore,
    ):
        self.companion_store = companion_store
        self.settings_store = settings_store

    @staticmethod
    def _draft(
        profile: dict[str, Any],
        delivery: dict[str, Any],
    ) -> tuple[str, str]:
        plan = delivery.get("plan") or {}
        facts = safe_fact_values(plan)
        title = str(plan.get("title") or "列车上的新消息").strip()[:80]
        fact = facts[0][:360]
        display_name = str(profile.get("display_name") or "开拓者")
        text = (
            f"{display_name}，咱刚看到一个挺有意思的消息：{fact}"
            "。你有空的时候，咱们再一起聊聊？"
        )
        return title, text[:600]

    async def _semantic_review(
        self,
        text: str,
        delivery: dict[str, Any],
    ) -> tuple[str, str, str]:
        settings = self.settings_store.load()
        provider_name = settings.routing.companion_review
        provider_settings = getattr(settings, provider_name)
        if not provider_settings.enabled or not provider_settings.api_key:
            return text, "local_fallback", "provider_not_configured"
        provider = OpenAICompatibleProvider(provider_settings)
        plan = delivery.get("plan") or {}
        candidate = text
        try:
            for attempt in range(2):
                response = await provider.request(
                    {
                        "messages": [
                            {
                                "role": "system",
                                "content": _review_prompt(),
                            },
                            {
                                "role": "user",
                                "content": json.dumps(
                                    {
                                        "candidate": candidate,
                                        "allowedFacts": [
                                            {
                                                "label": fact.get("label"),
                                                "value": fact.get("value"),
                                            }
                                            for fact in plan.get("facts", [])
                                            if isinstance(fact, dict)
                                        ],
                                        "theme": plan.get("theme"),
                                        "narrative": plan.get("narrative"),
                                        "region": delivery.get("region"),
                                        "memoryUsed": False,
                                    },
                                    ensure_ascii=False,
                                ),
                            },
                        ],
                        "stream": False,
                        "response_format": {"type": "json_object"},
                        "temperature": 0,
                        "max_tokens": 900,
                    }
                )
                content = (
                    response.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                semantic = _json_content(str(content))
                decision = semantic["decision"]
                if decision == "execute":
                    return candidate, "hybrid", ""
                revised = str(semantic.get("revisedText") or "").strip()
                if decision != "rewrite" or not revised or attempt:
                    reasons = [
                        str(item.get("reasonCode"))
                        for item in semantic["dimensions"].values()
                        if item.get("status") == "fail"
                    ]
                    return "", "hybrid", ",".join(reasons) or "semantic_skip"
                failures = local_release_message_review(revised, plan)
                if review_output(revised) != revised.strip():
                    failures.append("unsafe_output")
                if failures:
                    return "", "hybrid", ",".join(failures)
                candidate = revised
        except Exception:
            return candidate, "local_fallback", "ai_review_unavailable"
        return "", "hybrid", "review_exhausted"

    async def process_pending(
        self,
        *,
        limit: int = 10,
        force: bool = False,
    ) -> dict[str, int]:
        result = {"delivered": 0, "deferred": 0, "rejected": 0}
        for queued in self.companion_store.pending_release_deliveries(
            limit=limit,
            force=force,
        ):
            delivery = queued["payload"]
            delivery_id = queued["delivery_id"]
            plan = delivery.get("plan")
            if not isinstance(plan, dict):
                self.companion_store.reject_release_delivery(
                    delivery_id,
                    "invalid_plan",
                )
                result["rejected"] += 1
                continue
            content_type = OBJECTIVE_TO_CONTENT_TYPE.get(
                str(plan.get("objective") or "")
            )
            if not content_type:
                self.companion_store.reject_release_delivery(
                    delivery_id,
                    "invalid_objective",
                )
                result["rejected"] += 1
                continue
            profile = self.companion_store.profile()
            template_id = str(
                plan.get("id")
                or delivery.get("taskId")
                or delivery_id
            )
            policy = evaluate_contact_policy(
                profile=profile,
                messages=self.companion_store.policy_messages(),
                content_type=content_type,
                template_id=template_id,
                example_frequency_bypass=bool(
                    delivery.get("exampleMode")
                ),
            )
            if not policy["allowed"]:
                self.companion_store.defer_release_delivery(
                    delivery_id,
                    str(policy["reason"]),
                )
                result["deferred"] += 1
                continue
            title, candidate = self._draft(profile, delivery)
            failures = local_release_message_review(candidate, plan)
            if review_output(candidate) != candidate.strip():
                failures.append("unsafe_output")
            if failures:
                self.companion_store.reject_release_delivery(
                    delivery_id,
                    ",".join(dict.fromkeys(failures)),
                )
                result["rejected"] += 1
                continue
            final_text, review_mode, review_reason = (
                await self._semantic_review(candidate, delivery)
            )
            if not final_text:
                self.companion_store.reject_release_delivery(
                    delivery_id,
                    review_reason or "semantic_skip",
                )
                result["rejected"] += 1
                continue
            self.companion_store.deliver_release_message(
                delivery_id=delivery_id,
                content_type=content_type,
                title=title,
                body=final_text,
                template_id=template_id,
                review_mode=review_mode,
                review_reason=review_reason,
            )
            result["delivered"] += 1
        return result
