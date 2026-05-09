# KnowNext.ai Backend

Local FastAPI service for the KnowNext.ai desktop application.

The current implementation uses mock services behind stable routers. The service boundaries are prepared for future local filesystem persistence, Git commit history, and AI provider integration.

## Run

```bash
python -m uvicorn app.main:app --reload --port 8765
```

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

