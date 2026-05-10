from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from app.api.router import api_router
from app.core.config import settings
from app.core.version import APP_VERSION
from app.services.draft_service import draft_service
from app.services.logging_service import trace_logging_service


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


@app.middleware("http")
async def trace_unhandled_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as error:
        trace_logging_service.record_exception(f"{request.method} {request.url.path}", error)
        raise


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "version": APP_VERSION}


app.include_router(api_router, prefix="/api")
