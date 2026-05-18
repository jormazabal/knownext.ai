from __future__ import annotations

import base64
import mimetypes
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.schemas.project import AffectedDocument, FileOperationResult, TreeNode

EXCLUDED_DIRS = {".git", ".knownext", "node_modules", "__pycache__", ".venv", "venv", "dist", "build"}
DOCUMENT_SUFFIXES = {".md", ".markdown"}
DOCUMENT_SUFFIX = ".md"
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
PRIVATE_SUFFIXES = {".env", ".key", ".pem", ".p12", ".pfx", ".crt", ".cer"}
PRIVATE_NAMES = {".env", ".env.local", ".env.production", "id_rsa", "id_ed25519"}
MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024
ID_PREFIX = "fs_"


def encode_node_id(project_id: str, relative_path: str) -> str:
    normalized_path = relative_path.replace("\\", "/").strip("/")
    raw_id = f"{project_id}|{normalized_path}".encode("utf-8")
    return f"{ID_PREFIX}{base64.urlsafe_b64encode(raw_id).decode('ascii').rstrip('=')}"


def decode_node_id(node_id: str) -> tuple[str, str]:
    if not node_id.startswith(ID_PREFIX):
        raise HTTPException(status_code=400, detail="Unsupported filesystem node id")

    encoded = node_id[len(ID_PREFIX):]
    padding = "=" * (-len(encoded) % 4)
    try:
        decoded = base64.urlsafe_b64decode(f"{encoded}{padding}").decode("utf-8")
        project_id, relative_path = decoded.split("|", 1)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid filesystem node id") from None

    return project_id, relative_path


def get_document_id(project_id: str, relative_path: str) -> str:
    return encode_node_id(project_id, relative_path)


def decode_document_id(document_id: str) -> tuple[str, str]:
    return decode_node_id(document_id)


def _normalize_relative_path(path: Path) -> str:
    return path.as_posix().strip("/")


def _safe_name(name: str, default_name: str) -> str:
    value = name.strip() or default_name
    if "/" in value or "\\" in value:
        raise HTTPException(status_code=400, detail="Names cannot contain path separators")
    if value in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid name")
    return value


def _ensure_markdown_name(name: str) -> str:
    safe_name = _safe_name(name, "nuevo-documento.md")
    return safe_name if Path(safe_name).suffix.lower() in DOCUMENT_SUFFIXES else f"{safe_name}{DOCUMENT_SUFFIX}"


def _is_private_filename(name: str) -> bool:
    candidate = Path(name).name.lower()
    return candidate in PRIVATE_NAMES or Path(candidate).suffix.lower() in PRIVATE_SUFFIXES


def _ensure_image_name(name: str, current_suffix: str) -> str:
    safe_name = _safe_name(name, "imagen")
    if Path(safe_name).suffix.lower() not in IMAGE_SUFFIXES:
        safe_name = f"{safe_name}{current_suffix}"
    return safe_name


def _ensure_attachment_name(name: str, current_suffix: str) -> str:
    safe_name = _safe_name(name, "archivo")
    if _is_private_filename(safe_name):
        raise HTTPException(status_code=400, detail="Private files cannot be managed as project attachments")
    if current_suffix and not Path(safe_name).suffix:
        safe_name = f"{safe_name}{current_suffix}"
    suffix = Path(safe_name).suffix.lower()
    if suffix in DOCUMENT_SUFFIXES | IMAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="Use the Markdown or image import flow for this file type")
    return safe_name


def _safe_attachment_filename(filename: str | None) -> str:
    name = Path(filename or "archivo").name.strip()
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if "/" in name or "\\" in name:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if _is_private_filename(name):
        raise HTTPException(status_code=400, detail="Private files cannot be imported as project attachments")
    suffix = Path(name).suffix.lower()
    if suffix in DOCUMENT_SUFFIXES | IMAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="Use the Markdown or image import flow for this file type")
    return name


def _resolve_child(root: Path, relative_path: str | None) -> Path:
    if not relative_path:
        return root

    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=400, detail="Path escapes project folder") from None
    return candidate


def _unique_duplicate_path(source: Path, target_folder: Path | None = None) -> Path:
    parent = target_folder or source.parent
    if parent != source.parent:
        candidate = parent / source.name
        if not candidate.exists():
            return candidate
    candidate = parent / f"{source.stem} copia{source.suffix}"
    counter = 2
    while candidate.exists():
        candidate = parent / f"{source.stem} copia {counter}{source.suffix}"
        counter += 1
    return candidate


def _unique_file_path(parent: Path, filename: str) -> Path:
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


def _unique_folder_path(parent: Path, name: str) -> Path:
    candidate = parent / name
    if not candidate.exists():
        return candidate

    counter = 2
    while True:
        candidate = parent / f"{name} {counter}"
        if not candidate.exists():
            return candidate
        counter += 1


def _document_change(project_id: str, old_relative_path: str, new_relative_path: str | None = None) -> AffectedDocument:
    return AffectedDocument(
        oldId=get_document_id(project_id, old_relative_path),
        newId=get_document_id(project_id, new_relative_path) if new_relative_path else None,
        name=Path(new_relative_path).name if new_relative_path else None,
        path=new_relative_path,
    )


class FileSystemService:
    def get_tree(self, project_id: str, root: Path) -> list[TreeNode]:
        if not root.exists() or not root.is_dir():
            return []
        return self._scan_directory(project_id, root.resolve(), root.resolve(), depth=0)

    def read_document(self, project_id: str, root: Path, relative_path: str) -> tuple[str, Path]:
        document_path = _resolve_child(root.resolve(), relative_path)
        if not document_path.exists() or not document_path.is_file() or document_path.suffix.lower() not in DOCUMENT_SUFFIXES:
            raise HTTPException(status_code=404, detail="Document not found")
        return document_path.read_text(encoding="utf-8"), document_path

    def save_document(self, root: Path, relative_path: str, markdown: str) -> Path:
        document_path = _resolve_child(root.resolve(), relative_path)
        if not document_path.exists() or not document_path.is_file() or document_path.suffix.lower() not in DOCUMENT_SUFFIXES:
            raise HTTPException(status_code=404, detail="Document not found")
        document_path.write_text(markdown, encoding="utf-8")
        return document_path

    def create_folder(self, project_id: str, root: Path, parent_id: str | None, name: str) -> FileOperationResult:
        parent_path = self._resolve_parent_folder(project_id, root, parent_id)
        folder_path = _unique_folder_path(parent_path, _safe_name(name, "Nueva carpeta"))
        folder_path.mkdir()
        relative_path = _normalize_relative_path(folder_path.relative_to(root.resolve()))
        return FileOperationResult(tree=self.get_tree(project_id, root), node=self._folder_node(project_id, folder_path, root.resolve(), 0))

    def create_document(self, project_id: str, root: Path, parent_id: str | None, name: str, markdown: str) -> FileOperationResult:
        parent_path = self._resolve_parent_folder(project_id, root, parent_id)
        document_path = parent_path / _ensure_markdown_name(name)
        if document_path.exists():
            raise HTTPException(status_code=409, detail="Document already exists")
        document_path.write_text(markdown, encoding="utf-8")
        node = self._document_node(project_id, document_path, root.resolve())
        return FileOperationResult(tree=self.get_tree(project_id, root), node=node)

    async def import_attachment(self, project_id: str, root: Path, parent_id: str | None, upload: UploadFile) -> FileOperationResult:
        parent_path = self._resolve_parent_folder(project_id, root, parent_id)
        filename = _safe_attachment_filename(upload.filename)
        attachment_path = _unique_file_path(parent_path, filename)
        size = 0
        attachment_path.parent.mkdir(parents=True, exist_ok=True)
        with attachment_path.open("wb") as output:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_ATTACHMENT_BYTES:
                    output.close()
                    attachment_path.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="Attachment is too large")
                output.write(chunk)
        return FileOperationResult(tree=self.get_tree(project_id, root), node=self._attachment_node(project_id, attachment_path, root.resolve()))

    def rename_node(self, project_id: str, root: Path, node_id: str, name: str) -> FileOperationResult:
        node_path = self._resolve_node(project_id, root, node_id)
        old_documents = self._collect_document_relative_paths(root.resolve(), node_path)
        old_relative_path = _normalize_relative_path(node_path.relative_to(root.resolve()))
        if node_path.is_file() and node_path.suffix.lower() in DOCUMENT_SUFFIXES:
            new_name = _ensure_markdown_name(name)
        elif node_path.is_file() and node_path.suffix.lower() in IMAGE_SUFFIXES:
            new_name = _ensure_image_name(name, node_path.suffix)
        elif node_path.is_file():
            new_name = _ensure_attachment_name(name, node_path.suffix)
        else:
            new_name = _safe_name(name, "Nueva carpeta")
        target_path = node_path.with_name(new_name)
        if target_path.exists():
            raise HTTPException(status_code=409, detail="Target already exists")
        node_path.rename(target_path)
        new_relative_path = _normalize_relative_path(target_path.relative_to(root.resolve()))
        self._rewrite_references_after_path_change(project_id, root.resolve(), node_path, old_relative_path, new_relative_path)
        new_documents = self._collect_document_relative_paths(root.resolve(), target_path)
        return FileOperationResult(
            tree=self.get_tree(project_id, root),
            node=self._node_for_path(project_id, target_path, root.resolve(), 0),
            affectedDocuments=self._map_document_changes(project_id, old_documents, new_documents),
        )

    def delete_node(self, project_id: str, root: Path, node_id: str) -> FileOperationResult:
        node_path = self._resolve_node(project_id, root, node_id)
        affected = [
            _document_change(project_id, relative_path)
            for relative_path in self._collect_document_relative_paths(root.resolve(), node_path)
        ]
        if node_path.is_dir():
            shutil.rmtree(node_path)
        else:
            node_path.unlink()
        return FileOperationResult(tree=self.get_tree(project_id, root), affectedDocuments=affected)

    def duplicate_document(self, project_id: str, root: Path, document_id: str, target_folder_id: str | None = None, name: str | None = None) -> FileOperationResult:
        document_path = self._resolve_node(project_id, root, document_id)
        if not document_path.is_file() or document_path.suffix.lower() not in DOCUMENT_SUFFIXES:
            raise HTTPException(status_code=400, detail="Only Markdown documents can be duplicated")
        target_folder = self._resolve_parent_folder(project_id, root, target_folder_id) if target_folder_id else document_path.parent
        if name and name.strip():
            target_path = target_folder / _ensure_markdown_name(name)
            if target_path.exists():
                raise HTTPException(status_code=409, detail="Target already exists")
        else:
            target_path = _unique_duplicate_path(document_path, target_folder)
        shutil.copy2(document_path, target_path)
        return FileOperationResult(tree=self.get_tree(project_id, root), node=self._document_node(project_id, target_path, root.resolve()))

    def move_node(self, project_id: str, root: Path, node_id: str, target_folder_id: str | None) -> FileOperationResult:
        node_path = self._resolve_node(project_id, root, node_id)
        target_folder = self._resolve_parent_folder(project_id, root, target_folder_id)
        if node_path.parent == target_folder:
            return FileOperationResult(tree=self.get_tree(project_id, root), node=self._node_for_path(project_id, node_path, root.resolve(), 0))
        if node_path.is_dir():
            try:
                target_folder.relative_to(node_path)
            except ValueError:
                pass
            else:
                raise HTTPException(status_code=400, detail="Cannot move a folder into itself")

        target_path = target_folder / node_path.name
        if target_path.exists():
            raise HTTPException(status_code=409, detail="Target already exists")

        old_documents = self._collect_document_relative_paths(root.resolve(), node_path)
        old_relative_path = _normalize_relative_path(node_path.relative_to(root.resolve()))
        shutil.move(str(node_path), str(target_path))
        new_relative_path = _normalize_relative_path(target_path.relative_to(root.resolve()))
        self._rewrite_references_after_path_change(project_id, root.resolve(), node_path, old_relative_path, new_relative_path)
        new_documents = self._collect_document_relative_paths(root.resolve(), target_path)
        return FileOperationResult(
            tree=self.get_tree(project_id, root),
            node=self._node_for_path(project_id, target_path, root.resolve(), 0),
            affectedDocuments=self._map_document_changes(project_id, old_documents, new_documents),
        )

    def _scan_directory(self, project_id: str, directory: Path, root: Path, depth: int) -> list[TreeNode]:
        nodes: list[TreeNode] = []
        try:
            children = list(directory.iterdir())
        except OSError:
            return nodes

        for child in sorted(children, key=lambda path: (path.is_file(), path.name.lower())):
            if child.is_dir():
                if child.name in EXCLUDED_DIRS or child.name.startswith("."):
                    continue
                nodes.append(self._folder_node(project_id, child, root, depth))
            elif child.name.startswith("."):
                continue
            elif child.is_file() and child.suffix.lower() in DOCUMENT_SUFFIXES:
                nodes.append(self._document_node(project_id, child, root))
            elif child.is_file() and child.suffix.lower() in IMAGE_SUFFIXES:
                nodes.append(self._image_node(project_id, child, root))
            elif child.is_file() and not _is_private_filename(child.name):
                nodes.append(self._attachment_node(project_id, child, root))

        return nodes

    def _folder_node(self, project_id: str, folder_path: Path, root: Path, depth: int) -> TreeNode:
        relative_path = _normalize_relative_path(folder_path.relative_to(root))
        return TreeNode(
            id=encode_node_id(project_id, relative_path),
            name=folder_path.name,
            type="folder",
            path=relative_path,
            open=False,
            children=self._scan_directory(project_id, folder_path, root, depth + 1),
        )

    def _document_node(self, project_id: str, document_path: Path, root: Path) -> TreeNode:
        relative_path = _normalize_relative_path(document_path.relative_to(root))
        return TreeNode(
            id=get_document_id(project_id, relative_path),
            name=document_path.name,
            type="document",
            path=relative_path,
            mimeType="text/markdown",
            sizeBytes=document_path.stat().st_size,
        )

    def _image_node(self, project_id: str, image_path: Path, root: Path) -> TreeNode:
        relative_path = _normalize_relative_path(image_path.relative_to(root))
        return TreeNode(
            id=encode_node_id(project_id, relative_path),
            name=image_path.name,
            type="image",
            path=relative_path,
            mimeType=mimetypes.guess_type(image_path.name)[0] or "image/*",
            sizeBytes=image_path.stat().st_size,
        )

    def _attachment_node(self, project_id: str, attachment_path: Path, root: Path) -> TreeNode:
        relative_path = _normalize_relative_path(attachment_path.relative_to(root))
        return TreeNode(
            id=encode_node_id(project_id, relative_path),
            name=attachment_path.name,
            type="attachment",
            path=relative_path,
            mimeType=mimetypes.guess_type(attachment_path.name)[0] or "application/octet-stream",
            sizeBytes=attachment_path.stat().st_size,
        )

    def _node_for_path(self, project_id: str, path: Path, root: Path, depth: int) -> TreeNode:
        if path.is_dir():
            return self._folder_node(project_id, path, root, depth)
        if path.suffix.lower() in IMAGE_SUFFIXES:
            return self._image_node(project_id, path, root)
        if path.suffix.lower() in DOCUMENT_SUFFIXES:
            return self._document_node(project_id, path, root)
        return self._attachment_node(project_id, path, root)

    def _resolve_parent_folder(self, project_id: str, root: Path, folder_id: str | None) -> Path:
        project_root = root.resolve()
        if not folder_id:
            return project_root
        folder_project_id, relative_path = decode_node_id(folder_id)
        if folder_project_id != project_id:
            raise HTTPException(status_code=400, detail="Node does not belong to project")
        folder_path = _resolve_child(project_root, relative_path)
        if not folder_path.exists() or not folder_path.is_dir():
            raise HTTPException(status_code=404, detail="Folder not found")
        return folder_path

    def _resolve_node(self, project_id: str, root: Path, node_id: str) -> Path:
        node_project_id, relative_path = decode_node_id(node_id)
        if node_project_id != project_id:
            raise HTTPException(status_code=400, detail="Node does not belong to project")
        node_path = _resolve_child(root.resolve(), relative_path)
        if not node_path.exists():
            raise HTTPException(status_code=404, detail="Node not found")
        return node_path

    def _collect_document_relative_paths(self, root: Path, path: Path) -> list[str]:
        if path.is_file():
            return [_normalize_relative_path(path.relative_to(root))] if path.suffix.lower() in DOCUMENT_SUFFIXES else []
        return [
            _normalize_relative_path(document_path.relative_to(root))
            for document_path in sorted(path.rglob("*"))
            if document_path.is_file() and document_path.suffix.lower() in DOCUMENT_SUFFIXES
        ]

    def _map_document_changes(self, project_id: str, old_paths: list[str], new_paths: list[str]) -> list[AffectedDocument]:
        return [
            _document_change(project_id, old_path, new_paths[index] if index < len(new_paths) else None)
            for index, old_path in enumerate(old_paths)
        ]

    def _rewrite_references_after_path_change(self, project_id: str, root: Path, old_path: Path, old_relative_path: str, new_relative_path: str) -> None:
        from app.services.asset_reference_service import asset_reference_service

        if old_path.suffix.lower() in IMAGE_SUFFIXES:
            asset_reference_service.rewrite_asset_references(project_id, root, old_relative_path, new_relative_path)
            return
        if old_path.suffix.lower() in DOCUMENT_SUFFIXES:
            asset_reference_service.rewrite_document_references_for_move(root, old_relative_path, new_relative_path)


filesystem_service = FileSystemService()
