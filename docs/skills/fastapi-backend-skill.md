# FastAPI Backend Skill

## Purpose

Develop the local backend contract for projects, documents, versions, and AI.

## Context

FastAPI provides the local API used by the Tauri frontend. V1 uses mocks but must be replaceable.

## Rules

- Keep routers thin.
- Put business behavior in services.
- Use Pydantic schemas for requests and responses.
- Do not implement complex real persistence without a product decision.
- Keep endpoint names stable unless migration docs are updated.

## Recommended Steps

1. Add or update schemas.
2. Implement service behavior.
3. Wire routers.
4. Add tests for endpoint contracts.
5. Update backend documentation.

## Acceptance Criteria

- API returns typed JSON.
- Tests cover health, project tree, document save, versions, and AI prompt.
- Mock services remain easy to replace.

## Mistakes To Avoid

- Returning unstructured dictionaries from routers for new contracts.
- Duplicating mock data across services.
- Letting frontend details leak into backend internals.

