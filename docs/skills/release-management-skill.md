# Release Management Skill

## Purpose

Publish KnowNext.ai releases so new users can download the installer and existing users can update through the signed Tauri updater.

## When To Use

Use this skill for every version bump, GitHub Release, updater change, installer change, or documentation change that affects how users install or update the app.

## Release Invariants

- `VERSION` is the source of truth.
- These files must match `VERSION`: root `package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, and `backend/pyproject.toml`.
- `backend/tests/test_api.py` must expect the same version returned by `/health`.
- The README manual installer link must use `releases/latest/download/KnowNext.ai_<version>_x64-setup.exe`.
- GitHub Releases must include `KnowNext.ai_<version>_x64-setup.exe`, `KnowNext.ai_<version>_x64_en-US.msi`, both `.sig` files, and `latest.json`.
- The published updater manifest must resolve to the new version and point `windows-x86_64.url` to the NSIS setup artifact so per-user installs can update without a Windows Installer elevation prompt.
- Do not publish a release from an unclean or unrelated worktree.
- Do not change the Tauri updater public key unless the maintainer explicitly accepts the migration impact.

## Required Secrets

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Optional hardening:

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`

## Standard Steps

1. Start from `origin/main` on a `codex/release-<version>` branch.
2. Bump `VERSION` and every checked manifest.
3. Update the README installer URL to the new versioned NSIS `.exe`.
4. Add `CHANGELOG.md` notes and `docs/releases/<version>.md`.
5. Run `cargo update -p knownext-ai-desktop` in `apps/desktop/src-tauri`.
6. Run `pnpm release:check`.
7. For updater, window shell, or installer changes, run `pnpm --filter @knownext/desktop tauri:build` with updater signing variables configured.
8. Commit, push, open a PR, merge it, tag `origin/main` with `v<version>`, and push the tag.
9. Wait for `.github/workflows/release.yml` to complete.
10. Publish the draft GitHub Release.
11. Verify both public endpoints:

```powershell
$manifest = Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json" -MaximumRedirection 10
$json = [System.Text.Encoding]::UTF8.GetString($manifest.Content) | ConvertFrom-Json
$json.version
$json.platforms.'windows-x86_64'.url
Invoke-WebRequest -UseBasicParsing -Method Head -Uri "https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_<version>_x64-setup.exe" -MaximumRedirection 10
```

## Acceptance Criteria

- `pnpm release:check` passes.
- GitHub Actions release workflow succeeds.
- The release is not left as a draft.
- `latest.json` returns the new version.
- `latest.json` points Windows updates to `KnowNext.ai_<version>_x64-setup.exe`.
- The README download URL returns HTTP 200.
- A previously installed per-user version can update without requiring administrator permissions and without deleting app data.

## Mistakes To Avoid

- Linking the README to a fixed old installer version.
- Publishing the draft before checking the assets.
- Forgetting to publish the draft, which leaves `/latest/download/latest.json` on the previous release.
- Pointing the updater manifest back to MSI without explicitly accepting that some users may see an administrator prompt.
- Replacing the updater key as a routine release step.
