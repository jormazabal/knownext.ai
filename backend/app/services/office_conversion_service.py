from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from fastapi import HTTPException

from app.services.logging_service import trace_logging_service


OFFICE_CONVERSION_ENGINE_VERSION = "libreoffice-headless-v1"
DEFAULT_CONVERSION_TIMEOUT_SECONDS = 45


class OfficeConversionService:
    def find_converter(self) -> str | None:
        configured = os.environ.get("KNOWNEXT_LIBREOFFICE_PATH")
        if configured and Path(configured).exists():
            return configured
        for command in ("soffice", "libreoffice"):
            path = shutil.which(command)
            if path:
                return path
        windows_candidates = [
            Path(os.environ.get("PROGRAMFILES", "")) / "LibreOffice" / "program" / "soffice.exe",
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "LibreOffice" / "program" / "soffice.exe",
        ]
        return next((str(candidate) for candidate in windows_candidates if candidate.exists()), None)

    def available(self) -> bool:
        return self.find_converter() is not None

    def convert_to_pdf(self, source_path: Path, target_pdf_path: Path, timeout_seconds: int = DEFAULT_CONVERSION_TIMEOUT_SECONDS) -> Path:
        converter = self.find_converter()
        if converter is None:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "converter_unavailable",
                    "message": "No se encontró LibreOffice para generar la vista paginada.",
                },
            )

        target_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="knownext-preview-") as temp_dir:
            temp_path = Path(temp_dir)
            profile_path = temp_path / "profile"
            command = [
                converter,
                "--headless",
                "--nologo",
                "--nofirststartwizard",
                "--norestore",
                f"-env:UserInstallation={profile_path.as_uri()}",
                "--convert-to",
                "pdf",
                "--outdir",
                str(temp_path),
                str(source_path),
            ]
            try:
                result = subprocess.run(command, text=True, capture_output=True, timeout=timeout_seconds)
            except subprocess.TimeoutExpired as error:
                trace_logging_service.record_exception("document_preview.office_conversion.timeout", error)
                raise HTTPException(
                    status_code=504,
                    detail={"code": "conversion_timeout", "message": "La conversión tardó demasiado y fue cancelada."},
                ) from error
            except OSError as error:
                trace_logging_service.record_exception("document_preview.office_conversion.os_error", error)
                raise HTTPException(
                    status_code=500,
                    detail={"code": "conversion_failed", "message": "No se pudo iniciar el conversor de documentos."},
                ) from error

            generated_pdf = temp_path / f"{source_path.stem}.pdf"
            if result.returncode != 0 or not generated_pdf.exists():
                trace_logging_service.record(
                    "error",
                    "document_preview.office_conversion",
                    "LibreOffice could not generate preview PDF.",
                    f"returncode={result.returncode}\nstdout={result.stdout}\nstderr={result.stderr}",
                )
                raise HTTPException(
                    status_code=422,
                    detail={"code": "conversion_failed", "message": "No se pudo generar la vista del documento."},
                )

            shutil.copyfile(generated_pdf, target_pdf_path)
            return target_pdf_path


office_conversion_service = OfficeConversionService()
