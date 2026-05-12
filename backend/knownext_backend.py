from __future__ import annotations

import os

import uvicorn


def main() -> None:
    host = os.environ.get("KNOWNEXT_API_HOST", "127.0.0.1")
    port = int(os.environ.get("KNOWNEXT_API_PORT", "8765"))
    os.environ.setdefault("KNOWNEXT_RUNTIME_PROFILE", "desktop")
    os.environ.setdefault("KNOWNEXT_MANAGED_BY", "tauri")
    uvicorn.run("app.main:app", host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
