from fastapi import APIRouter

from app.schemas.notes import UserNotes, UserNotesUpdate
from app.services.notes_service import notes_service

router = APIRouter()


@router.get("/notes", response_model=UserNotes)
def get_notes() -> UserNotes:
    return notes_service.get_notes()


@router.put("/notes", response_model=UserNotes)
def update_notes(payload: UserNotesUpdate) -> UserNotes:
    return notes_service.update_notes(payload.markdown)
