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
The backend `/health` response must report `profile=web-dev`; if a browser build points at a desktop backend the frontend treats it as incompatible.

Start the web backend in another terminal:

```bash
pnpm backend:web
```

To use a non-default browser backend port during development, start both sides with the same explicit endpoint:

```bash
$env:KNOWNEXT_API_PORT="8770"; pnpm backend:web
$env:VITE_API_BASE_URL="http://127.0.0.1:8770"; pnpm dev
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

Port `8765` is reserved for the Tauri/Windows desktop profile. The installed desktop app can automatically move to another port in the `8765-8799` range when the default is occupied, and its frontend obtains the active endpoint from Tauri at runtime. Use `pnpm backend:web` for browser development unless you intentionally want to inspect the desktop profile.

## Tests

```bash
pnpm test
pnpm backend:test
```

