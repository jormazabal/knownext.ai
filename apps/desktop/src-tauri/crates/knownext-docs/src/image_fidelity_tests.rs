use super::*;
use std::io::Read;

fn asset() -> ExportImageAsset {
    let mut png = Cursor::new(Vec::new());
    RgbaImage::from_pixel(200, 100, Rgba([243, 112, 33, 255]))
        .write_to(&mut png, ImageFormat::Png)
        .unwrap();
    ExportImageAsset {
        source: "assets/pixel.png".into(),
        alt: Some("Shared asset description".into()),
        content_type: "image/png".into(),
        bytes: png.into_inner(),
    }
}

const MARKDOWN: &str = "![First \\[A\\]](assets/pixel.png \"Title one\")\n\n<!-- knownext-image: {\"version\":1,\"ratio\":0.5} -->\n\n![Second](assets/pixel.png \"Title two\")\n\n<!-- knownext-image: {\"version\":1,\"ratio\":0.25} -->\n\nAfter.\n";

#[test]
fn image_exports_keep_occurrence_descriptions_and_geometry_without_metadata_prose() {
    let blocks = markdown_blocks(MARKDOWN);
    let sizes = blocks
        .iter()
        .filter_map(|block| match block {
            MarkdownBlock::Image { alt, ratio, .. } => Some((alt.as_str(), *ratio)),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(sizes, vec![("First [A]", 0.5), ("Second", 0.25)]);
    assert!(matches!(blocks.last(), Some(MarkdownBlock::Paragraph(text)) if text == "After."));
    assert_eq!(blocks.len(), 3);

    let path = std::env::temp_dir().join(format!(
        "{}.docx",
        knownext_core::compact_id("image-fidelity")
    ));
    write_docx_with_assets_template_and_title(&path, MARKDOWN, &[], &[asset()], None, None)
        .unwrap();
    let mut archive = zip::ZipArchive::new(std::fs::File::open(&path).unwrap()).unwrap();
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    assert!(xml.contains("name=\"First [A]\""));
    assert!(xml.contains("name=\"Second\""));
    assert!(xml.contains("Title one"));
    assert!(xml.contains("Title two"));
    let parsed = roxmltree::Document::parse(&xml).unwrap();
    let ids = parsed
        .descendants()
        .filter(|node| {
            node.has_tag_name((
                "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
                "docPr",
            ))
        })
        .map(|node| node.attribute("id").unwrap())
        .collect::<Vec<_>>();
    assert_eq!(ids.len(), 2);
    assert_ne!(ids[0], ids[1]);
    assert!(!xml.contains("Shared asset description"));
    assert!(!xml.contains("knownext-image"));
    assert!(xml.contains("cx=\"2880000\" cy=\"1440000\""));
    assert!(xml.contains("cx=\"1440000\" cy=\"720000\""));
    drop(archive);
    std::fs::remove_file(path).unwrap();

    let template = DocxTemplate::from_value(None);
    let mut context = PdfRenderContext::new("Images", &template);
    context
        .render_export_image(
            "assets/pixel.png",
            "First [A]",
            "Title one",
            0.5,
            &[asset()],
            &template,
        )
        .unwrap();
    context
        .render_export_image(
            "assets/pixel.png",
            "Second",
            "Title two",
            0.25,
            &[asset()],
            &template,
        )
        .unwrap();
    let scales = context
        .ops
        .iter()
        .filter_map(|op| match op {
            Op::UseXobject { transform, .. } => transform.scale_x,
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(scales, vec![0.5, 0.25]);
    let bytes =
        export_pdf_with_assets_and_template("Images", MARKDOWN, &[], &[asset()], None).unwrap();
    assert!(lopdf::Document::load_mem(&bytes).is_ok());
}

#[test]
fn future_sizing_is_hidden_in_exports_but_code_and_unrelated_comments_are_untouched() {
    let marker = "<!-- knownext-image: {\"version\":2,\"ratio\":0.5} -->";
    let markdown = format!("![Description](assets/pixel.png)\n\n{marker}\n\n```html\n{marker}\n```\n\n<!-- unrelated -->\n");
    let blocks = markdown_blocks(&markdown);
    assert_eq!(blocks.len(), 3);
    assert!(matches!(&blocks[0], MarkdownBlock::Image { ratio, .. } if *ratio == 1.0));
    assert!(matches!(&blocks[1], MarkdownBlock::CodeBlock(text) if text == marker));
    assert!(matches!(&blocks[2], MarkdownBlock::Paragraph(text) if text == "<!-- unrelated -->"));
    let image = asset();
    let normal = docx_image_extent(&image.bytes, 1.0);
    let smaller = docx_image_extent(&image.bytes, 0.01);
    assert_eq!(normal.0, normal.1 * 2);
    assert_eq!(smaller.0, smaller.1 * 2);
    assert_eq!(docx_image_extent(&image.bytes, 4.0), normal);
}

#[test]
fn image_dependencies_use_literal_alt_and_ignore_non_rendered_examples() {
    let markdown = r#"---
example: "![Frontmatter](secret.png)"
---
Texto ![Pixel \[A\] \*literal\* \&amp;](<assets/pixel (1).png> "Title").

![Repeated][pixel]

[pixel]: assets/pixel.png "Reference"

<img src="assets/other.png" alt="HTML image">

![Actual <img src="missing-nested.png">](assets/actual.png)

```md
![Code](missing-code.png)
```

<!--
![Comment](missing-comment.png)
<img src="missing-html-comment.png">
-->

<script>
![Script](missing-script.png)
</script>
"#;
    let images = markdown_images(markdown);
    assert_eq!(images.len(), 4, "{images:?}");
    assert_eq!(images[0].alt, "Pixel [A] *literal* &amp;");
    assert_eq!(images[0].source, "assets/pixel (1).png");
    assert_eq!(images[1].alt, "Repeated");
    assert_eq!(images[1].source, "assets/pixel.png");
    assert_eq!(images[2].alt, "HTML image");
    assert_eq!(images[2].source, "assets/other.png");
    assert_eq!(
        &markdown[images[2].range.clone()],
        r#"<img src="assets/other.png" alt="HTML image">"#
    );
    assert_eq!(images[3].source, "assets/actual.png");
    assert!(images
        .iter()
        .all(|image| !image.source.starts_with("missing-")));
}
