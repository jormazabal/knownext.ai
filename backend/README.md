# KnowNext.ai Backend

Local FastAPI service for the KnowNext.ai desktop application.

The backend uses local JSON/filesystem persistence. It must not seed mock projects in normal runtime.

## Run

```bash
python -m uvicorn app.main:app --reload --port 8765
```

Use a separate backend profile for the browser/web development surface so it does not share projects, app settings, or credentials with the installed Windows app:

```bash
pnpm backend:web
```

The web backend listens on `127.0.0.1:8766` and stores data under `ai.knownext.web`.

## Test

```bash
python -m pytest
```

## Endpoints

- `GET /health`
- `GET /api/projects`
- `GET /api/projects/active`
- `GET /api/projects/{project_id}/tree`
- `GET /api/documents/{document_id}`
- `PUT /api/documents/{document_id}`
- `GET /api/documents/{document_id}/versions`
- `POST /api/documents/{document_id}/ai/prompt`

