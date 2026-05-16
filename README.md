# KnowNext.ai

KnowNext.ai is a desktop product for managing, editing, versioning, and querying Markdown documentation by project.

This first version establishes the product foundation:

- Tauri desktop shell.
- React + TypeScript frontend.
- Tailwind CSS visual system.
- Milkdown visual Markdown editor.
- FastAPI local backend with JSON persistence and replaceable services.
- Encapsulated frontend API layer.
- Local project registry and layout persistence through `projects.json` and `config.json`.
- Local folder scanning and real Markdown file read/write for project documentation.
- Mock version history and AI prompt response pending the post-foundation implementation phases.

## Download

The latest Windows installer is published on GitHub Releases:

- [Download KnowNext.ai for Windows](https://github.com/jormazabal/knownext.ai/releases/latest/download/KnowNext.ai_0.14.0_x64-setup.exe)
- [View all releases](https://github.com/jormazabal/knownext.ai/releases)

The desktop app also checks the signed updater manifest at:

```text
https://github.com/jormazabal/knownext.ai/releases/latest/download/latest.json
```

Windows may show a SmartScreen or endpoint protection warning for unsigned open source builds. The Tauri updater manifest and update artifacts are signed, but the manually downloaded Windows installer may not have Authenticode signing. You can verify the installer hash against the SHA256 digest shown on the GitHub release asset.

## Run Locally

Install frontend dependencies:

```bash
pnpm install
```

Run the frontend:

```bash
pnpm dev
```

Run the Tauri desktop app:

```bash
pnpm desktop
```

Run the FastAPI backend:

```bash
pnpm backend:dev
```

Backend health check:

```bash
curl http://127.0.0.1:8765/health
```

## Documentation

- Product definition: `docs/product/product-definition.md`
- Architecture overview: `docs/architecture/architecture-overview.md`
- Desktop runtime: `docs/architecture/desktop-runtime.md`
- Getting started: `docs/development/getting-started.md`
- Release process: `docs/development/release-process.md`
- Manual test checklist: `docs/development/manual-test-checklist.md`
- 1.0 release readiness: `docs/development/release-1.0-readiness.md`
- Open source readiness: `docs/legal/open-source-readiness.md`
- Agent instructions: `AGENTS.md`

## Contributing

Contributions are welcome under the Apache-2.0 license. See `CONTRIBUTING.md`
and `SECURITY.md` before submitting code or reporting vulnerabilities.

## License

KnowNext.ai is licensed under the Apache License, Version 2.0. See `LICENSE`,
`NOTICE`, and `THIRD_PARTY_NOTICES.md`.
