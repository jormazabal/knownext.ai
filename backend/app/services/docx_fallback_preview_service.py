from __future__ import annotations

import html
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from fastapi import HTTPException

from app.services.logging_service import trace_logging_service


WORD_NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
WORD_MAIN_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
DOCX_FALLBACK_WARNING = "Vista básica generada desde Word; la fidelidad puede variar porque LibreOffice no está disponible."


class DocxFallbackPreviewService:
    def generate_pdf(self, source_path: Path, target_pdf_path: Path) -> Path:
        try:
            blocks = self._read_blocks(source_path)
            self._write_pdf(source_path.name, blocks, target_pdf_path)
        except Exception as error:
            trace_logging_service.record_exception("document_preview.docx_fallback.failed", error)
            raise HTTPException(
                status_code=422,
                detail={"code": "conversion_failed", "message": "No se pudo generar la vista básica de Word."},
            ) from error
        return target_pdf_path

    def _read_blocks(self, source_path: Path) -> list[dict[str, object]]:
        with zipfile.ZipFile(source_path) as package:
            document_xml = package.read("word/document.xml")
        root = ET.fromstring(document_xml)
        body = root.find("w:body", WORD_NS)
        if body is None:
            return [{"kind": "paragraph", "text": "El documento no contiene cuerpo legible."}]

        blocks: list[dict[str, object]] = []
        for child in body:
            if child.tag == f"{WORD_MAIN_NS}p":
                text = self._paragraph_text(child)
                if text:
                    blocks.append({"kind": "paragraph", "text": text})
            elif child.tag == f"{WORD_MAIN_NS}tbl":
                rows = self._table_rows(child)
                if rows:
                    blocks.append({"kind": "table", "rows": rows})
        return blocks or [{"kind": "paragraph", "text": "El documento no contiene texto extraíble."}]

    def _paragraph_text(self, paragraph: ET.Element) -> str:
        parts: list[str] = []
        for node in paragraph.iter():
            if node.tag == f"{WORD_MAIN_NS}t" and node.text:
                parts.append(node.text)
            elif node.tag == f"{WORD_MAIN_NS}tab":
                parts.append("    ")
            elif node.tag == f"{WORD_MAIN_NS}br":
                parts.append("\n")
        return "".join(parts).strip()

    def _table_rows(self, table: ET.Element) -> list[list[str]]:
        rows: list[list[str]] = []
        for row in table.findall("w:tr", WORD_NS):
            cells: list[str] = []
            for cell in row.findall("w:tc", WORD_NS):
                paragraphs = [self._paragraph_text(paragraph) for paragraph in cell.findall("w:p", WORD_NS)]
                cells.append("\n".join(text for text in paragraphs if text))
            if any(cells):
                rows.append(cells)
        return rows

    def _write_pdf(self, source_name: str, blocks: list[dict[str, object]], target_pdf_path: Path) -> None:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

        target_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        styles = getSampleStyleSheet()
        body_style = styles["BodyText"]
        body_style.fontName = "Helvetica"
        body_style.fontSize = 10
        body_style.leading = 14
        title_style = styles["Heading3"]
        title_style.textColor = colors.HexColor("#111827")

        story = [
            Paragraph(html.escape(source_name), title_style),
            Spacer(1, 6),
        ]
        for block in blocks:
            if block["kind"] == "paragraph":
                text = str(block.get("text") or "")
                for line in text.splitlines() or [""]:
                    if line.strip():
                        story.append(Paragraph(html.escape(line), body_style))
                    story.append(Spacer(1, 4))
            elif block["kind"] == "table":
                rows = block.get("rows")
                if not isinstance(rows, list):
                    continue
                table_data = [
                    [Paragraph(html.escape(str(cell)), body_style) for cell in row]
                    for row in rows
                    if isinstance(row, list)
                ]
                if not table_data:
                    continue
                table = Table(table_data, hAlign="LEFT", repeatRows=1)
                table.setStyle(
                    TableStyle(
                        [
                            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E7EB")),
                            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#FAFAFA")),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                story.extend([table, Spacer(1, 8)])

        document = SimpleDocTemplate(
            str(target_pdf_path),
            pagesize=A4,
            leftMargin=18 * mm,
            rightMargin=18 * mm,
            topMargin=16 * mm,
            bottomMargin=16 * mm,
            title=source_name,
        )
        document.build(story)


docx_fallback_preview_service = DocxFallbackPreviewService()
