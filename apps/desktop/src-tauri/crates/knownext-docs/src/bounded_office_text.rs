//! Local index extraction. Never extract ZIP entries to the filesystem.
use std::io::{Cursor, Read};
use std::time::{Duration, Instant};

pub fn extract_office_text_bounded(bytes: &[u8], maximum: usize) -> Result<String, String> {
    extract(bytes, maximum, false)
}

/// Searchable document bodies only: settings, properties and relationship metadata are not content.
pub fn extract_office_body_text_bounded(bytes: &[u8], maximum: usize) -> Result<String, String> {
    extract(bytes, maximum, true)
}

fn extract(bytes: &[u8], maximum: usize, body_only: bool) -> Result<String, String> {
    if bytes.len() > 8 * 1024 * 1024 || maximum > 16 * 1024 * 1024 {
        return Err("El documento supera el presupuesto de lectura del índice".into());
    }
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| "El documento Office no contiene un paquete legible")?;
    if archive.len() > 4096 {
        return Err("El documento Office contiene demasiadas entradas para el índice".into());
    }
    let started = Instant::now();
    let mut read_bytes = 0usize;
    let mut output = String::new();
    for index in 0..archive.len() {
        if started.elapsed() > Duration::from_secs(5) {
            return Err("La extracción Office ha alcanzado su límite de tiempo".into());
        }
        let mut entry = archive
            .by_index(index)
            .map_err(|_| "Entrada Office no legible")?;
        if entry.is_dir() || !entry.name().ends_with(".xml") {
            continue;
        }
        if body_only
            && !matches!(
                entry.name(),
                "word/document.xml"
                    | "word/footnotes.xml"
                    | "word/endnotes.xml"
                    | "xl/sharedStrings.xml"
            )
            && !(entry.name().starts_with("word/header")
                || entry.name().starts_with("word/footer")
                || entry.name().starts_with("xl/worksheets/sheet"))
        {
            continue;
        }
        let remaining = maximum.saturating_sub(read_bytes);
        if entry.size() > remaining as u64 {
            return Err("El texto descomprimido supera el presupuesto del índice".into());
        }
        let mut text = String::new();
        (&mut entry)
            .take(remaining as u64 + 1)
            .read_to_string(&mut text)
            .map_err(|_| "No se pudo leer todo el XML Office como UTF-8")?;
        if text.len() > remaining {
            return Err("El texto descomprimido supera el presupuesto del índice".into());
        }
        read_bytes += text.len();
        let plain = if body_only {
            let document = roxmltree::Document::parse(&text)
                .map_err(|_| "El contenido Office no contiene XML compatible")?;
            document
                .descendants()
                .filter(|node| node.is_text())
                .filter_map(|node| node.text())
                .collect::<Vec<_>>()
                .join(" ")
        } else {
            super::strip_xml(&text)
        };
        if output.len().saturating_add(plain.len()).saturating_add(1) > maximum {
            return Err("El texto extraído supera el presupuesto del índice".into());
        }
        output.push_str(&plain);
        output.push('\n');
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn package(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for (name, text) in entries {
            writer
                .start_file(
                    *name,
                    zip::write::SimpleFileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated),
                )
                .unwrap();
            writer.write_all(text.as_bytes()).unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    #[test]
    fn rejects_expansion_and_combined_xml_budget_before_returning_partial_text() {
        let bytes = package(&[("word/document.xml", &"x".repeat(100_000))]);
        assert!(bytes.len() < 1000);
        assert!(extract_office_text_bounded(&bytes, 1024)
            .unwrap_err()
            .contains("descomprimido"));
        let bytes = package(&[("a.xml", "12345"), ("b.xml", "67890")]);
        assert!(extract_office_text_bounded(&bytes, 8).is_err());
        let bytes = package(&[
            ("word/document.xml", "<p>Acuerdo de producto</p>"),
            ("image.bin", "ignored"),
        ]);
        assert_eq!(
            extract_office_text_bounded(&bytes, 256).unwrap().trim(),
            "Acuerdo de producto"
        );
    }
}
