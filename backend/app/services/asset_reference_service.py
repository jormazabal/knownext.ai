from __future__ import annotations

import re
import os
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL

from fastapi import HTTPException

from app.schemas.project import AssetReference
from app.services.filesystem_service import DOCUMENT_SUFFIXES, IMAGE_SUFFIXES, encode_node_id, get_document_id


MARKDOWN_IMAGE_RE = re.compile(r"!\[(?P<alt>[^\]]*)\]\((?P<body>[^)\n]+)\)")


def _normalize_relative_path(path: Path) -> str:
    return path.as_posix().strip("/")


def _split_markdown_target(body: str) -> tuple[str, str | None]:
    value = body.strip()
    if not value:
        return "", None
    if value.startswith("<") and ">" in value:
        end = value.index(">")
        target = value[1:end]
        title = value[end + 1:].strip().strip("\"'") or None
        return target, title
    if " " not in value:
        return value.strip("\"'"), None
    target, title = value.split(" ", 1)
    return target.strip("\"'"), title.strip().strip("\"'") or None


def _is_external_target(target: str) -> bool:
    normalized = target.lower()
    return normalized.startswith(("http://", "https://", "data:", "mailto:", "#"))


class AssetReferenceService:
    def list_references(self, project_id: str, root: Path) -> list[AssetReference]:
        project_root = root.resolve()
        references: list[AssetReference] = []
        for document_path in sorted(project_root.rglob("*")):
            if not document_path.is_file() or document_path.suffix.lower() not in DOCUMENT_SUFFIXES:
                continue
            references.extend(self._references_for_document(project_id, project_root, document_path))
        return references

    def get_asset_usage(self, project_id: str, root: Path, asset_relative_path: str) -> list[AssetReference]:
        normalized_asset = asset_relative_path.replace("\\", "/").strip("/")
        return [
            reference
            for reference in self.list_references(project_id, root)
            if reference.resolvedAssetPath == normalized_asset and reference.status == "valid"
        ]

    def document_references(self, project_id: str, root: Path, document_relative_path: str) -> list[AssetReference]:
        project_root = root.resolve()
        document_path = (project_root / document_relative_path).resolve()
        try:
            document_path.relative_to(project_root)
        except ValueError:
            raise HTTPException(status_code=400, detail="Document path escapes project folder") from None
        if not document_path.exists() or document_path.suffix.lower() not in DOCUMENT_SUFFIXES:
            raise HTTPException(status_code=404, detail="Document not found")
        return self._references_for_document(project_id, project_root, document_path)

    def rewrite_document_references_for_move(self, root: Path, old_document_path: str, new_document_path: str) -> None:
        project_root = root.resolve()
        document_path = (project_root / new_document_path).resolve()
        if not document_path.exists():
            return
        markdown = document_path.read_text(encoding="utf-8")
        old_parent = Path(old_document_path).parent
        new_parent = Path(new_document_path).parent

        def replace(match: re.Match[str]) -> str:
            alt = match.group("alt")
            target, title = _split_markdown_target(match.group("body"))
            if not target or _is_external_target(target):
                return match.group(0)
            asset_path = (old_parent / target).as_posix()
            normalized_asset = str(Path(asset_path)).replace("\\", "/")
            next_target = _relative_markdown_target(normalized_asset, new_parent)
            if not next_target.startswith(".") and "/" not in next_target:
                next_target = f"./{next_target}"
            title_part = f' "{title}"' if title else ""
            return f"![{alt}]({next_target}{title_part})"

        document_path.write_text(MARKDOWN_IMAGE_RE.sub(replace, markdown), encoding="utf-8")

    def rewrite_asset_references(self, project_id: str, root: Path, old_asset_path: str, new_asset_path: str) -> list[AssetReference]:
        project_root = root.resolve()
        affected: list[AssetReference] = []
        normalized_old = old_asset_path.replace("\\", "/").strip("/")
        normalized_new = new_asset_path.replace("\\", "/").strip("/")

        for reference in self.list_references(project_id, root):
            if reference.resolvedAssetPath != normalized_old:
                continue
            document_path = (project_root / reference.documentPath).resolve()
            markdown = document_path.read_text(encoding="utf-8")
            document_parent = Path(reference.documentPath).parent

            def replace(match: re.Match[str]) -> str:
                target, title = _split_markdown_target(match.group("body"))
                resolved = self._resolve_target(project_root, document_path, target)
                if resolved != normalized_old:
                    return match.group(0)
                next_target = _relative_markdown_target(normalized_new, document_parent)
                if not next_target.startswith(".") and "/" not in next_target:
                    next_target = f"./{next_target}"
                title_part = f' "{title}"' if title else ""
                return f"![{match.group('alt')}]({next_target}{title_part})"

            document_path.write_text(MARKDOWN_IMAGE_RE.sub(replace, markdown), encoding="utf-8")
            affected.append(reference)
        return affected

    def _references_for_document(self, project_id: str, project_root: Path, document_path: Path) -> list[AssetReference]:
        relative_document_path = _normalize_relative_path(document_path.relative_to(project_root))
        markdown = document_path.read_text(encoding="utf-8", errors="replace")
        line_starts = _line_starts(markdown)
        references: list[AssetReference] = []
        for index, match in enumerate(MARKDOWN_IMAGE_RE.finditer(markdown)):
            target, title = _split_markdown_target(match.group("body"))
            status = "external" if _is_external_target(target) else "broken"
            resolved = None
            if target and not _is_external_target(target):
                resolved = self._resolve_target(project_root, document_path, target)
                if resolved:
                    asset_path = project_root / resolved
                    status = "valid" if asset_path.exists() and asset_path.suffix.lower() in IMAGE_SUFFIXES else "broken"
            line, column = _line_column(line_starts, match.start())
            references.append(
                AssetReference(
                    id=f"ref_{uuid5(NAMESPACE_URL, f'{project_id}:{relative_document_path}:{match.start()}:{target}').hex}",
                    projectId=project_id,
                    documentId=get_document_id(project_id, relative_document_path),
                    documentName=document_path.name,
                    documentPath=relative_document_path,
                    rawTarget=target,
                    resolvedAssetPath=resolved,
                    status=status,
                    altText=match.group("alt") or None,
                    title=title,
                    line=line,
                    column=column,
                )
            )
        return references

    def _resolve_target(self, project_root: Path, document_path: Path, target: str) -> str | None:
        if not target:
            return None
        clean_target = target.split("#", 1)[0].split("?", 1)[0]
        candidate = (document_path.parent / clean_target).resolve()
        try:
            return _normalize_relative_path(candidate.relative_to(project_root))
        except ValueError:
            return None


def _line_starts(value: str) -> list[int]:
    starts = [0]
    starts.extend(match.end() for match in re.finditer("\n", value))
    return starts


def _line_column(starts: list[int], offset: int) -> tuple[int, int]:
    line_index = 0
    for index, start in enumerate(starts):
        if start > offset:
            break
        line_index = index
    return line_index + 1, offset - starts[line_index] + 1


def _relative_markdown_target(asset_path: str, document_parent: Path) -> str:
    parent = document_parent.as_posix()
    start = "." if parent in {"", "."} else parent
    relative = os.path.relpath(asset_path, start=start).replace("\\", "/")
    if not relative.startswith(".") and "/" not in relative:
        return f"./{relative}"
    return relative


asset_reference_service = AssetReferenceService()
