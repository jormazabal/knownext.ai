from fastapi import APIRouter

from app.schemas.config import AppConfig, AppConfigUpdate
from app.services.config_service import config_service

router = APIRouter()


@router.get("/config", response_model=AppConfig)
def get_config() -> AppConfig:
    return config_service.get_config()


@router.put("/config", response_model=AppConfig)
def update_config(payload: AppConfigUpdate) -> AppConfig:
    return config_service.update_config(payload)
