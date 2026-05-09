# Release Process

KnowNext.ai is versioned and released as one monolithic application. The desktop frontend, Tauri runtime, Rust package metadata, and FastAPI backend must always carry the same release version.

## Version Source

`VERSION` is the source of truth for the application release number.

The following files must match `VERSION`:

- `package.json`
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `backend/pyproject.toml`

Run this before any release commit:

```bash
pnpm version:check
```

## Release Gate

Before tagging a release, run:

```bash
pnpm release:check
```

This validates version consistency, builds the desktop frontend, runs frontend tests, and runs backend tests.

Manual acceptance must also pass using `docs/development/manual-test-checklist.md`. For packaged releases, run the checklist against the packaged Tauri app, not only the browser dev server.

## GitHub Release Flow

Use one release commit and one annotated tag per application release.

```bash
git status --short
pnpm release:check
git add VERSION package.json pnpm-lock.yaml apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml backend/pyproject.toml backend/app/core/version.py backend/app/main.py backend/tests/test_api.py apps/desktop/src docs CHANGELOG.md scripts
git commit -m "chore(release): 0.3.0"
git tag -a v0.3.0 -m "KnowNext.ai 0.3.0"
git push origin HEAD
git push origin v0.3.0
gh release create v0.3.0 --title "KnowNext.ai 0.3.0" --notes-file docs/releases/0.3.0.md
```

Do not tag or publish a release if `pnpm release:check` fails or if the working tree contains unrelated changes that should not ship in the release.

## Next Releases

For the next release:

1. Update `VERSION`.
2. Update every checked manifest to the same version.
3. Add a new section to `CHANGELOG.md`.
4. Add release notes under `docs/releases/`.
5. Run `pnpm release:check`.
6. Commit, tag, push, and create the GitHub release.
