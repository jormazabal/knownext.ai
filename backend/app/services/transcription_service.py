from __future__ import annotations

import asyncio
import base64
import inspect
import json
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

from app.services.config_service import config_service
from app.services.credential_service import credential_service
from app.services.ai_usage_service import ai_usage_service


OPENAI_REALTIME_TRANSCRIPTION_URL = "wss://api.openai.com/v1/realtime?intent=transcription"
SUPPORTED_LANGUAGES = {"auto", "es", "en", "fr", "de", "it", "pt", "ca", "eu", "gl"}
MANUAL_COMMIT_INTERVAL_SECONDS = 1.0


class TranscriptionService:
    async def handle_realtime_session(self, websocket: WebSocket) -> None:
        await websocket.accept()

        start_message = await self._receive_start(websocket)
        if not start_message:
            return

        config = config_service.get_config().ai.transcription
        if not config.enabled:
            await self._send_error(websocket, "transcription_disabled", "La transcripción está desactivada en la configuración de IA.")
            await websocket.close()
            return

        api_key = credential_service.get_openai_key()
        if not api_key:
            await self._send_error(websocket, "openai_key_missing", "Configura OpenAI en Ajustes > IA para usar transcripción.")
            await websocket.close()
            return

        language = start_message.get("language") if isinstance(start_message.get("language"), str) else config.defaultLanguage
        if language not in SUPPORTED_LANGUAGES:
            language = config.defaultLanguage if config.defaultLanguage in SUPPORTED_LANGUAGES else "auto"
        project_id = start_message.get("projectId") if isinstance(start_message.get("projectId"), str) and start_message.get("projectId") else "transcription"
        document_id = start_message.get("documentId") if isinstance(start_message.get("documentId"), str) and start_message.get("documentId") else None

        try:
            openai_ws = await self._connect_openai(api_key)
        except Exception:
            await self._send_error(websocket, "openai_connection_failed", "No se pudo abrir la sesión realtime con OpenAI.")
            await websocket.close()
            return

        await openai_ws.send(json.dumps(_build_session_update(config.model, language)))
        await websocket.send_json({"type": "started"})

        stop_event = asyncio.Event()
        audio_ready_event = asyncio.Event()
        forward_task = asyncio.create_task(self._forward_openai_events(websocket, openai_ws, stop_event, project_id, document_id, config.model))
        receive_task = asyncio.create_task(self._receive_client_audio(websocket, openai_ws, stop_event, audio_ready_event))
        commit_task = asyncio.create_task(self._commit_client_audio_periodically(openai_ws, stop_event, audio_ready_event))

        try:
            await asyncio.wait({forward_task, receive_task, commit_task}, return_when=asyncio.FIRST_COMPLETED)
        finally:
            stop_event.set()
            for task in (forward_task, receive_task, commit_task):
                task.cancel()
            await _close_openai(openai_ws)

    async def _receive_start(self, websocket: WebSocket) -> dict[str, Any] | None:
        try:
            message = await websocket.receive_json()
        except WebSocketDisconnect:
            return None
        except Exception:
            await self._send_error(websocket, "invalid_start", "No se pudo iniciar la transcripción.")
            await websocket.close()
            return None

        if message.get("type") != "start":
            await self._send_error(websocket, "invalid_start", "La sesión de transcripción debe empezar con start.")
            await websocket.close()
            return None
        return message

    async def _connect_openai(self, api_key: str):
        try:
            import websockets
        except ImportError as error:
            raise RuntimeError("websockets is not installed") from error

        headers = {
            "Authorization": f"Bearer {api_key}",
        }
        connect = websockets.connect
        parameters = inspect.signature(connect).parameters
        if "additional_headers" in parameters:
            return await connect(OPENAI_REALTIME_TRANSCRIPTION_URL, additional_headers=headers)
        return await connect(OPENAI_REALTIME_TRANSCRIPTION_URL, extra_headers=headers)

    async def _receive_client_audio(self, websocket: WebSocket, openai_ws, stop_event: asyncio.Event, audio_ready_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            try:
                message = await websocket.receive()
            except WebSocketDisconnect:
                stop_event.set()
                return

            if message.get("bytes") is not None:
                audio = base64.b64encode(message["bytes"]).decode("ascii")
                await openai_ws.send(json.dumps({"type": "input_audio_buffer.append", "audio": audio}))
                audio_ready_event.set()
                continue

            raw_text = message.get("text")
            if not raw_text:
                continue
            try:
                event = json.loads(raw_text)
            except json.JSONDecodeError:
                continue

            if event.get("type") == "stop":
                await websocket.send_json({"type": "stopping"})
                await _commit_audio_if_ready(openai_ws, audio_ready_event)
                await asyncio.sleep(0.8)
                await websocket.send_json({"type": "stopped"})
                stop_event.set()
                return

    async def _commit_client_audio_periodically(self, openai_ws, stop_event: asyncio.Event, audio_ready_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            await asyncio.sleep(MANUAL_COMMIT_INTERVAL_SECONDS)
            await _commit_audio_if_ready(openai_ws, audio_ready_event)

    async def _forward_openai_events(self, websocket: WebSocket, openai_ws, stop_event: asyncio.Event, project_id: str, document_id: str | None, model: str) -> None:
        while not stop_event.is_set():
            try:
                raw_event = await openai_ws.recv()
            except Exception:
                if not stop_event.is_set():
                    await self._send_error(websocket, "openai_stream_closed", "Se interrumpió la transcripción. El texto confirmado se ha conservado.")
                    stop_event.set()
                return

            try:
                event = json.loads(raw_event)
            except json.JSONDecodeError:
                continue

            event_type = event.get("type")
            if event_type == "conversation.item.input_audio_transcription.delta":
                await websocket.send_json({
                    "type": "delta",
                    "itemId": event.get("item_id"),
                    "delta": event.get("delta", ""),
                })
            elif event_type == "conversation.item.input_audio_transcription.completed":
                transcript = event.get("transcript", "") if isinstance(event.get("transcript"), str) else ""
                if transcript.strip():
                    ai_usage_service.record_audio_transcription_event(
                        project_id=project_id,
                        document_id=document_id,
                        request_id=f"transcription:{event.get('item_id') or 'completed'}",
                        model=model or "gpt-realtime-whisper",
                        transcript=transcript,
                        metadata={"itemId": event.get("item_id")},
                    )
                await websocket.send_json({
                    "type": "completed",
                    "itemId": event.get("item_id"),
                    "transcript": transcript,
                })
            elif event_type == "error":
                await self._send_error(websocket, "openai_error", _extract_openai_error(event))

    async def _send_error(self, websocket: WebSocket, code: str, message: str) -> None:
        try:
            await websocket.send_json({"type": "error", "code": code, "message": message})
        except Exception:
            pass


def _build_session_update(model: str, language: str) -> dict[str, Any]:
    transcription: dict[str, Any] = {"model": model or "gpt-realtime-whisper"}
    if language != "auto":
        transcription["language"] = language

    return {
        "type": "session.update",
        "session": {
            "type": "transcription",
            "audio": {
                "input": {
                    "format": {
                        "type": "audio/pcm",
                        "rate": 24000,
                    },
                    "noise_reduction": {
                        "type": "near_field",
                    },
                    "transcription": transcription,
                },
            },
        },
    }


def _extract_openai_error(event: dict[str, Any]) -> str:
    error = event.get("error")
    if isinstance(error, dict):
        message = error.get("message")
        if isinstance(message, str) and message:
            return message
    return "OpenAI devolvió un error durante la transcripción."


async def _close_openai(openai_ws) -> None:
    try:
        await openai_ws.close()
    except Exception:
        pass


async def _commit_audio_if_ready(openai_ws, audio_ready_event: asyncio.Event) -> None:
    if not audio_ready_event.is_set():
        return
    audio_ready_event.clear()
    try:
        await openai_ws.send(json.dumps({"type": "input_audio_buffer.commit"}))
    except Exception:
        pass


transcription_service = TranscriptionService()
