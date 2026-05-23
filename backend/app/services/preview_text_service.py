from __future__ import annotations

import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


class PreviewTextService:
    def extract_pdf_text(self, pdf_path: Path) -> tuple[str, list[str]]:
        try:
            from pypdf import PdfReader  # type: ignore
        except ImportError:
            return "", ["Búsqueda no disponible: extractor PDF no instalado."]
        try:
            reader = PdfReader(str(pdf_path))
            text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
            return text, [] if text else ["Búsqueda no disponible: el PDF no contiene texto extraíble."]
        except Exception:
            return "", ["Búsqueda no disponible: no se pudo leer el texto del PDF."]

    def extract_docx_text(self, docx_path: Path) -> tuple[str, list[str]]:
        try:
            with zipfile.ZipFile(docx_path) as package:
                document_xml = package.read("word/document.xml")
        except (KeyError, zipfile.BadZipFile, OSError):
            return "", ["Búsqueda no disponible: no se pudo extraer texto de Word."]
        root = ET.fromstring(document_xml)
        paragraphs: list[str] = []
        for paragraph in root.findall(".//w:p", WORD_NS):
            texts = [node.text or "" for node in paragraph.findall(".//w:t", WORD_NS)]
            if texts:
                paragraphs.append("".join(texts))
        text = "\n".join(paragraphs).strip()
        return text, [] if text else ["Búsqueda no disponible: el DOCX no contiene texto extraíble."]

    def extract_xlsx_text(self, workbook: dict) -> tuple[str, list[str]]:
        lines: list[str] = []
        for sheet in workbook.get("sheet_payloads", {}).values():
            lines.append(f"Hoja: {sheet.name}")
            for cell in sheet.cells:
                if cell.displayValue:
                    lines.append(f"{cell.address}: {cell.displayValue}")
        return "\n".join(lines).strip(), []


preview_text_service = PreviewTextService()
