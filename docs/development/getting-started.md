# Getting Started

## Prerequisites

- Node.js 22 or newer.
- pnpm 11.
- Rust toolchain for Tauri.
- Python 3.12 or newer.

## Install

```bash
pnpm install
```

## Frontend

```bash
pnpm dev
```

Open `http://127.0.0.1:1420`.

The browser frontend uses `http://127.0.0.1:8766` by default so it can keep a separate web profile from the installed Windows app.

Start the web backend in another terminal:

```bash
pnpm backend:web
```

## Desktop

```bash
pnpm desktop
```

## Backend

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8765
```

Port `8765` is reserved for the Tauri/Windows desktop profile. Use `pnpm backend:web` for browser development unless you intentionally want to inspect the desktop profile.

## Tests

```bash
pnpm test
pnpm backend:test
```

