//! Synthetic saved-file corpus. Heavy campaign is opt-in and emits metadata only.
use knownext_storage::LocalApi;
use serde_json::{json, Value};
use std::{fs, path::PathBuf, time::Instant};
fn fixture() -> (tempfile::TempDir, LocalApi, String, PathBuf) {
    let d = tempfile::tempdir().unwrap();
    let a = LocalApi::new(d.path().join("state"), "qa".into(), "corpus".into());
    let p = a
        .handle(
            "POST",
            "/api/projects",
            json!({"name":"Synthetic corpus","versioningMode":"none","syncMode":"none"}),
            vec![],
        )
        .unwrap();
    assert_eq!(p.status, 200);
    let id = p.body["id"].as_str().unwrap().to_owned();
    let root = PathBuf::from(p.body["folderPath"].as_str().unwrap());
    (d, a, id, root)
}
fn search(a: &LocalApi, p: &str, q: &str) -> Value {
    let v = a
        .handle(
            "POST",
            &format!("/api/projects/{p}/search/content"),
            json!({"query":q}),
            vec![],
        )
        .unwrap();
    assert_eq!(v.status, 200, "{}", v.body);
    v.body
}
#[test]
fn block11_search_exact_fifty_is_complete_and_fifty_one_is_partial() {
    let (_d, a, p, r) = fixture();
    fs::write(r.join("matches.md"), "unique-match\n".repeat(50)).unwrap();
    let full = search(&a, &p, "unique-match");
    assert_eq!(full["results"].as_array().unwrap().len(), 50);
    assert_eq!(full["limited"], false);
    fs::write(r.join("matches.md"), "unique-match\n".repeat(51)).unwrap();
    let capped = search(&a, &p, "unique-match");
    assert_eq!(capped["results"].as_array().unwrap().len(), 50);
    assert_eq!(capped["limited"], true);
}

#[test]
fn block11_search_unicode_equivalence_ligatures_and_original_excerpts() {
    let (_d, a, p, r) = fixture();
    let text = format!("{} CAFÉ oﬁcina ＡＢＣ 한글", "e\u{301}".repeat(300));
    fs::write(r.join("Unicode.md"), &text).unwrap();
    for query in ["cafe\u{301}", "oficina", "abc", "한글"] {
        let found = search(&a, &p, query);
        assert_eq!(found["results"].as_array().unwrap().len(), 1, "{query}");
        let excerpt = found["results"][0]["excerpt"].as_str().unwrap();
        assert!(text.contains(excerpt));
        assert!(excerpt.contains("CAFÉ"));
        assert!(excerpt.contains("oﬁcina"));
    }
    assert_eq!(fs::read_to_string(r.join("Unicode.md")).unwrap(), text);
}
#[test]
fn block11_search_omitted_oversized_or_unreadable_files_are_partial_and_private_files_excluded() {
    let (_d, a, p, r) = fixture();
    fs::write(r.join("Oversize.txt"), vec![b'x'; 2 * 1024 * 1024 + 1]).unwrap();
    fs::create_dir(r.join(".private")).unwrap();
    fs::write(r.join(".private/Hidden.md"), "secret-canary").unwrap();
    let oversized = search(&a, &p, "secret-canary");
    assert!(oversized["results"].as_array().unwrap().is_empty());
    assert_eq!(oversized["limited"], true);
    assert!(!oversized["warnings"].as_array().unwrap().is_empty());
    fs::remove_file(r.join("Oversize.txt")).unwrap();
    fs::write(r.join("Unreadable.txt"), [0xff, 0xfe, 0xff]).unwrap();
    let unreadable = search(&a, &p, "secret-canary");
    assert_eq!(unreadable["limited"], true);
    assert!(!unreadable["warnings"].as_array().unwrap().is_empty());
    assert_eq!(
        fs::read(r.join("Unreadable.txt")).unwrap(),
        [0xff, 0xfe, 0xff]
    );
}

fn object(objects: &mut Vec<Vec<u8>>, data: impl Into<Vec<u8>>) -> usize {
    objects.push(data.into());
    objects.len()
}
fn stream(dictionary: &str, bytes: &[u8]) -> Vec<u8> {
    let mut result = format!("<< {dictionary} /Length {} >>\nstream\n", bytes.len()).into_bytes();
    result.extend_from_slice(bytes);
    result.extend_from_slice(b"\nendstream");
    result
}
fn complex_pdf(scan_only: bool) -> Vec<u8> {
    let mut objects = vec![vec![], vec![]];
    let normal = object(
        &mut objects,
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
            .to_vec(),
    );
    let cmap=b"/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Synthetic) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /SyntheticUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n3 beginbfchar\n<01> <00630061006600E9>\n<02> <006FFB0100630069006E0061>\n<03> <6F225B57>\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
    let mapping = object(&mut objects, stream("", cmap));
    let unicode = object(
        &mut objects,
        format!("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode {mapping} 0 R >>")
            .into_bytes(),
    );
    let image=object(&mut objects,stream("/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8",&[0,255,128,0]));
    let contents = if scan_only {
        vec![b"q 200 0 0 200 30 500 cm /Image Do Q".to_vec()]
    } else {
        vec![b"BT /F1 12 Tf 1 0 0 1 30 700 Tm (Columna izquierda acuerdo) Tj ET BT /F1 12 Tf 1 0 0 1 320 700 Tm (Columna derecha evidencia) Tj ET".to_vec(),b"BT /FU 12 Tf 18 TL <01> Tj T* <02> Tj T* <03> Tj ET".to_vec(),b"q 200 0 0 200 30 500 cm /Image Do Q".to_vec()]
    };
    let mut pages = vec![];
    for content in contents {
        let body = object(&mut objects, stream("", &content));
        let page=object(&mut objects,format!("<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 {normal} 0 R /FU {unicode} 0 R >> /XObject << /Image {image} 0 R >> >> /MediaBox [0 0 600 800] /Contents {body} 0 R >>").into_bytes());
        pages.push(page);
    }
    objects[0] = b"<< /Type /Catalog /Pages 2 0 R >>".to_vec();
    objects[1] = format!(
        "<< /Type /Pages /Kids [{}] /Count {} >>",
        pages
            .iter()
            .map(|n| format!("{n} 0 R"))
            .collect::<Vec<_>>()
            .join(" "),
        pages.len()
    )
    .into_bytes();
    let info = object(
        &mut objects,
        b"<< /Title (metadata-only-canary) /Subject (image-only-canary) >>".to_vec(),
    );
    let mut bytes = b"%PDF-1.4\n".to_vec();
    let mut offsets = vec![0];
    for (index, body) in objects.iter().enumerate() {
        offsets.push(bytes.len());
        bytes.extend_from_slice(format!("{} 0 obj\n", index + 1).as_bytes());
        bytes.extend_from_slice(body);
        bytes.extend_from_slice(b"\nendobj\n");
    }
    let xref = bytes.len();
    bytes.extend_from_slice(format!("xref\n0 {}\n0000000000 65535 f \n", offsets.len()).as_bytes());
    for offset in offsets.iter().skip(1) {
        bytes.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    bytes.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R /Info {info} 0 R >>\nstartxref\n{xref}\n%%EOF\n",
            offsets.len()
        )
        .as_bytes(),
    );
    bytes
}
#[test]
fn block11_search_complex_pdf_columns_unicode_ligatures_and_scanned_pages_are_honest() {
    let (_d, a, p, r) = fixture();
    let original = complex_pdf(false);
    let scan = complex_pdf(true);
    fs::write(r.join("Complex.pdf"), &original).unwrap();
    fs::write(r.join("Scanned.pdf"), &scan).unwrap();
    for (query, page) in [
        ("columna izquierda", 1),
        ("columna derecha", 1),
        ("cafe\u{301}", 2),
        ("oficina", 2),
        ("漢字", 2),
    ] {
        let v = search(&a, &p, query);
        let results = v["results"].as_array().unwrap();
        assert_eq!(results.len(), 1, "{query}: {v}");
        assert_eq!(results[0]["path"], "Complex.pdf");
        assert_eq!(results[0]["pageNumber"], page);
        assert_eq!(v["attachmentsWithoutText"], 1);
        assert_eq!(v["limited"], false);
    }
    for query in ["metadata-only-canary", "image-only-canary"] {
        assert!(search(&a, &p, query)["results"]
            .as_array()
            .unwrap()
            .is_empty());
    }
    let pages = knownext_docs::extract_pdf_pages_bounded(&original, 2 * 1024 * 1024).unwrap();
    assert_eq!(pages.len(), 3);
    assert!(pages[1].1.contains("café"));
    assert!(pages[1].1.contains("oﬁcina"));
    assert!(pages[2].1.trim().is_empty());
    assert_eq!(fs::read(r.join("Complex.pdf")).unwrap(), original);
    assert_eq!(fs::read(r.join("Scanned.pdf")).unwrap(), scan);
}
fn measurement(a: &LocalApi, p: &str, query: &str) -> (Value, Value) {
    let start = Instant::now();
    let value = search(a, p, query);
    let metrics = json!({"elapsedMicros":start.elapsed().as_micros(),"scannedDocuments":value["scannedDocuments"],"results":value["results"].as_array().unwrap().len(),"limited":value["limited"],"warningCount":value["warnings"].as_array().unwrap().len(),"attachmentsWithoutText":value["attachmentsWithoutText"],"index":value["index"]});
    (value, metrics)
}
#[test]
#[ignore = "Explicit synthetic corpus campaign; emits metadata via KNOWNEXT_SEARCH_BENCHMARK_OUTPUT"]
fn block11_search_synthetic_large_corpus_campaign() {
    let (_d, a, p, r) = fixture();
    let complex = complex_pdf(false);
    let scanned = complex_pdf(true);
    fs::write(r.join("Complex.pdf"), &complex).unwrap();
    fs::write(r.join("Scanned.pdf"), &scanned).unwrap();
    fs::write(r.join("000-freshness.md"), "freshness-before-canary").unwrap();
    let mut stages = vec![];
    let mut previous = 0;
    let mut total_bytes = complex.len() + scanned.len() + 23;
    for count in [100, 1000, 5000] {
        for index in previous..count {
            let directory = r.join(format!("documents-{:02}", index / 100));
            fs::create_dir_all(&directory).unwrap();
            let body = format!(
                "# Synthetic document {index}\n{}",
                "Saved local documentation without network calls.\n".repeat(32)
            );
            total_bytes += body.len();
            fs::write(directory.join(format!("body-{index:05}.md")), body).unwrap();
        }
        previous = count;
        let (cold, cold_metrics) = measurement(&a, &p, "absent-search-token");
        let (warm, warm_metrics) = measurement(&a, &p, "absent-search-token");
        let (_, capped) = measurement(&a, &p, "Saved local documentation");
        for v in [&cold, &warm] {
            assert!(v["index"]["readBytes"].as_u64().unwrap() <= 64 * 1024 * 1024);
            let covered = v["scannedDocuments"].as_u64().unwrap();
            assert!(covered <= count as u64 + 3);
            assert_eq!(
                v["index"]["updatedDocuments"].as_u64().unwrap()
                    + v["index"]["reusedDocuments"].as_u64().unwrap(),
                covered
            );
            if v["limited"] == false {
                assert_eq!(covered, count as u64 + 3);
            }
            assert!(v["results"].as_array().unwrap().is_empty());
        }
        stages.push(json!({"savedSyntheticDocuments":count+3,"inputBytes":total_bytes,"cold":cold_metrics,"warm":warm_metrics,"resultLimitQuery":capped}));
    }
    let initial = search(&a, &p, "freshness-before-canary");
    let handle = fs::OpenOptions::new()
        .write(true)
        .open(r.join("000-freshness.md"))
        .unwrap();
    let modified = handle.metadata().unwrap().modified().unwrap();
    fs::write(r.join("000-freshness.md"), "freshness-after!-canary").unwrap();
    handle
        .set_times(fs::FileTimes::new().set_modified(modified))
        .unwrap();
    drop(handle);
    fs::rename(r.join("000-freshness.md"), r.join("000-renamed.md")).unwrap();
    let (after, changed) = measurement(&a, &p, "freshness-before-canary");
    assert!(after["results"].as_array().unwrap().is_empty());
    let (new, new_metrics) = measurement(&a, &p, "freshness-after!-canary");
    assert!(new["results"]
        .as_array()
        .unwrap()
        .iter()
        .all(|v| v["path"] == "000-renamed.md"));
    fs::remove_file(r.join("000-renamed.md")).unwrap();
    let deleted = search(&a, &p, "freshness-after!-canary");
    assert!(deleted["results"].as_array().unwrap().is_empty());
    assert_eq!(fs::read(r.join("Complex.pdf")).unwrap(), complex);
    assert_eq!(fs::read(r.join("Scanned.pdf")).unwrap(), scanned);
    let report = json!({"schemaVersion":1,"campaign":"synthetic-saved-search-scale","profile":"temporary-owned-fixture","providerCalls":0,"ocrCalls":0,"networkCalls":0,"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"debugAssertions":cfg!(debug_assertions),"stages":stages,"freshness":{"initialCanaryObserved":!initial["results"].as_array().unwrap().is_empty(),"sameTimestampChangedBytes":true,"oldResultsAfterEditAndRename":0,"changeQuery":changed,"newQuery":new_metrics,"deletedResults":0},"pdf":{"pages":3,"multicolumnBody":true,"toUnicodeCmap":true,"compatibilityLigature":true,"scannedPageTextExtracted":false,"metadataExcluded":true,"readingOrder":"content-stream order; no reconstructed column reading order"},"limits":{"entries":10000,"readBytes":64*1024*1024,"cachedTextBytes":32*1024*1024,"results":50,"perTextFileBytes":2*1024*1024,"perPdfBytes":8*1024*1024,"queryCharacters":[2,200],"scanSeconds":2},"latencyAssertions":false,"scope":"saved visible regular files; persisted source bytes verified for each query; no open draft or OCR guessing"});
    if let Some(path) = std::env::var_os("KNOWNEXT_SEARCH_BENCHMARK_OUTPUT") {
        fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    }
    println!("{}", serde_json::to_string(&report).unwrap());
}
