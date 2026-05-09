from fastapi import APIRouter

from app.schemas.runtime import FolderSelectionRequest, FolderSelectionResponse
from app.services.runtime_service import runtime_service

router = APIRouter()


@router.post("/runtime/select-folder", response_model=FolderSelectionResponse)
def select_folder(payload: FolderSelectionRequest) -> FolderSelectionResponse:
    return FolderSelectionResponse(folderPath=runtime_service.select_folder(payload.currentPath))
