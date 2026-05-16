from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.schemas.ai import AiUsageCapabilitySummary, AiUsageModelSummary, AiUsageSummaryResponse
from app.services.app_storage import JsonFileStore, get_app_data_dir


USD_TO_EUR_RATE = 0.92

MODEL_PRICING_USD_PER_MILLION = {
    "gpt-5.5": {"input": 2.50, "cached_input": 0.25, "output": 15.00},
    "gpt-5.4": {"input": 2.50, "cached_input": 0.25, "output": 15.00},
    "gpt-5.4-mini": {"input": 0.75, "cached_input": 0.075, "output": 4.50},
    "gpt-5.4-nano": {"input": 0.20, "cached_input": 0.02, "output": 1.25},
}

IMAGE_GENERATION_PRICE_USD = {
    "gpt-image-2": {"low": 0.005, "medium": 0.042, "high": 0.211, "auto": 0.042},
    "gpt-image-1.5": {"low": 0.004, "medium": 0.035, "high": 0.180, "auto": 0.035},
    "gpt-image-1": {"low": 0.004, "medium": 0.030, "high": 0.160, "auto": 0.030},
    "gpt-image-1-mini": {"low": 0.002, "medium": 0.010, "high": 0.040, "auto": 0.010},
}

TRANSCRIPTION_PRICING_USD_PER_MILLION = {
    "gpt-realtime-whisper": {"input": 0.006, "output": 0.018},
}

VISION_DETAIL_ESTIMATED_INPUT_TOKENS = {
    "low": 85,
    "auto": 255,
    "high": 765,
}

CAPABILITY_LABELS = {
    "document_ai": "IA documental",
    "image_generation": "Imágenes",
    "vision": "Visión",
    "audio": "Audio",
    "agentic_tasks": "Tareas agénticas",
}

CAPABILITY_ORDER = list(CAPABILITY_LABELS.keys())


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

    def record_estimated_event(
        self,
        *,
        project_id: str,
        request_id: str,
        model: str,
        usage_kind: str,
        status: str = "completed",
        document_id: str | None = None,
        input_tokens: int = 0,
        cached_input_tokens: int = 0,
        output_tokens: int = 0,
        reasoning_tokens: int = 0,
        embedding_tokens: int = 0,
        estimated_cost: float = 0.0,
        pricing_snapshot: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        error_code: str | None = None,
    ) -> dict[str, Any]:
        total_tokens = max(input_tokens + output_tokens + embedding_tokens, 0)
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
            "billable": True,
            "errorCode": error_code,
            "usageSource": "estimated",
            "inputTokens": max(input_tokens, 0),
            "cachedInputTokens": max(cached_input_tokens, 0),
            "outputTokens": max(output_tokens, 0),
            "reasoningTokens": max(reasoning_tokens, 0),
            "embeddingTokens": max(embedding_tokens, 0),
            "totalTokens": total_tokens,
            "estimatedCost": round(max(estimated_cost, 0.0), 6),
            "currency": "EUR",
            "pricingSnapshot": pricing_snapshot or self._estimated_pricing_snapshot("manual_estimate"),
            "metadata": metadata or {},
        }
        self._append_event(event)
        return event

    def record_image_generation_event(
        self,
        *,
        project_id: str,
        request_id: str,
        model: str,
        size: str,
        quality: str,
        output_format: str,
        image_count: int = 1,
        document_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_quality = quality if quality in {"low", "medium", "high", "auto"} else "auto"
        pricing = IMAGE_GENERATION_PRICE_USD.get(model, IMAGE_GENERATION_PRICE_USD["gpt-image-2"])
        unit_price_usd = pricing.get(normalized_quality, pricing["auto"])
        image_count = max(image_count, 1)
        return self.record_estimated_event(
            project_id=project_id,
            document_id=document_id,
            request_id=request_id,
            model=model,
            usage_kind="image_generation",
            estimated_cost=round(unit_price_usd * image_count * USD_TO_EUR_RATE, 6),
            pricing_snapshot={
                **self._estimated_pricing_snapshot("local_openai_image_pricing_estimate"),
                "unitPriceUsd": unit_price_usd,
                "imageCount": image_count,
                "size": size,
                "quality": normalized_quality,
                "format": output_format,
            },
            metadata=metadata,
        )

    def record_vision_event(
        self,
        *,
        project_id: str,
        request_id: str,
        model: str,
        detail: str,
        image_count: int = 1,
        document_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        detail = detail if detail in VISION_DETAIL_ESTIMATED_INPUT_TOKENS else "auto"
        image_count = max(image_count, 1)
        input_tokens = VISION_DETAIL_ESTIMATED_INPUT_TOKENS[detail] * image_count
        usage = {
            "inputTokens": input_tokens,
            "cachedInputTokens": 0,
            "outputTokens": 80 * image_count,
            "reasoningTokens": 0,
            "embeddingTokens": 0,
            "totalTokens": input_tokens + 80 * image_count,
            "usageSource": "estimated",
        }
        cost, pricing_snapshot = self._estimate_cost(model, usage)
        return self.record_estimated_event(
            project_id=project_id,
            document_id=document_id,
            request_id=request_id,
            model=model,
            usage_kind="vision",
            input_tokens=input_tokens,
            output_tokens=80 * image_count,
            estimated_cost=cost,
            pricing_snapshot={**pricing_snapshot, "detail": detail, "imageCount": image_count},
            metadata=metadata,
        )

    def record_audio_transcription_event(
        self,
        *,
        project_id: str,
        request_id: str,
        model: str,
        transcript: str,
        document_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        output_tokens = _estimate_text_tokens(transcript)
        pricing = TRANSCRIPTION_PRICING_USD_PER_MILLION.get(model, TRANSCRIPTION_PRICING_USD_PER_MILLION["gpt-realtime-whisper"])
        cost_usd = output_tokens * pricing["output"] / 1_000_000
        return self.record_estimated_event(
            project_id=project_id,
            document_id=document_id,
            request_id=request_id,
            model=model,
            usage_kind="transcription",
            output_tokens=output_tokens,
            estimated_cost=round(cost_usd * USD_TO_EUR_RATE, 6),
            pricing_snapshot={
                **self._estimated_pricing_snapshot("local_openai_transcription_pricing_estimate"),
                "pricePerMillionTokensUsd": pricing,
            },
            metadata=metadata,
        )

    def get_summary(self, month: str | None = None, tz_offset_minutes: int = 0) -> AiUsageSummaryResponse:
        tz = timezone(timedelta(minutes=tz_offset_minutes))
        selected_month = month or datetime.now(tz).strftime("%Y-%m")
        events = self._read_events()
        events = [*events, *self._read_generated_image_fallback_events(events)]
        model_summaries: dict[str, dict[str, Any]] = {}
        capability_summaries: dict[str, dict[str, Any]] = {
            capability: _empty_capability_summary(capability) for capability in CAPABILITY_ORDER
        }

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

            capability = _capability_from_event(event)
            capability_summary = capability_summaries.setdefault(capability, _empty_capability_summary(capability))
            capability_summary["interactions"] += 1
            for key in ("inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "embeddingTokens", "totalTokens"):
                capability_summary[key] += _int_value(event.get(key))
            capability_summary["estimatedCost"] += _float_value(event.get("estimatedCost"))
            capability_summary["usageSources"].add(str(event.get("usageSource") or "unknown"))

        models = []
        for summary in model_summaries.values():
            usage_sources = summary.pop("usageSources")
            summary["usageSource"] = next(iter(usage_sources)) if len(usage_sources) == 1 else "mixed"
            summary["estimatedCost"] = round(summary["estimatedCost"], 6)
            models.append(AiUsageModelSummary(**summary))

        models.sort(key=lambda item: item.estimatedCost, reverse=True)
        capabilities = []
        for capability in CAPABILITY_ORDER:
            summary = capability_summaries[capability]
            usage_sources = summary.pop("usageSources")
            summary["usageSource"] = next(iter(usage_sources)) if len(usage_sources) == 1 else "mixed" if usage_sources else "unknown"
            summary["estimatedCost"] = round(summary["estimatedCost"], 6)
            capabilities.append(AiUsageCapabilitySummary(**summary))

        return AiUsageSummaryResponse(
            month=selected_month,
            totalEstimatedCost=round(sum(model.estimatedCost for model in models), 6),
            generatedAt=_now_iso(),
            capabilities=capabilities,
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

    def _read_generated_image_fallback_events(self, existing_events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        generated_dir = get_app_data_dir() / "ai-generated-images"
        if not generated_dir.exists():
            return []

        recorded_asset_paths = {
            str(metadata.get("assetPath"))
            for event in existing_events
            if str(event.get("usageKind") or "") == "image_generation"
            for metadata in [event.get("metadata")]
            if isinstance(metadata, dict) and metadata.get("assetPath")
        }
        fallback_events: list[dict[str, Any]] = []
        for store_path in generated_dir.glob("*.json"):
            project_id = store_path.stem
            try:
                data = json.loads(store_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            images = data.get("images")
            if not isinstance(images, list):
                continue
            for image in images:
                if not isinstance(image, dict):
                    continue
                asset_path = image.get("path")
                if not isinstance(asset_path, str) or asset_path in recorded_asset_paths:
                    continue
                model = str(image.get("model") or "gpt-image-2")
                quality = str(image.get("quality") or "auto")
                pricing = IMAGE_GENERATION_PRICE_USD.get(model, IMAGE_GENERATION_PRICE_USD["gpt-image-2"])
                unit_price_usd = pricing.get(quality, pricing["auto"])
                fallback_events.append(
                    {
                        "id": f"usage-generated-fallback-{project_id}-{asset_path}",
                        "createdAt": str(image.get("updatedAt") or data.get("updatedAt") or _now_iso()),
                        "projectId": project_id,
                        "documentId": image.get("sourceDocumentId") if isinstance(image.get("sourceDocumentId"), str) else None,
                        "conversationId": project_id,
                        "requestId": f"generated-image:{asset_path}",
                        "provider": "openai",
                        "model": model,
                        "usageKind": "image_generation",
                        "status": "completed",
                        "billable": True,
                        "errorCode": None,
                        "usageSource": "estimated",
                        "inputTokens": 0,
                        "cachedInputTokens": 0,
                        "outputTokens": 0,
                        "reasoningTokens": 0,
                        "embeddingTokens": 0,
                        "totalTokens": 0,
                        "estimatedCost": round(unit_price_usd * USD_TO_EUR_RATE, 6),
                        "currency": "EUR",
                        "pricingSnapshot": self._estimated_pricing_snapshot("generated_image_metadata_fallback"),
                        "metadata": {"assetPath": asset_path, "source": "generated_image_metadata"},
                    }
                )
        return fallback_events

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

    def _estimated_pricing_snapshot(self, source: str) -> dict[str, Any]:
        return {
            "schemaVersion": 1,
            "source": source,
            "baseCurrency": "USD",
            "currency": "EUR",
            "usdToEurRate": USD_TO_EUR_RATE,
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


def _empty_capability_summary(capability: str) -> dict[str, Any]:
    return {
        "capability": capability,
        "label": CAPABILITY_LABELS.get(capability, capability),
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
    }


def _capability_from_event(event: dict[str, Any]) -> str:
    usage_kind = str(event.get("usageKind") or "")
    model = str(event.get("model") or "")
    if usage_kind == "agentic_task":
        return "agentic_tasks"
    if usage_kind == "image_generation" or model.startswith("gpt-image"):
        return "image_generation"
    if usage_kind in {"vision", "image_vision"}:
        return "vision"
    if usage_kind in {"audio", "transcription"} or "whisper" in model:
        return "audio"
    return "document_ai"


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


def _estimate_text_tokens(value: str) -> int:
    if not value.strip():
        return 0
    return max(1, int(len(value.strip()) / 4))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


ai_usage_service = AiUsageService()
