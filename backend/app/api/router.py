from fastapi import APIRouter

from app.api.routes import ai, auth, config, documents, github, projects, runtime, versions

api_router = APIRouter()
api_router.include_router(config.router, tags=["config"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(projects.router, tags=["projects"])
api_router.include_router(documents.router, tags=["documents"])
api_router.include_router(versions.router, tags=["versions"])
api_router.include_router(github.router, tags=["github"])
api_router.include_router(ai.router, tags=["ai"])
api_router.include_router(runtime.router, tags=["runtime"])
