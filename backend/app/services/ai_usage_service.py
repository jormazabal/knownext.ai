from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.schemas.ai import AiUsageModelSummary, AiUsageSummaryResponse
from app.services.app_storage import JsonFileStore


USD_TO_EUR_RATE = 0.92

MODEL_PRICING_USD_PER_MILLION = {
    "gpt-5.5": {"input": 2.50, "cached_input": 0.25, "output": 15.00},
    "gpt-5.4": {"input": 2.50, "cached_input": 0.25, "output": 15.00},
    "gpt-5.4-mini": {"input": 0.75, "cached_input": 0.075, "output": 4.50},
    "gpt-5.4-nano": {"input": 0.20, "cached_input": 0.02, "output": 1.25},
}


class AiUsageService:
    def __init__(self) -> None:
        self.store = JsonFileStore("ai-usage-events.json")

    def record_provider_event(
        self,
        *,
        project_id: str,
        request_id: str,
        model: str,
        usage_kind: str,
        status: str,
        usage: dict[str, Any] | None,
        document_id: str | None = None,
        error_code: str | None = None,
    ) -> dict[str, Any] | None:
        normalized_usage = _normalize_usage(usage)
        if normalized_usage is None:
            return None

        cost, pricing_snapshot = self._estimate_cost(model, normalized_usage)
        event = {
            "id": f"usage-{uuid4()}",
            "createdAt": _now_iso(),
            "projectId": project_id,
            "documentId": document_id,
            "conversationId": project_id,
            "requestId": request_id,
            "provider": "openai",
            "model": model,
            "usageKind": usage_kind,
            "status": status,
            "billable": cost > 0 or normalized_usage["totalTokens"] > 0,
            "errorCode": error_code,
            "usageSource": normalized_usage["usageSource"],
            "inputTokens": normalized_usage["inputTokens"],
            "cachedInputTokens": normalized_usage["cachedInputTokens"],
            "outputTokens": normalized_usage["outputTokens"],
            "reasoningTokens": normalized_usage["reasoningTokens"],
            "embeddingTokens": normalized_usage["embeddingTokens"],
            "totalTokens": normalized_usage["totalTokens"],
            "estimatedCost": cost,
            "currency": "EUR",
            "pricingSnapshot": pricing_snapshot,
        }
        self._append_event(event)
        return event

    def get_summary(self, month: str | None = None, tz_offset_minutes: int = 0) -> AiUsageSummaryResponse:
        tz = timezone(timedelta(minutes=tz_offset_minutes))
        selected_month = month or datetime.now(tz).strftime("%Y-%m")
        events = self._read_events()
        model_summaries: dict[str, dict[str, Any]] = {}

        for event in events:
            if not _event_in_month(event, selected_month, tz):
                continue
            if not event.get("billable"):
                continue

            model = str(event.get("model") or "unknown")
            summary = model_summaries.setdefault(
                model,
                {
                    "model": model,
                    "interactions": 0,
                    "inputTokens": 0,
                    "cachedInputTokens": 0,
                    "outputTokens": 0,
                    "reasoningTokens": 0,
                    "embeddingTokens": 0,
                    "totalTokens": 0,
                    "estimatedCost": 0.0,
                    "currency": "EUR",
                    "usageSources": set(),
                },
            )
            summary["interactions"] += 1
            for key in ("inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "embeddingTokens", "totalTokens"):
                summary[key] += _int_value(event.get(key))
            summary["estimatedCost"] += _float_value(event.get("estimatedCost"))
            summary["usageSources"].add(str(event.get("usageSource") or "unknown"))

        models = []
        for summary in model_summaries.values():
            usage_sources = summary.pop("usageSources")
            summary["usageSource"] = next(iter(usage_sources)) if len(usage_sources) == 1 else "mixed"
            summary["estimatedCost"] = round(summary["estimatedCost"], 6)
            models.append(AiUsageModelSummary(**summary))

        models.sort(key=lambda item: item.estimatedCost, reverse=True)
        return AiUsageSummaryResponse(
            month=selected_month,
            totalEstimatedCost=round(sum(model.estimatedCost for model in models), 6),
            generatedAt=_now_iso(),
            models=models,
        )

    def _append_event(self, event: dict[str, Any]) -> None:
        data = self.store.read({"schemaVersion": 1, "events": []})
        events = data.get("events") if isinstance(data.get("events"), list) else []
        events.append(event)
        self.store.write({"schemaVersion": 1, "events": events})

    def _read_events(self) -> list[dict[str, Any]]:
        data = self.store.read({"schemaVersion": 1, "events": []})
        events = data.get("events")
        return [event for event in events if isinstance(event, dict)] if isinstance(events, list) else []

    def _estimate_cost(self, model: str, usage: dict[str, int | str]) -> tuple[float, dict[str, Any]]:
        pricing = MODEL_PRICING_USD_PER_MILLION.get(model, MODEL_PRICING_USD_PER_MILLION["gpt-5.4"])
        input_tokens = max(_int_value(usage.get("inputTokens")) - _int_value(usage.get("cachedInputTokens")), 0)
        cached_input_tokens = _int_value(usage.get("cachedInputTokens"))
        output_tokens = _int_value(usage.get("outputTokens"))
        cost_usd = (
            input_tokens * pricing["input"]
            + cached_input_tokens * pricing["cached_input"]
            + output_tokens * pricing["output"]
        ) / 1_000_000
        cost_eur = cost_usd * USD_TO_EUR_RATE
        return round(cost_eur, 6), {
            "schemaVersion": 1,
            "source": "local_openai_pricing_estimate",
            "baseCurrency": "USD",
            "currency": "EUR",
            "usdToEurRate": USD_TO_EUR_RATE,
            "pricePerMillionTokensUsd": pricing,
            "capturedAt": _now_iso(),
        }


def _normalize_usage(usage: dict[str, Any] | None) -> dict[str, int | str] | None:
    if not isinstance(usage, dict):
        return None
    input_tokens = _int_value(usage.get("inputTokens"))
    cached_input_tokens = _int_value(usage.get("cachedInputTokens"))
    output_tokens = _int_value(usage.get("outputTokens"))
    reasoning_tokens = _int_value(usage.get("reasoningTokens"))
    embedding_tokens = _int_value(usage.get("embeddingTokens"))
    total_tokens = _int_value(usage.get("totalTokens")) or input_tokens + output_tokens + embedding_tokens
    if total_tokens <= 0:
        return None
    return {
        "inputTokens": input_tokens,
        "cachedInputTokens": cached_input_tokens,
        "outputTokens": output_tokens,
        "reasoningTokens": reasoning_tokens,
        "embeddingTokens": embedding_tokens,
        "totalTokens": total_tokens,
        "usageSource": str(usage.get("usageSource") or "provider"),
    }


def _event_in_month(event: dict[str, Any], month: str, tz: timezone) -> bool:
    created_at = event.get("createdAt")
    if not isinstance(created_at, str):
        return False
    try:
        value = datetime.fromisoformat(created_at)
    except ValueError:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(tz).strftime("%Y-%m") == month


def _int_value(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def _float_value(value: Any) -> float:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else 0.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


ai_usage_service = AiUsageService()
