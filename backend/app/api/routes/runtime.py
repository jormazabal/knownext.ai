from fastapi import APIRouter

from fastapi import HTTPException

from app.schemas.runtime import FolderOpenRequest, FolderSelectionRequest, FolderSelectionResponse, TraceLogRequest, TraceLogStatus
from app.services.logging_service import trace_logging_service
from app.services.runtime_service import runtime_service

router = APIRouter()


@router.post("/runtime/select-folder", response_model=FolderSelectionResponse)
def select_folder(payload: FolderSelectionRequest) -> FolderSelectionResponse:
    return FolderSelectionResponse(folderPath=runtime_service.select_folder(payload.currentPath))


@router.get("/runtime/logging", response_model=TraceLogStatus)
def get_trace_logging_status() -> TraceLogStatus:
    return TraceLogStatus(**trace_logging_service.status())


@router.post("/runtime/logging", response_model=TraceLogStatus)
def record_trace_log(payload: TraceLogRequest) -> TraceLogStatus:
    trace_logging_service.record(
        level=payload.level,
        source=payload.source,
        message=payload.message,
        detail=payload.detail,
    )
    return TraceLogStatus(**trace_logging_service.status())


@router.post("/runtime/open-folder")
def open_folder(payload: FolderOpenRequest) -> dict[str, bool]:
    opened = runtime_service.open_folder(payload.folderPath)
    if not opened:
        raise HTTPException(status_code=500, detail="No se pudo abrir la carpeta solicitada.")
    return {"opened": True}
