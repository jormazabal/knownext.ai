# Data Management And Clean Distribution

KnowNext.ai packages must contain application code, static UI assets, native runtime files, and signed updater metadata only. They must never contain user projects, Markdown documents, drafts, logs, notes, credentials, API keys, generated AI assets, caches, or development seed data.

## Product Invariants

- A clean installation starts with no projects.
- A clean installation must not show `Proyecto Alpha`, `Proyecto Beta`, `Proyecto Gamma`, sample documents, mock users, or stale tabs.
- Updating an existing installation must preserve data that belongs to the same app identity, runtime profile, and native storage location.
- Uninstalling and reinstalling follows the platform default. Windows may leave per-user app data unless the user removes it; Android clears app-specific data on uninstall.
- Runtime profiles are isolated. Desktop, browser development, Android, and tests must not import data from each other unless a migration is explicitly implemented.
- Product data belongs in Tauri/Rust-managed local storage, not in client bundles or installers.

## Windows Installed App

The installed Windows Tauri app uses the local Rust runtime with the Tauri app data directory. Installer updates replace program files and keep this directory intact, so project metadata, config, credentials, drafts, logs, notes, and managed project folders survive an update.

The package itself must not include files from that app data directory. Release checks should inspect installers and generated application resources for:

- `projects.json`
- `credentials.json`
- `notes.json`
- `drafts/`
- `logs/`
- `ai-conversations/`
- `sk-` style OpenAI keys
- removed runtime markers checked by `scripts/check-client-bundle-clean.mjs`

## Android App

Android is a native Tauri APK/AAB with local Rust runtime contracts. It must not depend on a workstation process or product runtime endpoint.

Android app-local state is managed by Tauri/Rust storage. Android updates installed over the same package preserve app storage when package id, signing certificate, and version progression are valid.

The APK itself must not include workspace data, logs, credentials, generated AI assets, or development caches. Clean Android acceptance requires creating a project and editing Markdown offline with no external service running.

## Development Data

Browser development and automated tests may use isolated data directories and fixtures. Those fixtures must not be bundled into release assets or silently shown in normal product use.

Release validation must run `pnpm bundle:check-clean` after building the frontend and must verify packaged Windows and Android artifacts do not contain runtime data or removed runtime markers.
