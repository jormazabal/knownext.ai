# Release Management Skill

## Purpose

Publish KnowNext.ai releases so new users can download installers and existing users can update through signed Windows and Android updater manifests.

## When To Use

Use this skill for every version bump, GitHub Release, updater change, installer change, Android APK change, or documentation change that affects how users install or update the app.

## Release Invariants

- `VERSION` is the source of truth.
- These files must match `VERSION`: root `package.json`, `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`.
- The README manual installer link must use `releases/latest/download/KnowNext.ai_<version>_x64_en-US.msi`.
- The README Android link must use `releases/latest/download/KnowNext.ai-android-arm64-v<version>.apk`.
- GitHub Releases must include `KnowNext.ai_<version>_x64_en-US.msi`, `KnowNext.ai_<version>_x64-setup.exe`, both Windows `.sig` files, `latest.json`, `KnowNext.ai-android-arm64-v<version>.apk`, and `android-latest.json`.
- The published Windows updater manifest must resolve to the new version and point `windows-x86_64.url` to the MSI artifact.
- The published Android manifest must resolve to the new version, declare `applicationId=ai.knownext.mobile`, and point to the Android APK asset with the matching SHA-256.
- Do not publish a release from an unclean or unrelated worktree.
- Do not change the Tauri updater public key unless the maintainer explicitly accepts the migration impact.
- Do not add or preserve separate product service paths, compatibility runtime paths, auxiliary runtime processes, or mobile endpoint paths.

## Required Secrets

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `KNOWNEXT_GITHUB_CLIENT_ID`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Optional hardening:

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`

## Standard Steps

1. Start from `origin/main` on a `codex/release-<version>` branch.
2. Bump `VERSION` and every checked manifest.
3. Update README download URLs to the new versioned Windows MSI and Android APK.
4. Add `CHANGELOG.md` notes and `docs/releases/<version>.md`.
5. Run `cargo update -p knownext-ai-desktop` in `apps/desktop/src-tauri` when dependency metadata changes.
6. Run `pnpm release:check`.
7. Run `pnpm release:secrets:check` in the environment that will build signed artifacts.
8. Build Windows with `pnpm --filter @knownext/desktop tauri:build` and updater signing variables configured.
9. Build Android release with `pnpm android:build:release` and Android signing variables configured.
10. Run the manual checklist on packaged Windows and Android builds.
11. Commit, push, open a PR, merge it, tag `origin/main` with `v<version>`, and push the tag.
12. Wait for `.github/workflows/release.yml` to complete.
13. Publish the draft GitHub Release only after all required assets are present.
14. Verify both public endpoints.

## Endpoint Verification

```powershell
$version = "2.0.4"
$manifest = Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json" -MaximumRedirection 10
$json = [System.Text.Encoding]::UTF8.GetString($manifest.Content) | ConvertFrom-Json
$json.version
$json.platforms.'windows-x86_64'.url
Invoke-WebRequest -UseBasicParsing -Method Head -Uri "https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_${version}_x64_en-US.msi" -MaximumRedirection 10

$androidManifest = Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/jormazabal/knownext.ai/releases/latest/download/android-latest.json" -MaximumRedirection 10
$android = [System.Text.Encoding]::UTF8.GetString($androidManifest.Content) | ConvertFrom-Json
$android.versionName
$android.applicationId
$artifact = $android.artifacts | Where-Object { $_.abi -eq "arm64-v8a" } | Select-Object -First 1
$artifact.url
$artifact.sha256
Invoke-WebRequest -UseBasicParsing -Method Head -Uri "https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai-android-arm64-v${version}.apk" -MaximumRedirection 10
```

## Acceptance Criteria

- `pnpm release:check` passes.
- Packaged Windows build succeeds with updater signing.
- Signed Android release build succeeds.
- Manual critical checklist passes on Windows and Android.
- GitHub Actions release workflow succeeds.
- The release is not left as a draft.
- `latest.json` returns the new version and points Windows updates to `KnowNext.ai_<version>_x64_en-US.msi`.
- `android-latest.json` returns `versionName=<version>`, `applicationId=ai.knownext.mobile`, and an `arm64-v8a` artifact pointing to `KnowNext.ai-android-arm64-v<version>.apk` with the matching SHA-256.
- README download URLs return HTTP 200.
- A previously installed per-user Windows version updates without requiring administrator permissions and without deleting app data.
- Android updates preserve app data and the app works offline with no workstation app or external product service running.

## Mistakes To Avoid

- Linking the README to a fixed old installer version.
- Publishing the draft before checking the assets.
- Forgetting to publish the draft, which leaves `/latest/download/latest.json` on the previous release.
- Pointing the Windows updater manifest back to NSIS without explicitly changing the updater distribution policy.
- Replacing the updater key as a routine release step.
- Reintroducing separate runtime dependencies or connection screens for Android.
- Publishing a build without `KNOWNEXT_GITHUB_CLIENT_ID`, which leaves the GitHub device login unavailable in installed apps.
