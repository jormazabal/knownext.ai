from fastapi import APIRouter

from app.schemas.ai import AiConfig, AiConfigStatus
from app.schemas.config import AppConfig, AppConfigUpdate
from app.services.config_service import config_service
from app.services.credential_service import credential_service

router = APIRouter()


@router.get("/config", response_model=AppConfig)
def get_config() -> AppConfig:
    return config_service.get_config()


@router.put("/config", response_model=AppConfig)
def update_config(payload: AppConfigUpdate) -> AppConfig:
    return config_service.update_config(payload)


@router.get("/config/ai", response_model=AiConfigStatus)
def get_ai_config() -> AiConfigStatus:
    config = config_service.get_config().ai
    return AiConfigStatus(
        **config.model_dump(),
        openaiKeyConfigured=credential_service.get_openai_key() is not None,
        openaiKeyPreview=credential_service.get_openai_key_preview(),
    )


@router.put("/config/ai", response_model=AiConfigStatus)
def update_ai_config(payload: AiConfig) -> AiConfigStatus:
    config = config_service.update_config(AppConfigUpdate(ai=payload)).ai
    return AiConfigStatus(
        **config.model_dump(),
        openaiKeyConfigured=credential_service.get_openai_key() is not None,
        openaiKeyPreview=credential_service.get_openai_key_preview(),
    )
