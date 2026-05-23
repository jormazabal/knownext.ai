from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import zipfile
from posixpath import normpath
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from app.schemas.document_preview import SpreadsheetCell, SpreadsheetSheetResponse, SpreadsheetSheetSummary


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"x": MAIN_NS, "r": REL_NS, "pr": PKG_REL_NS}


class SpreadsheetPreviewService:
    def read_workbook(self, xlsx_path: Path, preview_id: str) -> dict[str, Any]:
        try:
            with zipfile.ZipFile(xlsx_path) as package:
                if "xl/workbook.xml" not in package.namelist():
                    raise HTTPException(status_code=422, detail={"code": "unsupported_workbook", "message": "El XLSX no contiene un libro válido."})
                shared_strings = self._read_shared_strings(package)
                relationships = self._read_workbook_relationships(package)
                workbook = ET.fromstring(package.read("xl/workbook.xml"))
                sheets: list[SpreadsheetSheetSummary] = []
                sheet_payloads: dict[str, SpreadsheetSheetResponse] = {}

                for index, sheet_node in enumerate(workbook.findall("x:sheets/x:sheet", NS), start=1):
                    name = sheet_node.attrib.get("name", f"Hoja {index}")
                    sheet_id = f"sheet-{sheet_node.attrib.get('sheetId', index)}"
                    relation_id = sheet_node.attrib.get(f"{{{REL_NS}}}id", "")
                    target = relationships.get(relation_id)
                    hidden = sheet_node.attrib.get("state") in {"hidden", "veryHidden"}
                    if not target:
                        continue
                    sheet_xml_path = resolve_workbook_relation_target(target)
                    if sheet_xml_path not in package.namelist():
                        continue
                    sheet = self._read_sheet(package.read(sheet_xml_path), preview_id, sheet_id, name, shared_strings)
                    sheets.append(SpreadsheetSheetSummary(id=sheet_id, name=name, rowCount=sheet.rowCount, columnCount=sheet.columnCount, hidden=hidden))
                    sheet_payloads[sheet_id] = sheet

                return {"sheets": sheets, "sheet_payloads": sheet_payloads}
        except zipfile.BadZipFile as error:
            raise HTTPException(status_code=422, detail={"code": "unsupported_workbook", "message": "El archivo XLSX está dañado o no es compatible."}) from error

    def _read_shared_strings(self, package: zipfile.ZipFile) -> list[str]:
        if "xl/sharedStrings.xml" not in package.namelist():
            return []
        root = ET.fromstring(package.read("xl/sharedStrings.xml"))
        values: list[str] = []
        for item in root.findall("x:si", NS):
            texts = [node.text or "" for node in item.findall(".//x:t", NS)]
            values.append("".join(texts))
        return values

    def _read_workbook_relationships(self, package: zipfile.ZipFile) -> dict[str, str]:
        relationships_path = "xl/_rels/workbook.xml.rels"
        if relationships_path not in package.namelist():
            return {}
        root = ET.fromstring(package.read(relationships_path))
        result: dict[str, str] = {}
        for relation in root.findall("pr:Relationship", NS):
            relation_id = relation.attrib.get("Id")
            target = relation.attrib.get("Target")
            if relation_id and target:
                result[relation_id] = target
        return result

    def _read_sheet(self, sheet_xml: bytes, preview_id: str, sheet_id: str, name: str, shared_strings: list[str]) -> SpreadsheetSheetResponse:
        root = ET.fromstring(sheet_xml)
        cells: list[SpreadsheetCell] = []
        max_row = 0
        max_column = 0
        for cell_node in root.findall(".//x:sheetData/x:row/x:c", NS):
            address = cell_node.attrib.get("r", "")
            row_number, column_number = parse_cell_address(address)
            if row_number <= 0 or column_number <= 0:
                continue
            value_node = cell_node.find("x:v", NS)
            formula_node = cell_node.find("x:f", NS)
            inline_string_node = cell_node.find("x:is", NS)
            raw_value = value_node.text if value_node is not None else None
            value = normalize_cell_value(raw_value, cell_node.attrib.get("t"), shared_strings, inline_string_node)
            max_row = max(max_row, row_number)
            max_column = max(max_column, column_number)
            cells.append(
                SpreadsheetCell(
                    row=row_number,
                    column=column_number,
                    address=address,
                    value=value,
                    displayValue="" if value is None else str(value),
                    formula=formula_node.text if formula_node is not None else None,
                )
            )
        return SpreadsheetSheetResponse(previewId=preview_id, sheetId=sheet_id, name=name, rowCount=max_row, columnCount=max_column, cells=cells)


def parse_cell_address(address: str) -> tuple[int, int]:
    match = re.match(r"^([A-Z]+)(\d+)$", address.upper())
    if not match:
        return 0, 0
    column_letters, row = match.groups()
    column = 0
    for char in column_letters:
        column = column * 26 + (ord(char) - 64)
    return int(row), column


def resolve_workbook_relation_target(target: str) -> str:
    normalized = normpath(target.replace("\\", "/"))
    if normalized.startswith("/"):
        return normalized.lstrip("/")
    if normalized.startswith("xl/"):
        return normalized
    return normpath(f"xl/{normalized}")


def normalize_cell_value(raw_value: str | None, cell_type: str | None, shared_strings: list[str], inline_string_node: ET.Element | None = None) -> str | int | float | bool | None:
    if cell_type == "inlineStr" and inline_string_node is not None:
        return "".join(node.text or "" for node in inline_string_node.findall(".//x:t", NS))
    if raw_value is None:
        return None
    if cell_type == "s":
        try:
            return shared_strings[int(raw_value)]
        except (ValueError, IndexError):
            return raw_value
    if cell_type == "b":
        return raw_value == "1"
    try:
        number = float(raw_value)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw_value


spreadsheet_preview_service = SpreadsheetPreviewService()
