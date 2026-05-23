from fastapi import APIRouter

from app.schemas.ai import AiConfig, AiConfigStatus
from app.schemas.config import AppConfig, AppConfigUpdate, ExportTemplateConfig, ExportTemplateUpdate
from app.services.config_service import config_service
from app.services.credential_service import credential_service
from app.services.export_template_service import export_template_service

router = APIRouter()


@router.get("/config", response_model=AppConfig)
def get_config() -> AppConfig:
    return config_service.get_config()


@router.put("/config", response_model=AppConfig)
def update_config(payload: AppConfigUpdate) -> AppConfig:
    return config_service.update_config(payload)


@router.get("/config/export-template", response_model=ExportTemplateConfig)
def get_export_template() -> ExportTemplateConfig:
    return export_template_service.get_template()


@router.put("/config/export-template", response_model=ExportTemplateConfig)
def update_export_template(payload: ExportTemplateUpdate) -> ExportTemplateConfig:
    return export_template_service.update_template(payload)


@router.post("/config/export-template/reset", response_model=ExportTemplateConfig)
def reset_export_template() -> ExportTemplateConfig:
    return export_template_service.reset_template()


@router.get("/config/export-template/path")
def get_export_template_path() -> dict[str, str]:
    return {"path": export_template_service.get_template_path()}


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
