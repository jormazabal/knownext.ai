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

## Desktop

```bash
pnpm desktop
```

## Backend

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8765
```

## Use Backend From Frontend

Create an environment variable before running Vite:

```bash
VITE_USE_BACKEND=true
```

On PowerShell:

```powershell
$env:VITE_USE_BACKEND="true"; pnpm dev
```

## Tests

```bash
pnpm test
pnpm backend:test
```

