from __future__ import annotations

import base64
import json
import mimetypes
import shutil
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.schemas.project import (
    AssetImportResponse,
    AssetMetadata,
    AssetMoveImpact,
    AssetUsageResponse,
    DocumentMoveImpact,
    FileOperationResult,
    InsertImageReferenceResponse,
    TreeNode,
)
from app.services.app_storage import JsonFileStore
from app.services.asset_reference_service import _format_markdown_target, asset_reference_service
from app.services.filesystem_service import IMAGE_SUFFIXES, decode_node_id, encode_node_id, filesystem_service
from app.services.ai_usage_service import ai_usage_service
from app.services.openai_service import openai_service
from app.services.project_service import project_service


MAX_IMAGE_BYTES = 12 * 1024 * 1024


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_relative_path(path: Path) -> str:
    return path.as_posix().strip("/")


def _safe_filename(filename: str) -> str:
    name = Path(filename).name.strip()
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if Path(name).suffix.lower() not in IMAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG, WEBP and GIF images are allowed")
    return name


def _unique_path(parent: Path, filename: str) -> Path:
    candidate = parent / filename
    if not candidate.exists():
        return candidate
    source = Path(filename)
    counter = 2
    while True:
        candidate = parent / f"{source.stem} {counter}{source.suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


class AssetService:
    async def import_image(self, project_id: str, parent_id: str | None, upload: UploadFile) -> AssetImportResponse:
        root = project_service._get_project_root(project_id)
        parent = filesystem_service._resolve_parent_folder(project_id, root, parent_id)
        filename = _safe_filename(upload.filename or "imagen.png")
        target = _unique_path(parent, filename)
        size = 0
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("wb") as output:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_IMAGE_BYTES:
                    output.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="Image is too large")
                output.write(chunk)
        asset = self.get_asset(project_id, encode_node_id(project_id, _normalize_relative_path(target.relative_to(root.resolve()))))
        return AssetImportResponse(tree=filesystem_service.get_tree(project_id, root), asset=asset)

    def create_generated_image(
        self,
        project_id: str,
        parent_id: str | None,
        filename: str,
        content: bytes,
        metadata: dict[str, Any] | None = None,
    ) -> AssetImportResponse:
        root = project_service._get_project_root(project_id)
        parent = filesystem_service._resolve_parent_folder(project_id, root, parent_id)
        safe_filename = _safe_filename(filename)
        if len(content) > MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="Generated image is too large")
        if not content:
            raise HTTPException(status_code=400, detail="Generated image is empty")
        target = _unique_path(parent, safe_filename)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        if metadata:
            self._write_generated_metadata(project_id, target, root.resolve(), metadata)
        asset = self.get_asset(project_id, encode_node_id(project_id, _normalize_relative_path(target.relative_to(root.resolve()))))
        return AssetImportResponse(tree=filesystem_service.get_tree(project_id, root), asset=asset)

    def get_asset(self, project_id: str, asset_id: str) -> AssetMetadata:
        root = project_service._get_project_root(project_id)
        path = self._resolve_asset_path(project_id, root, asset_id)
        return self._metadata(project_id, root, path)

    def get_content_response(self, project_id: str, asset_id: str) -> FileResponse:
        root = project_service._get_project_root(project_id)
        path = self._resolve_asset_path(project_id, root, asset_id)
        return FileResponse(path, media_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream", filename=path.name)

    def usage(self, project_id: str, asset_id: str) -> AssetUsageResponse:
        root = project_service._get_project_root(project_id)
        path = self._resolve_asset_path(project_id, root, asset_id)
        relative_path = _normalize_relative_path(path.relative_to(root.resolve()))
        asset = self._metadata(project_id, root, path)
        return AssetUsageResponse(asset=asset, references=asset_reference_service.get_asset_usage(project_id, root, relative_path))

    def move_impact(self, project_id: str, asset_id: str) -> AssetMoveImpact:
        usage = self.usage(project_id, asset_id)
        message = (
            f"La imagen esta enlazada desde {len(usage.references)} documento(s)."
            if usage.references
            else "La imagen no tiene referencias Markdown detectadas."
        )
        return AssetMoveImpact(asset=usage.asset, references=usage.references, message=message)

    def document_move_impact(self, project_id: str, document_id: str) -> DocumentMoveImpact:
        root = project_service._get_project_root(project_id)
        node_project_id, document_path = decode_node_id(document_id)
        if node_project_id != project_id:
            raise HTTPException(status_code=400, detail="Document does not belong to project")
        references = asset_reference_service.document_references(project_id, root, document_path)
        shared_paths: list[str] = []
        for reference in references:
            if not reference.resolvedAssetPath:
                continue
            usages = asset_reference_service.get_asset_usage(project_id, root, reference.resolvedAssetPath)
            if len({usage.documentPath for usage in usages}) > 1:
                shared_paths.append(reference.resolvedAssetPath)
        return DocumentMoveImpact(
            documentId=document_id,
            documentPath=document_path,
            references=references,
            sharedAssetPaths=sorted(set(shared_paths)),
            message=f"El documento contiene {len(references)} referencia(s) a imagen.",
        )

    def build_markdown_reference(self, project_id: str, document_id: str, asset_id: str, alt_text: str | None) -> InsertImageReferenceResponse:
        root = project_service._get_project_root(project_id)
        document_project_id, document_relative_path = decode_node_id(document_id)
        if document_project_id != project_id:
            raise HTTPException(status_code=400, detail="Document does not belong to project")
        document_path = (root.resolve() / document_relative_path).resolve()
        if not document_path.exists():
            raise HTTPException(status_code=404, detail="Document not found")
        asset_path = self._resolve_asset_path(project_id, root, asset_id)
        relative_asset = _normalize_relative_path(asset_path.relative_to(root.resolve()))
        relative_from_document = _relative_target(relative_asset, Path(document_relative_path).parent)
        asset = self._metadata(project_id, root, asset_path)
        alt = (alt_text or asset_path.stem).replace("[", "").replace("]", "").strip() or "Imagen"
        return InsertImageReferenceResponse(markdown=f"![{alt}]({_format_markdown_target(relative_from_document)})", asset=asset)

    def create_project_image_context_source(self, project_id: str, asset_id: str):
        from app.services.ai_context_service import ai_context_service

        root = project_service._get_project_root(project_id)
        path = self._resolve_asset_path(project_id, root, asset_id)
        return ai_context_service.create_project_image_source(project_id, path, root.resolve())

    def reindex_visual_assets(self, project_id: str) -> dict[str, Any]:
        root = project_service._get_project_root(project_id)
        vision = self._vision_config()
        image_paths = sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES)
        if not vision.get("enabled") or not vision.get("imageIndexingEnabled"):
            self._visual_store(project_id).write({"schemaVersion": 1, "images": [], "updatedAt": _now(), "status": "disabled"})
            return {"projectId": project_id, "imageCount": len(image_paths), "indexedImageCount": 0, "status": "disabled"}

        records = []
        for image_path in image_paths:
            relative_path = _normalize_relative_path(image_path.relative_to(root.resolve()))
            status = "updated"
            error = None
            description = ""
            try:
                description = openai_service.describe_image(
                    self._image_data_url(image_path),
                    (
                        "Describe esta imagen para busqueda documental en KnowNext.ai. "
                        "Devuelve una descripcion breve y factual en el idioma predominante del proyecto. "
                        "Incluye texto visible, diagramas, pantallas, objetos y contexto util; no inventes."
                    ),
                    model=str(vision.get("model") or "gpt-5.4-mini"),
                    detail=str(vision.get("detail") or "auto"),
                )
                ai_usage_service.record_vision_event(
                    project_id=project_id,
                    request_id=f"vision-index:{relative_path}:{image_path.stat().st_mtime_ns}",
                    model=str(vision.get("model") or "gpt-5.4-mini"),
                    detail=str(vision.get("detail") or "auto"),
                    image_count=1,
                    metadata={"assetPath": relative_path, "source": "visual_reindex"},
                )
            except Exception as exc:
                status = "error"
                error = str(exc)
                description = f"Imagen del proyecto: {image_path.stem.replace('-', ' ').replace('_', ' ')}."
            records.append(
                {
                    "path": relative_path,
                    "shaKey": f"{image_path.stat().st_mtime_ns}:{image_path.stat().st_size}",
                    "status": status,
                    "description": description,
                    "error": error,
                    "model": vision.get("model"),
                    "updatedAt": _now(),
                }
            )
        indexed_count = len([record for record in records if record["status"] == "updated"])
        status = "updated" if indexed_count == len(records) else "error"
        self._visual_store(project_id).write({"schemaVersion": 1, "images": records, "updatedAt": _now(), "status": status})
        return {"projectId": project_id, "imageCount": len(records), "indexedImageCount": indexed_count, "status": status}

    def list_broken_references(self, project_id: str) -> list:
        root = project_service._get_project_root(project_id)
        return [reference for reference in asset_reference_service.list_references(project_id, root) if reference.status == "broken"]

    def _metadata(self, project_id: str, root: Path, path: Path) -> AssetMetadata:
        stat = path.stat()
        relative_path = _normalize_relative_path(path.relative_to(root.resolve()))
        usage_count = len(asset_reference_service.get_asset_usage(project_id, root, relative_path))
        visual_record = self._visual_record(project_id, relative_path)
        image_info = _inspect_image(path)
        return AssetMetadata(
            id=encode_node_id(project_id, relative_path),
            projectId=project_id,
            name=path.name,
            path=relative_path,
            mimeType=mimetypes.guess_type(path.name)[0] or "image/*",
            sizeBytes=stat.st_size,
            width=image_info.get("width"),
            height=image_info.get("height"),
            colorDepthBits=image_info.get("colorDepthBits"),
            updatedAt=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            usageCount=usage_count,
            indexed=visual_record is not None and visual_record.get("status") == "updated",
            indexStatus=str(visual_record.get("status")) if visual_record else "not-indexed",
            visualDescription=str(visual_record.get("description")) if visual_record and visual_record.get("description") else None,
        )

    def _resolve_asset_path(self, project_id: str, root: Path, asset_id: str) -> Path:
        node_project_id, relative_path = decode_node_id(asset_id)
        if node_project_id != project_id:
            raise HTTPException(status_code=400, detail="Asset does not belong to project")
        path = (root.resolve() / relative_path).resolve()
        try:
            path.relative_to(root.resolve())
        except ValueError:
            raise HTTPException(status_code=400, detail="Asset path escapes project folder") from None
        if not path.exists() or not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
            raise HTTPException(status_code=404, detail="Image asset not found")
        return path

    def _visual_store(self, project_id: str) -> JsonFileStore:
        safe_project = "".join(char if char.isalnum() or char in "._-" else "_" for char in project_id)
        return JsonFileStore(f"ai-image-index/{safe_project}.json")

    def _generated_store(self, project_id: str) -> JsonFileStore:
        safe_project = "".join(char if char.isalnum() or char in "._-" else "_" for char in project_id)
        return JsonFileStore(f"ai-generated-images/{safe_project}.json")

    def _write_generated_metadata(self, project_id: str, image_path: Path, root: Path, metadata: dict[str, Any]) -> None:
        relative_path = _normalize_relative_path(image_path.relative_to(root))
        store = self._generated_store(project_id)
        data = store.read({"schemaVersion": 1, "images": []})
        images = data.get("images") if isinstance(data.get("images"), list) else []
        next_record = {
            "path": relative_path,
            "updatedAt": _now(),
            **{
                key: value
                for key, value in metadata.items()
                if isinstance(key, str) and value is not None and isinstance(value, str | int | float | bool | dict | list)
            },
        }
        images = [record for record in images if not (isinstance(record, dict) and record.get("path") == relative_path)]
        images.append(next_record)
        store.write({"schemaVersion": 1, "images": images, "updatedAt": _now()})

    def _visual_record(self, project_id: str, relative_path: str) -> dict[str, Any] | None:
        data = self._visual_store(project_id).read({"schemaVersion": 1, "images": []})
        images = data.get("images") if isinstance(data.get("images"), list) else []
        for image in images:
            if isinstance(image, dict) and image.get("path") == relative_path:
                return image
        return None

    def _vision_config(self) -> dict[str, Any]:
        from app.services.config_service import config_service

        return config_service.get_config().ai.vision.model_dump()

    def _image_data_url(self, image_path: Path) -> str:
        mime_type = mimetypes.guess_type(image_path.name)[0] or "image/*"
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        return f"data:{mime_type};base64,{encoded}"


def _relative_target(asset_path: str, document_parent: Path) -> str:
    import os

    parent = document_parent.as_posix()
    start = "." if parent in {"", "."} else parent
    relative = os.path.relpath(asset_path, start=start).replace("\\", "/")
    if not relative.startswith(".") and "/" not in relative:
        return f"./{relative}"
    return relative


def _inspect_image(path: Path) -> dict[str, int | None]:
    try:
        data = path.read_bytes()
    except OSError:
        return {"width": None, "height": None, "colorDepthBits": None}

    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 33:
        width, height = struct.unpack(">II", data[16:24])
        bit_depth = data[24]
        color_type = data[25]
        channels_by_color_type = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
        channels = channels_by_color_type.get(color_type)
        return {"width": width, "height": height, "colorDepthBits": bit_depth * channels if channels else bit_depth}

    if data.startswith((b"GIF87a", b"GIF89a")) and len(data) >= 11:
        width, height = struct.unpack("<HH", data[6:10])
        packed = data[10]
        return {"width": width, "height": height, "colorDepthBits": (packed & 0b00000111) + 1}

    if data.startswith(b"\xff\xd8"):
        jpeg_info = _inspect_jpeg(data)
        if jpeg_info:
            return jpeg_info

    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        webp_info = _inspect_webp(data)
        if webp_info:
            return webp_info

    return {"width": None, "height": None, "colorDepthBits": None}


def _inspect_jpeg(data: bytes) -> dict[str, int | None] | None:
    offset = 2
    start_of_frame_markers = {*range(0xC0, 0xC4), *range(0xC5, 0xC8), *range(0xC9, 0xCC), *range(0xCD, 0xD0)}
    while offset + 4 <= len(data):
        if data[offset] != 0xFF:
            offset += 1
            continue
        marker = data[offset + 1]
        offset += 2
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(data):
            break
        segment_length = struct.unpack(">H", data[offset : offset + 2])[0]
        if segment_length < 2 or offset + segment_length > len(data):
            break
        if marker in start_of_frame_markers and offset + 8 <= len(data):
            precision = data[offset + 2]
            height, width = struct.unpack(">HH", data[offset + 3 : offset + 7])
            components = data[offset + 7]
            return {"width": width, "height": height, "colorDepthBits": precision * components}
        offset += segment_length
    return None


def _inspect_webp(data: bytes) -> dict[str, int | None] | None:
    if len(data) < 30:
        return None
    chunk_type = data[12:16]
    if chunk_type == b"VP8X" and len(data) >= 30:
        flags = data[20]
        width = int.from_bytes(data[24:27], "little") + 1
        height = int.from_bytes(data[27:30], "little") + 1
        return {"width": width, "height": height, "colorDepthBits": 32 if flags & 0b00010000 else 24}
    if chunk_type == b"VP8 " and len(data) >= 30:
        start = 20
        if data[start + 3 : start + 6] != b"\x9d\x01\x2a":
            return None
        width = struct.unpack("<H", data[start + 6 : start + 8])[0] & 0x3FFF
        height = struct.unpack("<H", data[start + 8 : start + 10])[0] & 0x3FFF
        return {"width": width, "height": height, "colorDepthBits": 24}
    if chunk_type == b"VP8L" and len(data) >= 25 and data[20] == 0x2F:
        bits = int.from_bytes(data[21:25], "little")
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return {"width": width, "height": height, "colorDepthBits": 32}
    return None


asset_service = AssetService()
