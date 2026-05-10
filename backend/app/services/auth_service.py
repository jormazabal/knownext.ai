from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from app.schemas.auth import AuthStatus, AuthUser, GithubDevicePollResponse, GithubDeviceStartResponse
from app.services.credential_service import credential_service

GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code"
GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


class AuthService:
    def get_status(self) -> AuthStatus:
        record = credential_service.get_github_record()
        if not record:
            return AuthStatus(isAuthenticated=False)
        return AuthStatus(
            isAuthenticated=True,
            provider="github",
            user=AuthUser(**record["user"]),
            scopes=record.get("scopes", []),
            expiresAt=record.get("expiresAt"),
        )

    def start_github_device_flow(self) -> GithubDeviceStartResponse:
        client_id = os.environ.get("KNOWNEXT_GITHUB_CLIENT_ID")
        if not client_id:
            return GithubDeviceStartResponse(
                deviceCode=f"mock-{uuid4()}",
                userCode="KNXT-DEV",
                verificationUri="https://github.com/login/device",
                expiresIn=900,
                interval=1,
                mock=True,
            )

        payload = urllib.parse.urlencode({"client_id": client_id, "scope": "read:user repo"}).encode("utf-8")
        data = self._post_form(GITHUB_DEVICE_CODE_URL, payload)
        return GithubDeviceStartResponse(
            deviceCode=data["device_code"],
            userCode=data["user_code"],
            verificationUri=data["verification_uri"],
            expiresIn=data["expires_in"],
            interval=data["interval"],
        )

    def poll_github_device_flow(self, device_code: str) -> GithubDevicePollResponse:
        if device_code.startswith("mock-"):
            record = {
                "accessToken": f"mock-token-{device_code}",
                "scopes": ["read:user", "repo"],
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "user": {
                    "login": "knownext-user",
                    "name": "KnowNext User",
                    "avatarUrl": None,
                },
            }
            credential_service.save_github_record(record)
            return GithubDevicePollResponse(status="authenticated", auth=self.get_status())

        client_id = os.environ.get("KNOWNEXT_GITHUB_CLIENT_ID")
        if not client_id:
            raise HTTPException(status_code=400, detail="GitHub OAuth client is not configured")

        payload = urllib.parse.urlencode(
            {
                "client_id": client_id,
                "device_code": device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            }
        ).encode("utf-8")
        data = self._post_form(GITHUB_ACCESS_TOKEN_URL, payload)
        if "error" in data:
            status = "pending" if data["error"] == "authorization_pending" else "error"
            return GithubDevicePollResponse(
                status=status,
                auth=self.get_status(),
                interval=data.get("interval"),
                error=data["error"],
            )

        token = data.get("access_token")
        if not token:
            return GithubDevicePollResponse(status="pending", auth=self.get_status())

        user = self._get_github_user(token)
        scopes = [scope for scope in data.get("scope", "").split(",") if scope]
        credential_service.save_github_record(
            {
                "accessToken": token,
                "scopes": scopes,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "user": {
                    "login": user.get("login") or "github-user",
                    "name": user.get("name"),
                    "avatarUrl": user.get("avatar_url"),
                },
            }
        )
        return GithubDevicePollResponse(status="authenticated", auth=self.get_status())

    def logout(self) -> AuthStatus:
        credential_service.clear_github_record()
        return self.get_status()

    def require_github_auth(self) -> AuthStatus:
        status = self.get_status()
        if not status.isAuthenticated:
            raise HTTPException(status_code=403, detail="GitHub login is required for versioned projects")
        return status

    def _post_form(self, url: str, payload: bytes) -> dict:
        request = urllib.request.Request(
            url,
            data=payload,
            headers={"Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=502, detail=f"GitHub authentication request failed: {error}") from error

    def _get_github_user(self, token: str) -> dict:
        request = urllib.request.Request(
            GITHUB_USER_URL,
            headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=502, detail=f"GitHub user request failed: {error}") from error


auth_service = AuthService()
