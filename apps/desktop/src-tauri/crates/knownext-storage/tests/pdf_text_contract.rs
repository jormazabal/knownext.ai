use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
fn call(api: &LocalApi, method: &str, path: &str, body: Value) -> Value {
    let response = api.handle(method, path, body, vec![]).unwrap();
    assert_eq!(response.status, 200, "{}", response.body);
    response.body
}
fn pdf(second: &str) -> Vec<u8> {
    let first = "BT /F1 12 Tf (First page text) Tj ET";
    let second = format!("BT /F1 12 Tf ({second}) Tj ET");
    let objects=vec!["<< /Type /Catalog /Pages 2 0 R >>".into(),"<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>".into(),"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>".into(),"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >>".into(),format!("<< /Length {} >>\nstream\n{first}\nendstream",first.len()),"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /MediaBox [0 0 595 842] /Contents 7 0 R >>".into(),format!("<< /Length {} >>\nstream\n{second}\nendstream",second.len()),"<< /Title (metadata-only-canary) >>".into()];
    let mut bytes = b"%PDF-1.4\n".to_vec();
    let mut offsets = vec![0usize];
    for (index, object) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n{object}\nendobj\n", index + 1).as_bytes());
    }
    let at = bytes.len();
    bytes.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len()).as_bytes());
    for offset in offsets.iter().skip(1) {
        bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    bytes.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R /Info 8 0 R >>\nstartxref\n{at}\n%%EOF\n",
            offsets.len()
        )
        .as_bytes(),
    );
    bytes
}
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let owned = tempfile::tempdir().unwrap();
    let api = LocalApi::new(owned.path().join("state"), "qa".into(), "test".into());
    let project = call(
        &api,
        "POST",
        "/api/projects",
        json!({"name":"Owned PDF corpus","versioningMode":"none","syncMode":"none"}),
    );
    let root = PathBuf::from(project["folderPath"].as_str().unwrap());
    (owned, api, project["id"].as_str().unwrap().into(), root)
}
#[test]
fn pdf_search_is_page_scoped_fresh_and_does_not_expose_metadata_or_modify_sources() {
    let (_owned, api, project, root) = fixture();
    let original = pdf("Acuerdo documental");
    fs::write(root.join("Reference.pdf"), &original).unwrap();
    fs::write(root.join("Bad.pdf"), b"%PDF-1.4 Acuerdo invisible").unwrap();
    let route = format!("/api/projects/{project}/search/content");
    let first = call(&api, "POST", &route, json!({"query":"Acuerdo"}));
    assert_eq!(first["results"].as_array().unwrap().len(), 1);
    let found = &first["results"][0];
    assert_eq!(found["kind"], "attachment");
    assert_eq!(found["pageNumber"], 2);
    assert!(found.get("pageId").is_none());
    assert_eq!(found["path"], "Reference.pdf");
    assert_eq!(fs::read(root.join("Reference.pdf")).unwrap(), original);
    let warm = call(&api, "POST", &route, json!({"query":"Acuerdo"}));
    assert_eq!(warm["index"]["updatedDocuments"], 0);
    assert_eq!(warm["index"]["reusedDocuments"], 2);
    assert!(call(
        &api,
        "POST",
        &route,
        json!({"query":"metadata-only-canary"})
    )["results"]
        .as_array()
        .unwrap()
        .is_empty());
    fs::write(root.join("Reference.pdf"), pdf("Cambio documental")).unwrap();
    assert!(
        call(&api, "POST", &route, json!({"query":"Acuerdo"}))["results"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        fs::read(root.join("Bad.pdf")).unwrap(),
        b"%PDF-1.4 Acuerdo invisible"
    );
}
#[test]
fn pdf_text_preview_and_explicit_ai_context_share_bounded_extraction_without_provider_calls() {
    let (_owned, api, project, root) = fixture();
    let bytes = pdf("Acuerdo documental");
    fs::write(root.join("Reference.pdf"), &bytes).unwrap();
    let preview = call(
        &api,
        "POST",
        &format!("/api/projects/{project}/previews"),
        json!({"path":"Reference.pdf","preferredMode":"document"}),
    );
    let text = call(
        &api,
        "GET",
        &format!(
            "/api/projects/{project}/previews/{}/text",
            preview["id"].as_str().unwrap()
        ),
        Value::Null,
    );
    assert_eq!(text["searchable"], true);
    assert!(text["text"]
        .as_str()
        .unwrap()
        .contains("Acuerdo documental"));
    assert!(!text["text"]
        .as_str()
        .unwrap()
        .contains("metadata-only-canary"));
    let context = call(
        &api,
        "POST",
        &format!("/api/projects/{project}/ai/context/project-attachments"),
        json!({"attachmentId":format!("{project}::Reference.pdf")}),
    );
    let source = &context;
    assert_eq!(source["status"], "ready");
    assert!(source.get("text").is_none());
    let source_preview = call(
        &api,
        "GET",
        &format!("/api/projects/{project}/ai/context/sources/{project}::Reference.pdf/preview"),
        Value::Null,
    );
    assert!(source_preview["previewText"]
        .as_str()
        .unwrap()
        .contains("Acuerdo documental"));
    fs::write(root.join("Bad.pdf"), b"%PDF-1.4 damaged").unwrap();
    let context = call(
        &api,
        "POST",
        &format!("/api/projects/{project}/ai/context/project-attachments"),
        json!({"attachmentId":format!("{project}::Bad.pdf")}),
    );
    let bad = &context;
    assert_eq!(bad["status"], "error");
    assert!(bad.get("text").is_none());
    assert!(!bad["warning"].is_null());
    assert_eq!(fs::read(root.join("Reference.pdf")).unwrap(), bytes);
}

#[test]
fn uploaded_pdf_context_uses_body_text_and_reports_unreadable_input_without_inventing_ocr() {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use knownext_storage::LocalApiFile;
    let (_owned, api, project, _root) = fixture();
    let bytes = pdf("Acuerdo adjunto");
    let uploaded = api
        .handle(
            "POST",
            &format!("/api/projects/{project}/ai/context/files"),
            Value::Null,
            vec![
                LocalApiFile {
                    field_name: "files".into(),
                    name: "Uploaded.PDF".into(),
                    mime_type: Some("application/pdf".into()),
                    data_base64: STANDARD.encode(&bytes),
                },
                LocalApiFile {
                    field_name: "files".into(),
                    name: "Unreadable.pdf".into(),
                    mime_type: Some("application/pdf".into()),
                    data_base64: STANDARD.encode(b"%PDF-1.4 damaged"),
                },
            ],
        )
        .unwrap();
    assert_eq!(uploaded.status, 200);
    let sources = uploaded.body["sources"].as_array().unwrap();
    let good = sources
        .iter()
        .find(|source| source["name"] == "Uploaded.PDF")
        .unwrap();
    assert_eq!(good["status"], "ready");
    assert!(good.get("text").is_none());
    let preview = call(
        &api,
        "GET",
        &format!(
            "/api/projects/{project}/ai/context/sources/{}/preview",
            good["id"].as_str().unwrap()
        ),
        Value::Null,
    );
    assert!(preview["previewText"]
        .as_str()
        .unwrap()
        .contains("Acuerdo adjunto"));
    assert!(!preview["previewText"]
        .as_str()
        .unwrap()
        .contains("metadata-only-canary"));
    let bad = sources
        .iter()
        .find(|source| source["name"] == "Unreadable.pdf")
        .unwrap();
    assert_eq!(bad["status"], "error");
    assert!(!bad["warning"].is_null());
}
