from fastapi import APIRouter, WebSocket

from app.services.transcription_service import transcription_service


router = APIRouter()


@router.websocket("/transcription/realtime")
async def realtime_transcription(websocket: WebSocket) -> None:
    await transcription_service.handle_realtime_session(websocket)
