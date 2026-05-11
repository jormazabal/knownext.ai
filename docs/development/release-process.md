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

For release work, also follow `docs/skills/release-management-skill.md`. That skill captures the installer and updater invariants future agents must preserve.

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

The Windows updater currently prefers the MSI artifact when generating `latest.json`. Keep the NSIS setup executable as the manual installer linked from the README and GitHub Releases.

Distribution contract:

- Manual install link: `https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_<version>_x64-setup.exe`
- Updater manifest: `https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json`
- Windows updater artifact inside `latest.json`: `KnowNext.ai_<version>_x64_en-US.msi`

This is intentional. New users use the signed NSIS setup path by default; installed users update through the signed MSI artifact.

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

After the workflow completes, inspect the draft release before publishing it:

```bash
gh release view v0.3.1 --repo jormazabal/knownext.ai --json isDraft,isPrerelease,name,tagName,url,assets
```

The release must contain:

- `KnowNext.ai_<version>_x64-setup.exe`
- `KnowNext.ai_<version>_x64-setup.exe.sig`
- `KnowNext.ai_<version>_x64_en-US.msi`
- `KnowNext.ai_<version>_x64_en-US.msi.sig`
- `latest.json`

Publish the draft only after those assets are present:

```bash
gh release edit v0.3.1 --repo jormazabal/knownext.ai --draft=false
```

For Windows updater changes, install the previous release and update through the in-app updater. Confirm the app process is closed, the installer replaces `knownext-ai-desktop.exe`, and the updated app relaunches with the new visible version.

After publishing, verify that the README download link resolves and that the updater manifest points at the published MSI update artifact. Use PowerShell on Windows so redirects and JSON parsing are explicit:

```powershell
$version = "0.3.1"
$manifestUrl = "https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json"
$manifestResponse = Invoke-WebRequest -UseBasicParsing -Uri $manifestUrl -MaximumRedirection 10
$manifestText = [System.Text.Encoding]::UTF8.GetString($manifestResponse.Content)
$manifest = $manifestText | ConvertFrom-Json
$installerUrl = "https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_${version}_x64-setup.exe"
$installerResponse = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $installerUrl -MaximumRedirection 10
[pscustomobject]@{
  ManifestStatus = $manifestResponse.StatusCode
  ManifestVersion = $manifest.version
  WindowsUrl = $manifest.platforms.'windows-x86_64'.url
  SignatureLength = $manifest.platforms.'windows-x86_64'.signature.Length
  ManualInstallerStatus = $installerResponse.StatusCode
  ManualInstallerUrl = $installerUrl
}
```

The README should continue linking to the NSIS `.exe` for manual installs. The updater manifest should prefer the MSI for in-app Windows updates unless the release policy is deliberately changed.

Do not tag or publish a release if `pnpm release:check` fails or if the working tree contains unrelated changes that should not ship in the release.
Do not announce a release if `/releases/latest/download/latest.json` still resolves to the previous version.

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
