from __future__ import annotations

import base64
import ctypes
import os
from copy import deepcopy
from typing import Any

from app.services.app_storage import JsonFileStore


class CredentialService:
    def __init__(self) -> None:
        self.store = JsonFileStore("credentials.json")

    def get_github_token(self) -> str | None:
        data = self.store.read({"schemaVersion": 1, "github": None})
        github = data.get("github")
        if not isinstance(github, dict):
            return None
        token = github.get("accessToken")
        if isinstance(token, str) and token:
            return token
        protected_token = github.get("accessTokenProtected")
        if isinstance(protected_token, str) and protected_token:
            return _unprotect_secret(protected_token)
        return None

    def get_github_record(self) -> dict[str, Any] | None:
        data = self.store.read({"schemaVersion": 1, "github": None})
        github = data.get("github")
        return deepcopy(github) if isinstance(github, dict) else None

    def save_github_record(self, record: dict[str, Any]) -> None:
        next_record = deepcopy(record)
        token = next_record.pop("accessToken", None)
        if isinstance(token, str) and token:
            protected_token = _protect_secret(token)
            if protected_token:
                next_record["accessTokenProtected"] = protected_token
            else:
                next_record["accessToken"] = token
        self.store.write({"schemaVersion": 1, "github": next_record})

    def clear_github_record(self) -> None:
        self.store.write({"schemaVersion": 1, "github": None})


credential_service = CredentialService()


def _protect_secret(value: str) -> str | None:
    if os.name != "nt":
        return None
    try:
        encrypted = _crypt_protect_data(value.encode("utf-8"))
        return f"dpapi:{base64.b64encode(encrypted).decode('ascii')}"
    except Exception:
        return None


def _unprotect_secret(value: str) -> str | None:
    if not value.startswith("dpapi:") or os.name != "nt":
        return None
    try:
        encrypted = base64.b64decode(value.removeprefix("dpapi:"))
        return _crypt_unprotect_data(encrypted).decode("utf-8")
    except Exception:
        return None


class _DataBlob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_ulong), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]


def _blob_from_bytes(data: bytes) -> tuple[_DataBlob, ctypes.Array]:
    buffer = ctypes.create_string_buffer(data, len(data))
    blob = _DataBlob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    return blob, buffer


def _bytes_from_blob(blob: _DataBlob) -> bytes:
    try:
      return ctypes.string_at(blob.pbData, blob.cbData)
    finally:
      ctypes.windll.kernel32.LocalFree(blob.pbData)


def _crypt_protect_data(data: bytes) -> bytes:
    input_blob, _buffer = _blob_from_bytes(data)
    output_blob = _DataBlob()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    return _bytes_from_blob(output_blob)


def _crypt_unprotect_data(data: bytes) -> bytes:
    input_blob, _buffer = _blob_from_bytes(data)
    output_blob = _DataBlob()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(input_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(output_blob),
    ):
        raise ctypes.WinError()
    return _bytes_from_blob(output_blob)
