from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "KnowNext.ai Local API"
    allowed_origins: list[str] = [
        "http://127.0.0.1:1420",
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
    ]
    allowed_origin_regex: str = r"^https?://(127\.0\.0\.1|localhost):\d+$"


settings = Settings()
