# Open Source Readiness

Review date: 2026-05-09

## Decision

KnowNext.ai is published under Apache-2.0.

Apache-2.0 was selected because it is a permissive open source license with an
explicit patent grant and is compatible with the dependency set currently used
by the project.

## Dependency Review

The current dependency set was reviewed through:

- `pnpm licenses list --recursive --json`
- `cargo metadata --format-version 1 --locked`
- Python package metadata for FastAPI, Uvicorn, Pydantic, HTTPX, Pytest,
  Starlette, and AnyIO

No GPL, AGPL, or dependency license that blocks Apache-2.0 publication was
identified.

## Secret Review

The repository was scanned for common secret patterns in the current tree and
Git history. Findings were limited to:

- GitHub Actions secret variable names.
- Placeholder tokens in mock documentation.
- Documentation explaining where local updater signing keys are stored.

No real updater private key, GitHub token, API key, password, certificate, or
environment file was found in the published repository state.

## Remaining Operational Notes

- Keep the Tauri updater private key outside the repository.
- Keep GitHub Actions secrets configured as repository secrets.
- Re-run dependency and secret reviews before major releases.
- Review issue templates and project governance if external contribution volume
  grows.
