import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request

from app.api.router import api_router
from app.core.config import settings
from app.core.version import APP_VERSION
from app.services.app_storage import get_app_data_dir
from app.services.draft_service import draft_service
from app.services.logging_service import trace_logging_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        trace_logging_service.record(
            "info",
            "backend.startup",
            "Backend startup sequence started.",
            f"version={APP_VERSION}\nappDataDir={get_app_data_dir()}",
        )
        draft_service.run_maintenance()
        trace_logging_service.record(
            "info",
            "backend.startup",
            "Backend startup sequence completed.",
            f"version={APP_VERSION}\nappDataDir={get_app_data_dir()}",
        )
        yield
    except Exception as error:
        trace_logging_service.record_exception("backend.startup", error)
        raise
    finally:
        trace_logging_service.record(
            "info",
            "backend.shutdown",
            "Backend shutdown sequence completed.",
            f"version={APP_VERSION}\nappDataDir={get_app_data_dir()}",
        )


app = FastAPI(title=settings.app_name, version=APP_VERSION, lifespan=lifespan)
BACKEND_INSTANCE_ID = f"backend-{uuid4()}"
BACKEND_STARTED_AT = datetime.now(timezone.utc).isoformat()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.allowed_origin_regex,
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
def health() -> dict[str, str | int]:
    host = os.environ.get("KNOWNEXT_API_HOST", "127.0.0.1")
    port = int(os.environ.get("KNOWNEXT_API_PORT", "8765"))
    return {
        "app": "knownext",
        "schemaVersion": 2,
        "status": "ok",
        "service": settings.app_name,
        "version": APP_VERSION,
        "profile": os.environ.get("KNOWNEXT_RUNTIME_PROFILE", "desktop"),
        "host": host,
        "port": port,
        "endpoint": f"http://{host}:{port}",
        "instanceId": BACKEND_INSTANCE_ID,
        "startedAt": BACKEND_STARTED_AT,
        "managedBy": os.environ.get("KNOWNEXT_MANAGED_BY", "manual"),
        "appDataDir": str(get_app_data_dir()),
    }


@app.exception_handler(HTTPException)
async def trace_http_exception(request: Request, error: HTTPException):
    if error.status_code >= 400:
        trace_logging_service.record(
            "error",
            f"{request.method} {request.url.path}",
            f"HTTP {error.status_code}",
            str(error.detail),
        )
    return JSONResponse(status_code=error.status_code, content={"detail": error.detail}, headers=error.headers)


@app.exception_handler(RequestValidationError)
async def trace_validation_exception(request: Request, error: RequestValidationError):
    trace_logging_service.record(
        "error",
        f"{request.method} {request.url.path}",
        "Request validation failed",
        str(error),
    )
    return JSONResponse(status_code=422, content={"detail": error.errors()})


app.include_router(api_router, prefix="/api")
