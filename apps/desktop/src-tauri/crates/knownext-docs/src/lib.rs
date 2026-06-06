use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;

pub fn minimal_pdf(title: &str, markdown: &str) -> Vec<u8> {
    let text = markdown
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(title)
        .replace(['(', ')', '\\'], " ");
    format!(
        "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length {} >>\nstream\nBT /F1 16 Tf 72 760 Td ({}) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
        text.len() + 34,
        text
    )
    .into_bytes()
}

pub fn write_docx(path: &Path, markdown: &str) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|error| error.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("[Content_Types].xml", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#).map_err(|error| error.to_string())?;
    zip.start_file("_rels/.rels", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="word/document.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/></Relationships>"#).map_err(|error| error.to_string())?;
    zip.start_file("word/document.xml", options)
        .map_err(|error| error.to_string())?;
    let body = markdown
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            format!(
                "<w:p><w:r><w:t>{}</w:t></w:r></w:p>",
                xml_escape(line.trim_matches('#').trim())
            )
        })
        .collect::<Vec<_>>()
        .join("");
    zip.write_all(format!(r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{}</w:body></w:document>"#, body).as_bytes()).map_err(|error| error.to_string())?;
    zip.finish().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn write_xlsx(path: &Path, sheet_name: &str, rows: &[Vec<String>]) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|error| error.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("[Content_Types].xml", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>"#).map_err(|error| error.to_string())?;
    zip.start_file("_rels/.rels", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="xl/workbook.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/></Relationships>"#).map_err(|error| error.to_string())?;
    zip.start_file("xl/_rels/workbook.xml.rels", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>"#).map_err(|error| error.to_string())?;
    zip.start_file("xl/workbook.xml", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(format!(r#"<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{}" sheetId="1" r:id="rId1"/></sheets></workbook>"#, xml_escape(sheet_name)).as_bytes()).map_err(|error| error.to_string())?;
    zip.start_file("xl/worksheets/sheet1.xml", options)
        .map_err(|error| error.to_string())?;
    let mut sheet_data = String::new();
    for (row_index, row) in rows.iter().enumerate() {
        let row_number = row_index + 1;
        sheet_data.push_str(&format!(r#"<row r="{row_number}">"#));
        for (column_index, value) in row.iter().enumerate() {
            let address = format!(
                "{}{}",
                spreadsheet_column_name(column_index + 1),
                row_number
            );
            sheet_data.push_str(&format!(
                r#"<c r="{address}" t="inlineStr"><is><t>{}</t></is></c>"#,
                xml_escape(value)
            ));
        }
        sheet_data.push_str("</row>");
    }
    zip.write_all(format!(r#"<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{sheet_data}</sheetData></worksheet>"#).as_bytes()).map_err(|error| error.to_string())?;
    zip.finish().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn extract_plain_text(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "md" | "txt" => std::fs::read_to_string(path).unwrap_or_default(),
        "docx" | "xlsx" => extract_zip_xml_text(path),
        _ => String::new(),
    }
}

pub fn xlsx_sheet_summaries(path: &Path) -> Vec<Value> {
    let Some(package) = XlsxPackage::open(path) else {
        return Vec::new();
    };
    package
        .sheets
        .iter()
        .map(|sheet| {
            let (row_count, column_count) = package.sheet_dimensions(&sheet.path);
            json!({
                "id": sheet.id,
                "name": sheet.name,
                "rowCount": row_count,
                "columnCount": column_count,
                "hidden": sheet.hidden
            })
        })
        .collect()
}

pub fn xlsx_sheet(path: &Path, sheet_id: &str) -> Option<Value> {
    let package = XlsxPackage::open(path)?;
    let sheet = package
        .sheets
        .iter()
        .find(|sheet| sheet.id == sheet_id || sheet.name == sheet_id)?;
    let cells = package.sheet_cells(&sheet.path);
    let row_count = cells
        .iter()
        .filter_map(|cell| cell.get("row").and_then(Value::as_u64))
        .max()
        .unwrap_or(0);
    let column_count = cells
        .iter()
        .filter_map(|cell| cell.get("column").and_then(Value::as_u64))
        .max()
        .unwrap_or(0);
    Some(json!({
        "sheetId": sheet.id,
        "name": sheet.name,
        "rowCount": row_count,
        "columnCount": column_count,
        "cells": cells,
        "warnings": []
    }))
}

#[derive(Clone)]
struct XlsxSheet {
    id: String,
    name: String,
    path: String,
    hidden: bool,
}

struct XlsxPackage {
    xml: BTreeMap<String, String>,
    sheets: Vec<XlsxSheet>,
    shared_strings: Vec<String>,
}

impl XlsxPackage {
    fn open(path: &Path) -> Option<Self> {
        let file = std::fs::File::open(path).ok()?;
        let mut archive = zip::ZipArchive::new(file).ok()?;
        let mut xml = BTreeMap::new();
        for index in 0..archive.len() {
            let mut entry = archive.by_index(index).ok()?;
            let name = entry
                .name()
                .replace('\\', "/")
                .trim_start_matches('/')
                .to_string();
            if !(name.ends_with(".xml") || name.ends_with(".rels")) {
                continue;
            }
            let mut text = String::new();
            if std::io::Read::read_to_string(&mut entry, &mut text).is_ok() {
                xml.insert(name, text);
            }
        }
        let relationships = workbook_relationships(xml.get("xl/_rels/workbook.xml.rels")?);
        let sheets = workbook_sheets(xml.get("xl/workbook.xml")?, &relationships);
        let shared_strings = xml
            .get("xl/sharedStrings.xml")
            .map(|text| shared_strings(text))
            .unwrap_or_default();
        Some(Self {
            xml,
            sheets,
            shared_strings,
        })
    }

    fn sheet_dimensions(&self, sheet_path: &str) -> (u64, u64) {
        let cells = self.sheet_cells(sheet_path);
        let row_count = cells
            .iter()
            .filter_map(|cell| cell.get("row").and_then(Value::as_u64))
            .max()
            .unwrap_or(0);
        let column_count = cells
            .iter()
            .filter_map(|cell| cell.get("column").and_then(Value::as_u64))
            .max()
            .unwrap_or(0);
        (row_count, column_count)
    }

    fn sheet_cells(&self, sheet_path: &str) -> Vec<Value> {
        let Some(xml) = self.xml.get(sheet_path) else {
            return Vec::new();
        };
        let Ok(document) = roxmltree::Document::parse(xml) else {
            return Vec::new();
        };
        let mut cells = Vec::new();
        for node in document
            .descendants()
            .filter(|node| node.is_element() && node.tag_name().name() == "c")
        {
            let address = node.attribute("r").unwrap_or("");
            let row = spreadsheet_row(address)
                .or_else(|| {
                    node.parent()
                        .and_then(|row| row.attribute("r"))
                        .and_then(|value| value.parse::<u64>().ok())
                })
                .unwrap_or(0);
            let column = spreadsheet_column(address).unwrap_or(0);
            if row == 0 || column == 0 {
                continue;
            }
            let raw = first_child_text(node, "v").unwrap_or_default();
            let formula = first_child_text(node, "f");
            let display = match node.attribute("t").unwrap_or("") {
                "s" => raw
                    .parse::<usize>()
                    .ok()
                    .and_then(|index| self.shared_strings.get(index).cloned())
                    .unwrap_or_default(),
                "b" => {
                    if raw == "1" {
                        "TRUE".to_string()
                    } else {
                        "FALSE".to_string()
                    }
                }
                "inlineStr" => collect_descendant_text(node, "t"),
                _ => raw.clone(),
            };
            let value = match node.attribute("t").unwrap_or("") {
                "b" => Value::Bool(raw == "1"),
                "s" | "inlineStr" | "str" => Value::from(display.clone()),
                _ => raw
                    .parse::<f64>()
                    .map(Value::from)
                    .unwrap_or_else(|_| Value::from(display.clone())),
            };
            cells.push(json!({
                "row": row,
                "column": column,
                "address": if address.is_empty() { format!("{}{}", spreadsheet_column_name(column as usize), row) } else { address.to_string() },
                "value": value,
                "displayValue": display,
                "formula": formula
            }));
        }
        cells
    }
}

fn workbook_relationships(xml: &str) -> BTreeMap<String, String> {
    let Ok(document) = roxmltree::Document::parse(xml) else {
        return BTreeMap::new();
    };
    let mut relationships = BTreeMap::new();
    for node in document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "Relationship")
    {
        let Some(id) = node.attribute("Id") else {
            continue;
        };
        let Some(target) = node.attribute("Target") else {
            continue;
        };
        let path = if target.starts_with('/') {
            target.trim_start_matches('/').to_string()
        } else {
            format!("xl/{target}")
        };
        relationships.insert(id.to_string(), normalize_zip_path(&path));
    }
    relationships
}

fn workbook_sheets(xml: &str, relationships: &BTreeMap<String, String>) -> Vec<XlsxSheet> {
    let Ok(document) = roxmltree::Document::parse(xml) else {
        return Vec::new();
    };
    document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "sheet")
        .enumerate()
        .filter_map(|(index, node)| {
            let name = node.attribute("name").unwrap_or("Hoja").to_string();
            let sheet_id = node
                .attribute("sheetId")
                .map(str::to_string)
                .unwrap_or_else(|| (index + 1).to_string());
            let relationship_id = node
                .attribute((
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                    "id",
                ))
                .or_else(|| node.attribute("r:id"))?;
            let path = relationships.get(relationship_id)?.to_string();
            let state = node.attribute("state").unwrap_or("");
            Some(XlsxSheet {
                id: format!("sheet-{sheet_id}"),
                name,
                path,
                hidden: state == "hidden" || state == "veryHidden",
            })
        })
        .collect()
}

fn shared_strings(xml: &str) -> Vec<String> {
    let Ok(document) = roxmltree::Document::parse(xml) else {
        return Vec::new();
    };
    document
        .descendants()
        .filter(|node| node.is_element() && node.tag_name().name() == "si")
        .map(|node| collect_descendant_text(node, "t"))
        .collect()
}

fn first_child_text(node: roxmltree::Node<'_, '_>, tag_name: &str) -> Option<String> {
    node.children()
        .find(|child| child.is_element() && child.tag_name().name() == tag_name)
        .and_then(|child| child.text())
        .map(str::to_string)
}

fn collect_descendant_text(node: roxmltree::Node<'_, '_>, tag_name: &str) -> String {
    node.descendants()
        .filter(|child| child.is_element() && child.tag_name().name() == tag_name)
        .filter_map(|child| child.text())
        .collect::<Vec<_>>()
        .join("")
}

fn normalize_zip_path(path: &str) -> String {
    let mut parts = Vec::new();
    let normalized = path.replace('\\', "/");
    for part in normalized.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                let _ = parts.pop();
            }
            value => parts.push(value),
        }
    }
    parts.join("/")
}

fn spreadsheet_row(address: &str) -> Option<u64> {
    let digits = address
        .chars()
        .filter(|ch| ch.is_ascii_digit())
        .collect::<String>();
    digits.parse::<u64>().ok()
}

fn spreadsheet_column(address: &str) -> Option<u64> {
    let letters = address
        .chars()
        .take_while(|ch| ch.is_ascii_alphabetic())
        .collect::<String>();
    if letters.is_empty() {
        return None;
    }
    let mut value = 0u64;
    for ch in letters.chars() {
        value = value * 26 + (ch.to_ascii_uppercase() as u8 - b'A' + 1) as u64;
    }
    Some(value)
}

fn spreadsheet_column_name(mut column: usize) -> String {
    let mut name = String::new();
    while column > 0 {
        let rem = (column - 1) % 26;
        name.insert(0, (b'A' + rem as u8) as char);
        column = (column - 1) / 26;
    }
    name
}

fn extract_zip_xml_text(path: &Path) -> String {
    let Ok(file) = std::fs::File::open(path) else {
        return String::new();
    };
    let Ok(mut archive) = zip::ZipArchive::new(file) else {
        return String::new();
    };
    let mut output = String::new();
    for index in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(index) else {
            continue;
        };
        if !entry.name().ends_with(".xml") {
            continue;
        }
        let mut text = String::new();
        if std::io::Read::read_to_string(&mut entry, &mut text).is_ok() {
            output.push_str(&strip_xml(&text));
            output.push('\n');
        }
    }
    output
}

fn strip_xml(value: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                output.push(' ');
            }
            _ if !in_tag => output.push(ch),
            _ => {}
        }
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}
