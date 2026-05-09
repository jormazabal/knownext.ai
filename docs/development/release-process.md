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

## Updater Signing

The Tauri updater uses signed artifacts from public GitHub Releases. This signature is mandatory and independent from Windows Authenticode signing.

Required GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

The production updater key is kept outside the repository at:

- `%USERPROFILE%\.tauri\knownext-ai-updater.key`
- `%USERPROFILE%\.tauri\knownext-ai-updater.password.clixml`

The password file is encrypted with Windows DPAPI for the current user. Do not commit either file.

The public updater key is configured in `apps/desktop/src-tauri/tauri.conf.json`. If the production key is regenerated, update `plugins.updater.pubkey`, update the GitHub secrets, and rebuild a release from a clean commit.

The Windows updater currently prefers the NSIS installer when generating `latest.json`. Authenticode code signing for the installer is a later hardening step and is not required for the Tauri updater signature verification.

## GitHub Release Flow

Use one release commit and one annotated tag per application release.

```bash
git status --short
pnpm release:check
git add VERSION package.json pnpm-lock.yaml .github/workflows/release.yml apps/desktop/package.json apps/desktop/src-tauri apps/desktop/src docs CHANGELOG.md backend/pyproject.toml scripts
git commit -m "chore(release): 0.3.1"
git tag -a v0.3.1 -m "KnowNext.ai 0.3.1"
git push origin HEAD
git push origin v0.3.1
```

Pushing the tag runs `.github/workflows/release.yml`. The workflow builds Windows, uploads the NSIS installer, uploads updater signatures, and publishes `latest.json` through `tauri-apps/tauri-action@v0.6.2`.

After the workflow completes, inspect the release before publishing it:

```bash
gh release view v0.3.1 --repo jormazabal/knownext.ai --json isDraft,assets
```

The release must contain the Windows installer, the matching `.sig` file, and `latest.json`.

After publishing, verify that the README download link resolves and that the updater manifest points at the published NSIS installer:

```bash
curl -I https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_<version>_x64-setup.exe
curl https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json
```

Do not tag or publish a release if `pnpm release:check` fails or if the working tree contains unrelated changes that should not ship in the release.

## Next Releases

For the next release:

1. Update `VERSION`.
2. Update every checked manifest to the same version.
3. Add a new section to `CHANGELOG.md`.
4. Add release notes under `docs/releases/`.
5. Run `pnpm release:check`.
6. Build a signed Tauri package locally when changing updater configuration.
7. Commit, tag, push, and let GitHub Actions create the release.
8. Install the previous release, publish the new release, and validate the real update path before announcing it.
