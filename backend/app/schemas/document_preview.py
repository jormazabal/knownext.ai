from typing import Literal

from pydantic import BaseModel

from app.schemas.document import DocumentFingerprint


PreviewFormat = Literal["pdf", "docx", "xlsx"]
PreviewStatus = Literal["queued", "processing", "ready", "error", "unsupported", "protected", "stale"]
PreviewRendition = Literal["pdf", "text", "workbook", "thumbnails"]
PreviewMode = Literal["document", "spreadsheet"]


class DocumentPreviewRequest(BaseModel):
    path: str
    preferredMode: PreviewMode | None = None


class SpreadsheetSheetSummary(BaseModel):
    id: str
    name: str
    rowCount: int
    columnCount: int
    hidden: bool = False


class DocumentPreview(BaseModel):
    id: str
    projectId: str
    path: str
    name: str
    format: PreviewFormat
    status: PreviewStatus
    readonly: bool = True
    sourceFingerprint: DocumentFingerprint
    availableRenditions: list[PreviewRendition]
    pageCount: int | None = None
    sheets: list[SpreadsheetSheetSummary] | None = None
    warnings: list[str] = []
    generatedAt: str | None = None
    error: str | None = None


class DocumentPreviewTextResponse(BaseModel):
    previewId: str
    text: str
    searchable: bool
    warnings: list[str] = []


class SpreadsheetCell(BaseModel):
    row: int
    column: int
    address: str
    value: str | int | float | bool | None = None
    displayValue: str | None = None
    formula: str | None = None


class SpreadsheetSheetResponse(BaseModel):
    previewId: str
    sheetId: str
    name: str
    rowCount: int
    columnCount: int
    cells: list[SpreadsheetCell]
    warnings: list[str] = []


class SpreadsheetSheetsResponse(BaseModel):
    previewId: str
    sheets: list[SpreadsheetSheetSummary]
