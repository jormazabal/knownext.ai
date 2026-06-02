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
    zip.start_file("[Content_Types].xml", options).map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>"#).map_err(|error| error.to_string())?;
    zip.start_file("_rels/.rels", options).map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="word/document.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/></Relationships>"#).map_err(|error| error.to_string())?;
    zip.start_file("word/document.xml", options).map_err(|error| error.to_string())?;
    let body = markdown
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| format!("<w:p><w:r><w:t>{}</w:t></w:r></w:p>", xml_escape(line.trim_matches('#').trim())))
        .collect::<Vec<_>>()
        .join("");
    zip.write_all(format!(r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{}</w:body></w:document>"#, body).as_bytes()).map_err(|error| error.to_string())?;
    zip.finish().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn extract_plain_text(path: &Path) -> String {
    match path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "md" | "txt" => std::fs::read_to_string(path).unwrap_or_default(),
        "docx" | "xlsx" => extract_zip_xml_text(path),
        _ => String::new(),
    }
}

fn extract_zip_xml_text(path: &Path) -> String {
    let Ok(file) = std::fs::File::open(path) else { return String::new() };
    let Ok(mut archive) = zip::ZipArchive::new(file) else { return String::new() };
    let mut output = String::new();
    for index in 0..archive.len() {
        let Ok(mut entry) = archive.by_index(index) else { continue };
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
