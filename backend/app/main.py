from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.version import APP_VERSION
from app.services.draft_service import draft_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    draft_service.run_maintenance()
    yield


app = FastAPI(title=settings.app_name, version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "version": APP_VERSION}


app.include_router(api_router, prefix="/api")
