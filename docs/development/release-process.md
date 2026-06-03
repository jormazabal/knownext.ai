# Release Process

KnowNext.ai is versioned and released as one monolithic application. The frontend, Tauri runtime, Rust package metadata, Windows updater, and Android updater must carry the same release version.

## Version Source

`VERSION` is the source of truth for the application release number.

The following files must match `VERSION`:

- `package.json`
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`

Run this before any release commit:

```bash
pnpm version:check
```

## Release Gate

Before tagging a release, run:

```bash
pnpm release:check
```

This validates version consistency, builds the frontend, checks the client bundle for runtime-data and legacy-server markers, runs frontend tests, and runs Rust contract tests.

Manual acceptance must also pass using `docs/development/manual-test-checklist.md`. For packaged releases, run the checklist against packaged Windows and Android apps, not only the browser dev server.

For release work, also follow `docs/skills/release-management-skill.md`. That skill captures installer and updater invariants future agents must preserve.

Before packaged release builds, also run the signing preflight in the release environment:

```bash
pnpm release:secrets:check
```

This check intentionally stays outside `pnpm release:check` so local development and CI validation can run without exposing signing material.

## Updater Signing

The Tauri updater uses signed artifacts from public GitHub Releases. This signature is mandatory and independent from Windows Authenticode signing.

Required GitHub Actions secrets:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Optional hardening:

- `WINDOWS_CERTIFICATE`
- `WINDOWS_CERTIFICATE_PASSWORD`

The public updater key is configured in `apps/desktop/src-tauri/tauri.conf.json`. Do not regenerate the updater key unless the maintainer explicitly accepts the migration impact.

The Windows updater and README manual download both use the MSI artifact. Keep the NSIS setup executable attached to GitHub Releases as a secondary installer asset, but do not make it the primary public download unless it is validated on Windows security policy for downloaded unsigned executables.

The WiX `upgradeCode` is pinned in `apps/desktop/src-tauri/tauri.conf.json`; do not change it during a routine release. The MSI uses `apps/desktop/src-tauri/windows/wix/per-user-main.wxs` so the updater can install under the current user without Administrator rights. A host with an older MSI registered as a per-machine install may require Administrator rights to remove that older install and is not valid evidence for the per-user updater acceptance gate. Validate updater preservation against a previous current-user install.

Android private APK updates use `android-latest.json`. The APK must keep `applicationId=ai.knownext.mobile`, use the same Android signing certificate as previous private APKs, and publish a strictly increasing `versionCode`.

Distribution contract:

- Manual Windows installer: `https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_<version>_x64_en-US.msi`
- Windows updater manifest: `https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json`
- Windows updater artifact inside `latest.json`: `KnowNext.ai_<version>_x64_en-US.msi`
- Android updater manifest: `https://github.com/jormazabal/knownext.ai/releases/latest/download/android-latest.json`
- Android updater artifact: `KnowNext.ai-android-arm64-v<version>.apk`

## GitHub Release Flow

Use one release commit and one annotated tag per application release.

```bash
git status --short
pnpm release:check
git add VERSION package.json pnpm-lock.yaml .github/workflows/release.yml apps/desktop/package.json apps/desktop/src-tauri apps/desktop/src docs CHANGELOG.md scripts README.md AGENTS.md
git commit -m "chore(release): 2.0.1"
git tag -a v2.0.1 -m "KnowNext.ai 2.0.1"
git push origin HEAD
git push origin v2.0.1
```

Pushing the tag runs `.github/workflows/release.yml`. The workflow builds Windows, uploads the NSIS installer, MSI installer, updater signatures, and publishes `latest.json` through `tauri-apps/tauri-action@v0.6.2`. It then builds and uploads the signed Android APK plus `android-latest.json`.

The workflow starts with `pnpm release:secrets:check`. If mandatory updater or Android signing inputs are missing, CI stops before creating partial release assets.

After the workflow completes, inspect the draft release before publishing it:

```bash
gh release view v2.0.1 --repo jormazabal/knownext.ai --json isDraft,isPrerelease,name,tagName,url,assets
```

The release must contain:

- `KnowNext.ai_<version>_x64-setup.exe`
- `KnowNext.ai_<version>_x64-setup.exe.sig`
- `KnowNext.ai_<version>_x64_en-US.msi`
- `KnowNext.ai_<version>_x64_en-US.msi.sig`
- `latest.json`
- `KnowNext.ai-android-arm64-v<version>.apk`
- `android-latest.json`

Publish the draft only after those assets are present:

```bash
gh release edit v2.0.1 --repo jormazabal/knownext.ai --draft=false
```

## Verification

After publishing, verify the Windows and Android manifests:

```powershell
$version = "2.0.1"
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

For updater changes, install the previous release and update through the in-app updater. Confirm app data survives and the updated app relaunches with the new visible version. Android acceptance must include offline operation with no workstation app or external service running.

Do not tag or publish a release if `pnpm release:check` fails, packaged Windows/Android builds fail, manual critical acceptance fails, update manifests point to the previous version, or the working tree contains unrelated changes that should not ship.
