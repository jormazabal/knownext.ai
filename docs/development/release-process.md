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

The Windows updater currently prefers the MSI artifact when generating `latest.json`. Keep the NSIS `.exe` as the README/manual installer link.

## Windows Authenticode Signing

Windows release artifacts can be signed with Authenticode to reduce SmartScreen and corporate endpoint protection blocks when users download the installer manually.

Optional GitHub Actions secrets:

- `WINDOWS_CERTIFICATE`: base64-encoded `.pfx` code signing certificate.
- `WINDOWS_CERTIFICATE_PASSWORD`: export password for the `.pfx` certificate.

When configured, the release workflow imports the certificate into the current user certificate store, exposes its thumbprint through `WINDOWS_CERTIFICATE_THUMBPRINT`, and Tauri calls `scripts/sign-windows.ps1` through `bundle.windows.signCommand`.

A self-signed certificate is not enough for public distribution because it does not establish publisher trust or SmartScreen reputation. If no public code signing certificate is available, publish the release unsigned, keep the Tauri updater signature enabled, and document the expected Windows warning plus SHA256 verification path.

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

Pushing the tag runs `.github/workflows/release.yml`. The workflow builds Windows, uploads the NSIS installer, MSI installer, updater signatures, and publishes `latest.json` through `tauri-apps/tauri-action@v0.6.2`.

After the workflow completes, inspect the release before publishing it:

```bash
gh release view v0.3.1 --repo jormazabal/knownext.ai --json isDraft,assets
```

The release must contain the Windows installer, the matching `.sig` file, and `latest.json`.

For Windows updater changes, install the previous release and update through the in-app updater. Confirm the app process is closed, the installer replaces `knownext-ai-desktop.exe`, and the updated app relaunches with the new visible version.

After publishing, verify that the README download link resolves and that the updater manifest points at the published MSI update artifact:

```bash
curl -I https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_<version>_x64-setup.exe
curl https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json
```

The README should continue linking to the NSIS `.exe` for manual installs. The updater manifest should prefer the MSI artifact for in-app Windows updates.

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
