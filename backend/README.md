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

The web backend listens on `127.0.0.1:8766` and stores data under `ai.knownext.web`. Browser-created projects do not request a local PC folder; when `folderPath` is empty the backend creates the project under its managed `projects/<project-id>` storage directory.

Runtime identity is part of `/health`. Desktop backends must report `profile=desktop`; browser development backends started with `pnpm backend:web` report `profile=web-dev`. Frontends use this profile to avoid mixing the installed Windows app data with browser development data.

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

