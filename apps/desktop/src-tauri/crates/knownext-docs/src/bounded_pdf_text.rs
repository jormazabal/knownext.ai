//! Readonly PDF body extraction. No OCR, scripts, embedded attachments or external access.
use lopdf_reader::{Document, LoadOptions, Object, ObjectId};
use std::{
    cell::RefCell,
    time::{Duration, Instant},
};
const MAX_INPUT: usize = 8 * 1024 * 1024;
const LOAD_STREAM: usize = 64 * 1024;
const PAGE_CONTENT: usize = 512 * 1024;
pub fn read_pdf_text_bounded(path: &std::path::Path, maximum: usize) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|_| "No se puede abrir el PDF original")?;
    let before = file
        .metadata()
        .map_err(|_| "No se puede comprobar el PDF")?;
    if !before.is_file() || before.len() > MAX_INPUT as u64 {
        return Err("El PDF supera el límite local de8MiB; original conservado".into());
    }
    let mut bytes = Vec::new();
    file.take(MAX_INPUT as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "No se puede leer el PDF dentro del límite")?;
    let after = std::fs::metadata(path).map_err(|_| "El PDF dejó de estar disponible")?;
    if bytes.len() as u64 != before.len()
        || after.len() != before.len()
        || after.modified().ok() != before.modified().ok()
    {
        return Err("El PDF cambió durante la lectura; vuelve a revisarlo".into());
    }
    extract_pdf_text_bounded(&bytes, maximum)
}
pub fn extract_pdf_text_bounded(bytes: &[u8], maximum: usize) -> Result<String, String> {
    let pages = extract_pdf_pages_bounded(bytes, maximum)?;
    let text = pages
        .into_iter()
        .map(|(_, text)| text)
        .collect::<Vec<_>>()
        .join("\n\n");
    if text.len() > maximum {
        return Err("El texto PDF supera el presupuesto de contexto".into());
    }
    Ok(text)
}
struct Budget {
    started: Instant,
    objects: usize,
    object_streams: usize,
    exhausted: bool,
}
thread_local! {static PARSE:RefCell<Option<Budget>>=const{RefCell::new(None)};}
struct ParseLease;
impl Drop for ParseLease {
    fn drop(&mut self) {
        PARSE.with(|budget| *budget.borrow_mut() = None);
    }
}
fn filter(id: ObjectId, object: &mut Object) -> Option<(ObjectId, Object)> {
    PARSE.with(|state| {
        let mut state = state.borrow_mut();
        let budget = state.as_mut()?;
        budget.objects += 1;
        if object
            .as_stream()
            .is_ok_and(|stream| stream.dict.has_type(b"ObjStm"))
        {
            budget.object_streams += 1;
        }
        budget.exhausted |= budget.objects > 5000
            || budget.object_streams > 64
            || budget.started.elapsed() > Duration::from_secs(2);
        if budget.exhausted {
            None
        } else {
            Some((id, object.clone()))
        }
    })
}
pub fn extract_pdf_pages_bounded(
    bytes: &[u8],
    maximum: usize,
) -> Result<Vec<(usize, String)>, String> {
    if bytes.len() > MAX_INPUT
        || maximum == 0
        || maximum > 2 * 1024 * 1024
        || !bytes.starts_with(b"%PDF-")
    {
        return Err("PDF fuera del presupuesto de lectura o formato no reconocido".into());
    }
    if !PARSE.with(|state| {
        let mut state = state.borrow_mut();
        if state.is_some() {
            false
        } else {
            *state = Some(Budget {
                started: Instant::now(),
                objects: 0,
                object_streams: 0,
                exhausted: false,
            });
            true
        }
    }) {
        return Err("Ya hay una extracción PDF en esta tarea".into());
    }
    let _lease = ParseLease;
    let started = Instant::now();
    let document = Document::load_mem_with_options(
        bytes,
        LoadOptions {
            strict: true,
            max_decompressed_size: Some(LOAD_STREAM),
            filter: Some(filter),
            ..Default::default()
        },
    )
    .map_err(|_| "No se pudo revisar el PDF dentro de sus límites; original conservado")?;
    if PARSE.with(|state| {
        state
            .borrow()
            .as_ref()
            .is_none_or(|budget| budget.exhausted)
    }) || document.objects.len() > 5000
    {
        return Err("El PDF supera el presupuesto de objetos o tiempo; original conservado".into());
    }
    if document.was_encrypted() {
        return Err("PDF protegido: no se ha extraído texto ni solicitado contraseña".into());
    }
    let pages = document.page_iter().take(201).collect::<Vec<_>>();
    if pages.is_empty() || pages.len() > 200 {
        return Err("El PDF no tiene páginas revisables o supera200 páginas".into());
    }
    let mut output = Vec::new();
    let mut total = 0usize;
    for (index, _) in pages.iter().enumerate() {
        if started.elapsed() > Duration::from_secs(5) {
            return Err(
                "La extracción PDF agotó su tiempo de revisión; original conservado".into(),
            );
        }
        let text = document
            .extract_text_with_limit(&[(index + 1) as u32], PAGE_CONTENT)
            .map_err(|_| {
                "Texto PDF no legible o fuera del presupuesto de página; no se ha ejecutado OCR"
            })?;
        total = total.saturating_add(text.len());
        if total > maximum {
            return Err(
                "El texto PDF supera el presupuesto del índice; original conservado".into(),
            );
        }
        output.push((index + 1, text));
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf_reader::{dictionary, Stream};
    fn pdf(contents: Vec<Vec<u8>>) -> Vec<u8> {
        let mut doc = Document::with_version("1.4");
        let pages = doc.new_object_id();
        let font=doc.add_object(dictionary!{"Type"=>"Font","Subtype"=>"Type1","BaseFont"=>"Helvetica","Encoding"=>"WinAnsiEncoding"});
        let resources = doc.add_object(dictionary! {"Font"=>dictionary!{"F1"=>font}});
        let kids:Vec<Object>=contents.into_iter().map(|content|{
            let stream=doc.add_object(Stream::new(dictionary!{},content));doc.add_object(dictionary!{"Type"=>"Page","Parent"=>pages,"Resources"=>resources,"Contents"=>stream,"MediaBox"=>vec![0.into(),0.into(),595.into(),842.into()]}).into()
        }).collect();
        let count = kids.len() as i64;
        doc.objects.insert(
            pages,
            dictionary! {"Type"=>"Pages","Kids"=>kids,"Count"=>count}.into(),
        );
        let catalog = doc.add_object(dictionary! {"Type"=>"Catalog","Pages"=>pages});
        doc.trailer.set("Root", catalog);
        let info =
            doc.add_object(dictionary! {"Title"=>Object::string_literal("metadata-only-canary")});
        doc.trailer.set("Info", info);
        let mut bytes = Vec::new();
        doc.save_to(&mut bytes).unwrap();
        bytes
    }
    #[test]
    fn pdf_body_text_keeps_page_numbers_accents_and_excludes_metadata() {
        let bytes = pdf(vec![
            b"BT /F1 12 Tf (Acuerdo de dise\xF1o y revisi\xF3n) Tj ET".to_vec(),
            b"BT /F1 12 Tf (Second page decision) Tj ET".to_vec(),
        ]);
        let extracted = extract_pdf_pages_bounded(&bytes, 1024).unwrap();
        assert_eq!(extracted.len(), 2);
        assert_eq!(extracted[0].0, 1);
        assert!(extracted[0].1.contains("diseño y revisión"));
        assert_eq!(extracted[1].0, 2);
        assert!(extracted[1].1.contains("Second page"));
        assert!(!format!("{extracted:?}").contains("metadata-only-canary"));
        assert!(extract_pdf_pages_bounded(&bytes, 5).is_err());
    }
    #[test]
    fn compressed_page_and_object_streams_cannot_bypass_decode_limits() {
        let bytes = pdf(vec![vec![b' '; PAGE_CONTENT + 1]]);
        let mut doc = Document::load_mem(&bytes).unwrap();
        let page = doc.get_pages()[&1];
        let content = doc.get_page_contents(page)[0];
        doc.get_object_mut(content)
            .unwrap()
            .as_stream_mut()
            .unwrap()
            .compress()
            .unwrap();
        let mut compressed = Vec::new();
        doc.save_to(&mut compressed).unwrap();
        assert!(compressed.len() < 32 * 1024);
        assert!(extract_pdf_pages_bounded(&compressed, 1024).is_err());
        let mut object_stream = Stream::new(
            dictionary! {"Type"=>"ObjStm","N"=>1,"First"=>4},
            [b"9 0 ".as_slice(), &vec![b' '; LOAD_STREAM + 1]].concat(),
        );
        object_stream.compress().unwrap();
        doc.add_object(object_stream);
        let mut with_objects = Vec::new();
        doc.save_to(&mut with_objects).unwrap();
        assert!(extract_pdf_pages_bounded(&with_objects, 1024).is_err());
    }
    #[test]
    fn unreadable_empty_and_excessive_page_inputs_are_explicit() {
        assert!(extract_pdf_pages_bounded(b"%PDF-1.7 damaged", 1024).is_err());
        assert!(extract_pdf_pages_bounded(b"not pdf", 1024).is_err());
        let empty = pdf(vec![vec![]]);
        assert!(extract_pdf_pages_bounded(&empty, 1024).unwrap()[0]
            .1
            .trim()
            .is_empty());
        let many = pdf(vec![vec![]; 201]);
        assert!(extract_pdf_pages_bounded(&many, 1024).is_err());
        let good = pdf(vec![
            b"BT /F1 12 Tf (Still available after a rejection) Tj ET".to_vec(),
        ]);
        assert!(extract_pdf_pages_bounded(&good, 1024).unwrap()[0]
            .1
            .contains("Still available"));
    }
}
