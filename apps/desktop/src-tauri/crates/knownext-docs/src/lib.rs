use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
#[cfg(not(target_os = "android"))]
use printpdf::{
    Actions, BorderArray, BuiltinFont, Color, ColorArray, FontId, Line, LinePoint, LinkAnnotation,
    Mm, Op, PaintMode, ParsedFont, PdfDocument, PdfFontHandle, PdfPage, PdfSaveOptions, Point,
    Polygon, Pt, RawImage, Rect, Rgb, TextItem, WindingOrder, XObjectTransform,
};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::Write;
use std::path::Path;

#[derive(Clone, Debug)]
pub struct DiagramAsset {
    pub caption: Option<String>,
    pub png: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct ExportImageAsset {
    pub source: String,
    pub alt: Option<String>,
    pub content_type: String,
    pub bytes: Vec<u8>,
}

pub fn minimal_pdf(title: &str, markdown: &str) -> Vec<u8> {
    minimal_pdf_with_diagrams(title, markdown, &[])
}

pub fn minimal_pdf_with_diagrams(
    title: &str,
    markdown: &str,
    diagram_assets: &[DiagramAsset],
) -> Vec<u8> {
    minimal_pdf_with_diagrams_and_template(title, markdown, diagram_assets, None)
}

pub fn minimal_pdf_with_diagrams_and_template(
    title: &str,
    markdown: &str,
    diagram_assets: &[DiagramAsset],
    template: Option<&Value>,
) -> Vec<u8> {
    minimal_pdf_with_assets_and_template(title, markdown, diagram_assets, &[], template)
}

pub fn minimal_pdf_with_assets_and_template(
    title: &str,
    markdown: &str,
    diagram_assets: &[DiagramAsset],
    image_assets: &[ExportImageAsset],
    template: Option<&Value>,
) -> Vec<u8> {
    #[cfg(not(target_os = "android"))]
    {
        let template = DocxTemplate::from_value(template);
        if let Some(bytes) = print_pdf_with_diagrams_and_template(
            title,
            markdown,
            diagram_assets,
            image_assets,
            &template,
        ) {
            return bytes;
        }
    }
    #[cfg(target_os = "android")]
    let _ = (diagram_assets, image_assets);

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
    write_docx_with_diagrams(path, markdown, &[])
}

pub fn write_docx_with_diagrams(
    path: &Path,
    markdown: &str,
    diagram_assets: &[DiagramAsset],
) -> Result<(), String> {
    write_docx_with_diagrams_and_template(path, markdown, diagram_assets, None)
}

pub fn write_docx_with_diagrams_and_template(
    path: &Path,
    markdown: &str,
    diagram_assets: &[DiagramAsset],
    template: Option<&Value>,
) -> Result<(), String> {
    write_docx_with_assets_template_and_title(path, markdown, diagram_assets, &[], template, None)
}

pub fn write_docx_with_diagrams_template_and_title(
    path: &Path,
    markdown: &str,
    diagram_assets: &[DiagramAsset],
    template: Option<&Value>,
    title: Option<&str>,
) -> Result<(), String> {
    write_docx_with_assets_template_and_title(path, markdown, diagram_assets, &[], template, title)
}

pub fn write_docx_with_assets_template_and_title(
    path: &Path,
    markdown: &str,
    diagram_assets: &[DiagramAsset],
    image_assets: &[ExportImageAsset],
    template: Option<&Value>,
    title: Option<&str>,
) -> Result<(), String> {
    let template = DocxTemplate::from_value(template);
    let blocks = markdown_blocks(markdown);
    let link_rel_ids = collect_docx_link_relationships(&blocks);
    let file = std::fs::File::create(path).map_err(|error| error.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("[Content_Types].xml", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Default Extension="webp" ContentType="image/webp"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>"#).map_err(|error| error.to_string())?;
    zip.start_file("_rels/.rels", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(br#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="word/document.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/></Relationships>"#).map_err(|error| error.to_string())?;
    zip.start_file("word/_rels/document.xml.rels", options)
        .map_err(|error| error.to_string())?;
    let diagram_relationships = diagram_assets
        .iter()
        .enumerate()
        .map(|(index, _)| {
            format!(
                r#"<Relationship Id="rIdDiagram{}" Target="media/diagram-{}.png" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>"#,
                index + 1,
                index + 1
            )
        })
        .collect::<String>();
    let image_relationships = image_assets
        .iter()
        .enumerate()
        .map(|(index, asset)| {
            format!(
                r#"<Relationship Id="rIdImage{}" Target="media/image-{}.{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"/>"#,
                index + 1,
                index + 1,
                image_extension(asset),
            )
        })
        .collect::<String>();
    let relationships = format!(
        r#"<Relationship Id="rIdStyles" Target="styles.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"/>{diagram_relationships}{image_relationships}{}"#,
        docx_hyperlink_relationships_xml(&link_rel_ids)
    );
    zip.write_all(format!(r#"<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{relationships}</Relationships>"#).as_bytes()).map_err(|error| error.to_string())?;
    for (index, asset) in diagram_assets.iter().enumerate() {
        if asset.png.is_empty() {
            continue;
        }
        zip.start_file(format!("word/media/diagram-{}.png", index + 1), options)
            .map_err(|error| error.to_string())?;
        zip.write_all(&asset.png)
            .map_err(|error| error.to_string())?;
    }
    for (index, asset) in image_assets.iter().enumerate() {
        if asset.bytes.is_empty() {
            continue;
        }
        zip.start_file(
            format!("word/media/image-{}.{}", index + 1, image_extension(asset)),
            options,
        )
        .map_err(|error| error.to_string())?;
        zip.write_all(&asset.bytes)
            .map_err(|error| error.to_string())?;
    }
    zip.start_file("word/styles.xml", options)
        .map_err(|error| error.to_string())?;
    zip.write_all(docx_styles_xml(&template).as_bytes())
        .map_err(|error| error.to_string())?;
    zip.start_file("word/document.xml", options)
        .map_err(|error| error.to_string())?;
    let mut body_parts = Vec::new();
    if template.include_title {
        if let Some(title) = title.map(str::trim).filter(|value| !value.is_empty()) {
            body_parts.push(styled_paragraph_xml(
                Some("Heading1"),
                template.heading(1),
                &template,
                "",
                &parse_inline_runs(title, template.heading(1), &template, &link_rel_ids),
            ));
        }
    }
    body_parts.extend(blocks
        .into_iter()
        .map(|item| match item {
            MarkdownBlock::Heading { level, content } => styled_paragraph_xml(
                Some(&format!("Heading{level}")),
                &template.heading(level),
                &template,
                "",
                &parse_inline_runs(&content, &template.heading(level), &template, &link_rel_ids),
            ),
            MarkdownBlock::Paragraph(content) => styled_paragraph_xml(
                Some("Normal"),
                &template.normal,
                &template,
                "",
                &parse_inline_runs(&content, &template.normal, &template, &link_rel_ids),
            ),
            MarkdownBlock::ListItem { ordered, level, content } => {
                let left = 720 + (level as i32 * 360);
                let marker = if content.starts_with("[ ] ") {
                    "☐ "
                } else if content.starts_with("[x] ") || content.starts_with("[X] ") {
                    "☑ "
                } else if ordered {
                    "1. "
                } else {
                    "• "
                };
                let content = content
                    .strip_prefix("[ ] ")
                    .or_else(|| content.strip_prefix("[x] "))
                    .or_else(|| content.strip_prefix("[X] "))
                    .unwrap_or(&content);
                let mut runs = vec![text_run(marker, &template.normal, &template, InlineFlags::default())];
                runs.extend(parse_inline_runs(content, &template.normal, &template, &link_rel_ids));
                styled_paragraph_xml(
                    Some("Normal"),
                    &template.normal,
                    &template,
                    &format!(r#"<w:ind w:left="{left}" w:hanging="360"/>"#),
                    &runs,
                )
            }
            MarkdownBlock::Quote(content) => styled_paragraph_xml(
                Some("Normal"),
                &template.normal,
                &template,
                r#"<w:ind w:left="540"/><w:pBdr><w:left w:val="single" w:sz="6" w:space="8" w:color="E5E7EB"/></w:pBdr>"#,
                &parse_inline_runs(&content, &template.normal, &template, &link_rel_ids),
            ),
            MarkdownBlock::CodeBlock(content) => {
                let code = content
                    .lines()
                    .map(|line| text_run(line, &template.code, &template, InlineFlags::code()))
                    .collect::<Vec<_>>()
                    .join(r#"<w:br/>"#);
                styled_paragraph_xml(
                    Some("CodeBlock"),
                    &template.code,
                    &template,
                    r#"<w:shd w:val="clear" w:color="auto" w:fill="F9FAFB"/>"#,
                    &[code],
                )
            }
            MarkdownBlock::HorizontalRule => format!(
                r#"<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="{}"/></w:pBdr>{}</w:pPr></w:p>"#,
                color_value(&template.horizontal_rule_color),
                paragraph_spacing_xml(&template.normal, &template)
            ),
            MarkdownBlock::Table { headers, rows } => docx_table_xml(&headers, &rows, &template, &link_rel_ids),
            MarkdownBlock::Diagram(index) => diagram_assets
                .get(index)
                .filter(|asset| !asset.png.is_empty())
                .map(|asset| {
                    let rel_id = format!("rIdDiagram{}", index + 1);
                    format!(
                        "{}{}",
                        docx_image_paragraph(
                            &rel_id,
                            index + 1,
                            &format!("Diagrama {}", index + 1),
                            &asset.png,
                        ),
                        asset
                            .caption
                            .as_ref()
                            .filter(|caption| !caption.trim().is_empty())
                            .map(|caption| styled_paragraph_xml(
                                Some("Normal"),
                                &template.normal,
                                &template,
                                "",
                                &parse_inline_runs(caption.trim(), &template.normal, &template, &link_rel_ids),
                            ))
                            .unwrap_or_default()
                    )
                })
                .unwrap_or_else(|| "<w:p><w:r><w:t>[Diagrama Mermaid no renderizado]</w:t></w:r></w:p>".to_string()),
            MarkdownBlock::Image { source, alt } => find_image_asset(image_assets, &source)
                .map(|asset| {
                    docx_image_paragraph(
                        &format!("rIdImage{}", image_asset_index(image_assets, &source).unwrap_or(0) + 1),
                        1_000 + image_asset_index(image_assets, &source).unwrap_or(0),
                        asset.alt.as_deref().or(Some(alt.as_str())).unwrap_or("Imagen"),
                        &asset.bytes,
                    )
                })
                .unwrap_or_else(|| {
                    styled_paragraph_xml(
                        Some("Normal"),
                        &template.normal,
                        &template,
                        "",
                        &parse_inline_runs(
                            &format!("[Imagen no disponible: {alt}]"),
                            &template.normal,
                            &template,
                            &link_rel_ids,
                        ),
                    )
                }),
        }));
    let body = body_parts.join("");
    let (page_width, page_height) = page_size_twips(&template);
    zip.write_all(format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>{body}<w:sectPr><w:pgSz w:w="{page_width}" w:h="{page_height}"/><w:pgMar w:top="{}" w:right="{}" w:bottom="{}" w:left="{}"/></w:sectPr></w:body></w:document>"#,
        mm_to_twips(template.margin_top_mm),
        mm_to_twips(template.margin_right_mm),
        mm_to_twips(template.margin_bottom_mm),
        mm_to_twips(template.margin_left_mm),
    ).as_bytes()).map_err(|error| error.to_string())?;
    zip.finish().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn diagram_assets_from_json(value: Option<&Value>) -> Vec<DiagramAsset> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let png_data_url = item.get("pngDataUrl").and_then(Value::as_str)?;
                    let png = decode_png_data_url(png_data_url)?;
                    Some(DiagramAsset {
                        caption: item
                            .get("caption")
                            .and_then(Value::as_str)
                            .map(str::to_string)
                            .filter(|value| !value.trim().is_empty()),
                        png,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

enum MarkdownBlock {
    Heading {
        level: usize,
        content: String,
    },
    Paragraph(String),
    ListItem {
        ordered: bool,
        level: usize,
        content: String,
    },
    Quote(String),
    CodeBlock(String),
    HorizontalRule,
    Table {
        headers: Vec<String>,
        rows: Vec<Vec<String>>,
    },
    Diagram(usize),
    Image {
        source: String,
        alt: String,
    },
}

#[derive(Clone, Debug)]
struct DocxTextStyle {
    font_family: String,
    font_size_pt: f64,
    color: String,
    text_format: String,
    space_before_pt: f64,
    space_after_pt: f64,
}

#[derive(Clone, Debug)]
struct DocxTemplate {
    page_size: String,
    margin_top_mm: f64,
    margin_right_mm: f64,
    margin_bottom_mm: f64,
    margin_left_mm: f64,
    normal: DocxTextStyle,
    headings: [DocxTextStyle; 6],
    code: DocxTextStyle,
    line_spacing: f64,
    space_after_pt: f64,
    include_title: bool,
    link_color: String,
    horizontal_rule_color: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct InlineFlags {
    bold: bool,
    italic: bool,
    underline: bool,
    strike: bool,
    code: bool,
    link: bool,
}

#[derive(Clone, Debug, Default)]
struct InlineSegment {
    text: String,
    flags: InlineFlags,
    link_target: Option<String>,
    highlight_color: Option<String>,
}

const DEFAULT_HIGHLIGHT_COLOR_ID: &str = "yellow";
const HIGHLIGHT_COLORS: &[(&str, &str)] = &[
    ("yellow", "#FEF08A"),
    ("green", "#BBF7D0"),
    ("blue", "#BFDBFE"),
    ("pink", "#FBCFE8"),
    ("orange", "#FED7AA"),
];

impl InlineFlags {
    fn code() -> Self {
        Self {
            code: true,
            ..Self::default()
        }
    }
}

impl DocxTemplate {
    fn from_value(value: Option<&Value>) -> Self {
        let paragraph = value.and_then(|item| item.get("paragraph"));
        let paragraph_space_before = number_at(paragraph, "spaceBeforePt", 0.0).clamp(0.0, 24.0);
        let paragraph_space_after = number_at(paragraph, "spaceAfterPt", 6.0).clamp(0.0, 24.0);
        let mut normal = text_style(
            value.and_then(|item| item.get("normal")),
            "Arial",
            11.0,
            "#111827",
            "normal",
            0.0,
            0.0,
        );
        normal.space_before_pt = paragraph_space_before;
        normal.space_after_pt = paragraph_space_after;
        let heading_font = value
            .and_then(|item| item.get("headingFontFamily"))
            .and_then(Value::as_str)
            .unwrap_or("Arial");
        let headings = std::array::from_fn(|index| {
            let key = format!("h{}", index + 1);
            let default_size = [22.0, 18.0, 15.0, 13.0, 12.0, 11.0][index];
            let default_before = [12.0, 10.0, 8.0, 6.0, 4.0, 3.0][index];
            let default_after = [8.0, 6.0, 5.0, 4.0, 3.0, 3.0][index];
            text_style(
                value
                    .and_then(|item| item.get("headings"))
                    .and_then(|item| item.get(&key)),
                heading_font,
                default_size,
                "#111827",
                "bold",
                default_before,
                default_after,
            )
        });
        let margins = value
            .and_then(|item| item.get("page"))
            .and_then(|item| item.get("margins"));
        let document = value.and_then(|item| item.get("document"));
        Self {
            page_size: value
                .and_then(|item| item.get("page"))
                .and_then(|item| item.get("size"))
                .and_then(Value::as_str)
                .filter(|size| *size == "Letter")
                .unwrap_or("A4")
                .to_string(),
            margin_top_mm: number_at(margins, "topMm", 20.0),
            margin_right_mm: number_at(margins, "rightMm", 20.0),
            margin_bottom_mm: number_at(margins, "bottomMm", 20.0),
            margin_left_mm: number_at(margins, "leftMm", 20.0),
            normal,
            headings,
            code: text_style(
                value.and_then(|item| item.get("code")),
                "Consolas",
                10.0,
                "#111827",
                "normal",
                0.0,
                paragraph_space_after,
            ),
            line_spacing: number_at(paragraph, "lineSpacing", 1.25).clamp(1.0, 2.5),
            space_after_pt: paragraph_space_after,
            include_title: document
                .and_then(|item| item.get("includeTitle"))
                .and_then(Value::as_bool)
                .unwrap_or(false),
            link_color: string_at(document, "linkColor", "#D85A12"),
            horizontal_rule_color: string_at(document, "horizontalRuleColor", "#E5E7EB"),
        }
    }

    fn heading(&self, level: usize) -> &DocxTextStyle {
        self.headings
            .get(level.saturating_sub(1).min(5))
            .unwrap_or(&self.headings[5])
    }
}

fn text_style(
    value: Option<&Value>,
    font: &str,
    size: f64,
    color: &str,
    text_format: &str,
    space_before_pt: f64,
    space_after_pt: f64,
) -> DocxTextStyle {
    DocxTextStyle {
        font_family: string_at(value, "fontFamily", font),
        font_size_pt: number_at(value, "fontSizePt", size).clamp(6.0, 60.0),
        color: string_at(value, "color", color),
        text_format: string_at(value, "textFormat", text_format),
        space_before_pt: number_at(value, "spaceBeforePt", space_before_pt).clamp(0.0, 48.0),
        space_after_pt: number_at(value, "spaceAfterPt", space_after_pt).clamp(0.0, 48.0),
    }
}

fn number_at(value: Option<&Value>, key: &str, fallback: f64) -> f64 {
    value
        .and_then(|item| item.get(key))
        .and_then(Value::as_f64)
        .unwrap_or(fallback)
}

fn string_at(value: Option<&Value>, key: &str, fallback: &str) -> String {
    value
        .and_then(|item| item.get(key))
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn markdown_blocks(markdown: &str) -> Vec<MarkdownBlock> {
    let normalized = markdown.replace("\r\n", "\n").replace('\r', "\n");
    let lines = normalized.lines().collect::<Vec<_>>();
    let mut blocks = Vec::new();
    let mut index = 0;
    let mut diagram_index = 0;

    while index < lines.len() {
        let line = lines[index];
        let trimmed = line.trim();
        if trimmed.is_empty() {
            index += 1;
            continue;
        }
        if is_mermaid_fence_start(line) {
            blocks.push(MarkdownBlock::Diagram(diagram_index));
            diagram_index += 1;
            index += 1;
            while index < lines.len() && !is_fence_end(lines[index]) {
                index += 1;
            }
            index += 1;
            continue;
        }
        if is_fence_start(line) {
            let mut code = Vec::new();
            index += 1;
            while index < lines.len() && !is_fence_end(lines[index]) {
                code.push(lines[index]);
                index += 1;
            }
            blocks.push(MarkdownBlock::CodeBlock(code.join("\n")));
            index += 1;
            continue;
        }
        if let Some((alt, source)) =
            markdown_image_block(trimmed).or_else(|| html_image_block(trimmed))
        {
            blocks.push(MarkdownBlock::Image { source, alt });
            index += 1;
            continue;
        }
        if let Some((headers, rows, consumed)) = table_block(&lines[index..]) {
            blocks.push(MarkdownBlock::Table { headers, rows });
            index += consumed;
            continue;
        }
        if let Some((level, content)) = heading_block(trimmed) {
            blocks.push(MarkdownBlock::Heading { level, content });
            index += 1;
            continue;
        }
        if is_horizontal_rule(trimmed) {
            blocks.push(MarkdownBlock::HorizontalRule);
            index += 1;
            continue;
        }
        if let Some(content) = trimmed.strip_prefix("> ") {
            blocks.push(MarkdownBlock::Quote(content.trim().to_string()));
            index += 1;
            continue;
        }
        if let Some((ordered, level, content)) = list_item(line) {
            blocks.push(MarkdownBlock::ListItem {
                ordered,
                level,
                content,
            });
            index += 1;
            continue;
        }

        let mut paragraph = vec![trimmed.to_string()];
        index += 1;
        while index < lines.len() {
            let next = lines[index];
            let next_trimmed = next.trim();
            if next_trimmed.is_empty()
                || heading_block(next_trimmed).is_some()
                || is_horizontal_rule(next_trimmed)
                || is_fence_start(next)
                || markdown_image_block(next_trimmed).is_some()
                || html_image_block(next_trimmed).is_some()
                || table_block(&lines[index..]).is_some()
                || next_trimmed.starts_with("> ")
                || list_item(next).is_some()
            {
                break;
            }
            paragraph.push(next_trimmed.to_string());
            index += 1;
        }
        blocks.push(MarkdownBlock::Paragraph(paragraph.join(" ")));
    }

    blocks
}

fn table_block(lines: &[&str]) -> Option<(Vec<String>, Vec<Vec<String>>, usize)> {
    if lines.len() < 2 {
        return None;
    }
    let header_line = lines[0].trim();
    let separator_line = lines[1].trim();
    if !header_line.contains('|') || !is_table_separator(separator_line) {
        return None;
    }
    let headers = split_table_row(header_line);
    if headers.is_empty() {
        return None;
    }
    let mut rows = Vec::new();
    let mut consumed = 2;
    while consumed < lines.len() {
        let line = lines[consumed];
        let trimmed = line.trim();
        if trimmed.is_empty()
            || is_fence_start(line)
            || heading_block(trimmed).is_some()
            || is_horizontal_rule(trimmed)
            || markdown_image_block(trimmed).is_some()
            || html_image_block(trimmed).is_some()
        {
            break;
        }
        if !trimmed.contains('|') {
            break;
        }
        rows.push(normalize_table_row(split_table_row(trimmed), headers.len()));
        consumed += 1;
    }
    Some((headers, rows, consumed))
}

fn split_table_row(line: &str) -> Vec<String> {
    let trimmed = line.trim().trim_matches('|');
    trimmed
        .split('|')
        .map(|cell| cell.trim().to_string())
        .collect::<Vec<_>>()
}

fn normalize_table_row(mut cells: Vec<String>, len: usize) -> Vec<String> {
    cells.truncate(len);
    while cells.len() < len {
        cells.push(String::new());
    }
    cells
}

fn is_table_separator(line: &str) -> bool {
    if !line.contains('|') {
        return false;
    }
    let cells = line.trim().trim_matches('|').split('|').collect::<Vec<_>>();
    if cells.is_empty() {
        return false;
    }
    cells.iter().all(|cell| {
        let value = cell.trim();
        let core = value.trim_matches(':');
        core.len() >= 3 && core.chars().all(|ch| ch == '-')
    })
}

fn markdown_image_block(trimmed: &str) -> Option<(String, String)> {
    let rest = trimmed.strip_prefix("![")?;
    let alt_end = rest.find(']')?;
    let after_alt = &rest[alt_end + 1..];
    let destination = after_alt.strip_prefix('(')?;
    let destination_end = find_markdown_link_close(destination)?;
    let trailing = destination[destination_end + 1..].trim();
    if !trailing.is_empty() {
        return None;
    }
    let source = parse_markdown_link_destination(&destination[..destination_end]);
    if source.is_empty() {
        return None;
    }
    Some((rest[..alt_end].trim().to_string(), source.to_string()))
}

fn html_image_block(trimmed: &str) -> Option<(String, String)> {
    if !trimmed.to_ascii_lowercase().starts_with("<img") {
        return None;
    }
    let source = html_attr_value(trimmed, "src")?;
    Some((
        html_attr_value(trimmed, "alt")
            .unwrap_or("Imagen")
            .trim()
            .to_string(),
        source.trim().to_string(),
    ))
}

fn find_markdown_link_close(value: &str) -> Option<usize> {
    let mut escaped = false;
    for (index, ch) in value.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == ')' {
            return Some(index);
        }
    }
    None
}

fn parse_markdown_link_destination(value: &str) -> &str {
    let trimmed = value.trim();
    if let Some(rest) = trimmed.strip_prefix('<') {
        return rest.split('>').next().unwrap_or("").trim();
    }
    trimmed.split_whitespace().next().unwrap_or("").trim()
}

fn html_attr_value<'a>(tag: &'a str, attr: &str) -> Option<&'a str> {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{attr}=");
    let start = lower.find(&needle)? + needle.len();
    let rest = &tag[start..];
    let quote = rest.chars().next()?;
    if quote == '"' || quote == '\'' {
        let content = &rest[quote.len_utf8()..];
        content.find(quote).map(|end| &content[..end])
    } else {
        Some(rest.split_whitespace().next().unwrap_or(""))
    }
}

fn heading_block(trimmed: &str) -> Option<(usize, String)> {
    let hashes = trimmed
        .chars()
        .take_while(|character| *character == '#')
        .count();
    if !(1..=6).contains(&hashes) || !trimmed.chars().nth(hashes).is_some_and(char::is_whitespace) {
        return None;
    }
    Some((
        hashes,
        trimmed[hashes..]
            .trim()
            .trim_end_matches('#')
            .trim()
            .to_string(),
    ))
}

fn list_item(line: &str) -> Option<(bool, usize, String)> {
    let indent = line
        .chars()
        .take_while(|character| character.is_whitespace())
        .count();
    let level = indent / 2;
    let trimmed = line.trim_start();
    if let Some(rest) = trimmed
        .strip_prefix("- ")
        .or_else(|| trimmed.strip_prefix("* "))
    {
        return Some((false, level, rest.trim().to_string()));
    }
    let split = trimmed.find(". ")?;
    if split > 0
        && trimmed[..split]
            .chars()
            .all(|character| character.is_ascii_digit())
    {
        return Some((true, level, trimmed[split + 2..].trim().to_string()));
    }
    None
}

fn is_horizontal_rule(trimmed: &str) -> bool {
    matches!(trimmed, "---" | "***" | "___")
}

fn is_fence_start(line: &str) -> bool {
    let trimmed = line.trim_start();
    trimmed.starts_with("```") || trimmed.starts_with("~~~")
}

fn is_mermaid_fence_start(line: &str) -> bool {
    let trimmed = line.trim_start();
    (trimmed.starts_with("```") || trimmed.starts_with("~~~"))
        && trimmed.to_ascii_lowercase().contains("mermaid")
}

fn is_fence_end(line: &str) -> bool {
    let trimmed = line.trim_start();
    trimmed.starts_with("```") || trimmed.starts_with("~~~")
}

fn docx_styles_xml(template: &DocxTemplate) -> String {
    let heading_styles = (1..=6)
        .map(|level| {
            style_xml(
                &format!("Heading{level}"),
                &format!("Heading {level}"),
                template.heading(level),
            )
        })
        .collect::<String>();
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">{}{}{}{}</w:styles>"#,
        style_xml("Normal", "Normal", &template.normal),
        heading_styles,
        style_xml("CodeBlock", "Code Block", &template.code),
        r#"<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/></w:style>"#,
    )
}

fn style_xml(style_id: &str, name: &str, style: &DocxTextStyle) -> String {
    format!(
        r#"<w:style w:type="paragraph" w:styleId="{style_id}"><w:name w:val="{name}"/><w:rPr>{}</w:rPr></w:style>"#,
        run_properties_xml(style, None, InlineFlags::default(), None)
    )
}

fn styled_paragraph_xml(
    style_id: Option<&str>,
    style: &DocxTextStyle,
    template: &DocxTemplate,
    paragraph_extra: &str,
    runs: &[String],
) -> String {
    if runs.is_empty() {
        return String::new();
    }
    let style_xml = style_id
        .map(|id| format!(r#"<w:pStyle w:val="{id}"/>"#))
        .unwrap_or_default();
    format!(
        "<w:p><w:pPr>{style_xml}{}{paragraph_extra}</w:pPr>{}</w:p>",
        paragraph_spacing_xml(style, template),
        runs.join("")
    )
}

fn docx_table_xml(
    headers: &[String],
    rows: &[Vec<String>],
    template: &DocxTemplate,
    link_rel_ids: &BTreeMap<String, String>,
) -> String {
    if headers.is_empty() {
        return String::new();
    }
    let columns = headers.len();
    let column_width = (9_000 / columns.max(1) as i32).max(900);
    let grid = (0..columns)
        .map(|_| format!(r#"<w:gridCol w:w="{column_width}"/>"#))
        .collect::<String>();
    let header_style = DocxTextStyle {
        text_format: "bold".to_string(),
        ..template.normal.clone()
    };
    let header_row = docx_table_row_xml(headers, &header_style, template, true, link_rel_ids);
    let body_rows = rows
        .iter()
        .map(|row| {
            docx_table_row_xml(
                &normalize_table_row(row.clone(), columns),
                &template.normal,
                template,
                false,
                link_rel_ids,
            )
        })
        .collect::<String>();
    format!(
        r#"<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="E5E7EB"/><w:left w:val="single" w:sz="4" w:color="E5E7EB"/><w:bottom w:val="single" w:sz="4" w:color="E5E7EB"/><w:right w:val="single" w:sz="4" w:color="E5E7EB"/><w:insideH w:val="single" w:sz="4" w:color="E5E7EB"/><w:insideV w:val="single" w:sz="4" w:color="E5E7EB"/></w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>{grid}</w:tblGrid>{header_row}{body_rows}</w:tbl>"#
    )
}

fn docx_table_row_xml(
    cells: &[String],
    style: &DocxTextStyle,
    template: &DocxTemplate,
    header: bool,
    link_rel_ids: &BTreeMap<String, String>,
) -> String {
    let fill = if header {
        r#"<w:shd w:val="clear" w:color="auto" w:fill="F9FAFB"/>"#
    } else {
        ""
    };
    let cells_xml = cells
        .iter()
        .map(|cell| {
            let runs = parse_inline_runs(cell, style, template, link_rel_ids);
            let content = if runs.is_empty() {
                "<w:r><w:t></w:t></w:r>".to_string()
            } else {
                runs.join("")
            };
            format!(
                r#"<w:tc><w:tcPr>{fill}<w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p><w:pPr>{}</w:pPr>{content}</w:p></w:tc>"#,
                paragraph_spacing_xml(&table_cell_style(style), template)
            )
        })
        .collect::<String>();
    format!("<w:tr>{cells_xml}</w:tr>")
}

fn table_cell_style(style: &DocxTextStyle) -> DocxTextStyle {
    DocxTextStyle {
        space_before_pt: 0.0,
        space_after_pt: 0.0,
        ..style.clone()
    }
}

fn paragraph_spacing_xml(style: &DocxTextStyle, template: &DocxTemplate) -> String {
    let before = (style.space_before_pt * 20.0).round() as i32;
    let after = (style.space_after_pt * 20.0).round() as i32;
    let line = (template.line_spacing * 240.0).round() as i32;
    format!(
        r#"<w:spacing w:before="{before}" w:after="{after}" w:line="{line}" w:lineRule="auto"/>"#
    )
}

fn parse_inline_runs(
    text: &str,
    base_style: &DocxTextStyle,
    template: &DocxTemplate,
    link_rel_ids: &BTreeMap<String, String>,
) -> Vec<String> {
    parse_inline_segments(text)
        .into_iter()
        .map(|segment| {
            let style = if segment.flags.code {
                &template.code
            } else {
                base_style
            };
            let color = if segment.link_target.is_some() {
                Some(template.link_color.as_str())
            } else {
                None
            };
            let mut flags = segment.flags;
            if segment.link_target.is_some() {
                flags.link = true;
                flags.underline = true;
            }
            let run = text_run_with_override(
                &segment.text,
                style,
                template,
                flags,
                color,
                segment.highlight_color.as_deref(),
            );
            segment
                .link_target
                .as_ref()
                .and_then(|target| link_rel_ids.get(target))
                .map(|rel_id| {
                    format!(
                        r#"<w:hyperlink r:id="{}">{run}</w:hyperlink>"#,
                        xml_attr_escape(rel_id)
                    )
                })
                .unwrap_or(run)
        })
        .filter(|run| !run.is_empty())
        .collect()
}

fn parse_inline_segments(text: &str) -> Vec<InlineSegment> {
    parse_inline_segments_with(text, InlineFlags::default(), None, None)
}

fn parse_inline_segments_with(
    text: &str,
    active_flags: InlineFlags,
    active_link: Option<String>,
    active_highlight_color: Option<String>,
) -> Vec<InlineSegment> {
    let mut segments = Vec::new();
    let mut index = 0;
    while index < text.len() {
        let rest = &text[index..];
        if let Some((label, target, consumed)) = parse_link(rest) {
            let mut flags = active_flags;
            flags.link = true;
            flags.underline = true;
            segments.extend(parse_inline_segments_with(
                label,
                flags,
                Some(target.to_string()),
                active_highlight_color.clone(),
            ));
            index += consumed;
            continue;
        }
        if let Some((content, consumed)) =
            parse_wrapped(rest, "**", "**").or_else(|| parse_wrapped(rest, "__", "__"))
        {
            let mut flags = active_flags;
            flags.bold = true;
            segments.extend(parse_inline_segments_with(
                content,
                flags,
                active_link.clone(),
                active_highlight_color.clone(),
            ));
            index += consumed;
            continue;
        }
        if let Some((content, consumed)) = parse_wrapped(rest, "`", "`") {
            let mut flags = active_flags;
            flags.code = true;
            segments.push(InlineSegment {
                text: content.to_string(),
                flags,
                link_target: active_link.clone(),
                highlight_color: active_highlight_color.clone(),
            });
            index += consumed;
            continue;
        }
        if let Some((content, consumed)) = parse_wrapped(rest, "~~", "~~") {
            let mut flags = active_flags;
            flags.strike = true;
            segments.extend(parse_inline_segments_with(
                content,
                flags,
                active_link.clone(),
                active_highlight_color.clone(),
            ));
            index += consumed;
            continue;
        }
        if let Some((content, consumed)) = parse_wrapped(rest, "<u>", "</u>") {
            let mut flags = active_flags;
            flags.underline = true;
            segments.extend(parse_inline_segments_with(
                content,
                flags,
                active_link.clone(),
                active_highlight_color.clone(),
            ));
            index += consumed;
            continue;
        }
        if let Some((content, color, consumed)) = parse_highlight(rest) {
            segments.extend(parse_inline_segments_with(
                content,
                active_flags,
                active_link.clone(),
                Some(color.to_string()),
            ));
            index += consumed;
            continue;
        }
        if let Some((content, consumed)) =
            parse_wrapped(rest, "*", "*").or_else(|| parse_wrapped(rest, "_", "_"))
        {
            let mut flags = active_flags;
            flags.italic = true;
            segments.extend(parse_inline_segments_with(
                content,
                flags,
                active_link.clone(),
                active_highlight_color.clone(),
            ));
            index += consumed;
            continue;
        }

        let next = next_inline_marker(rest).unwrap_or(rest.len());
        let end = index + next.max(1);
        push_inline_segment(
            &mut segments,
            InlineSegment {
                text: text[index..end].to_string(),
                flags: active_flags,
                link_target: active_link.clone(),
                highlight_color: active_highlight_color.clone(),
            },
        );
        index = end;
    }
    segments
}

fn push_inline_segment(segments: &mut Vec<InlineSegment>, segment: InlineSegment) {
    if segment.text.is_empty() {
        return;
    }
    if let Some(previous) = segments.last_mut() {
        if previous.flags == segment.flags
            && previous.link_target == segment.link_target
            && previous.highlight_color == segment.highlight_color
        {
            previous.text.push_str(&segment.text);
            return;
        }
    }
    segments.push(segment);
}

fn collect_docx_link_relationships(blocks: &[MarkdownBlock]) -> BTreeMap<String, String> {
    let mut targets = BTreeMap::new();
    for block in blocks {
        match block {
            MarkdownBlock::Heading { content, .. }
            | MarkdownBlock::Paragraph(content)
            | MarkdownBlock::ListItem { content, .. }
            | MarkdownBlock::Quote(content) => collect_link_targets(content, &mut targets),
            MarkdownBlock::Table { headers, rows } => {
                for cell in headers {
                    collect_link_targets(cell, &mut targets);
                }
                for row in rows {
                    for cell in row {
                        collect_link_targets(cell, &mut targets);
                    }
                }
            }
            MarkdownBlock::CodeBlock(_)
            | MarkdownBlock::HorizontalRule
            | MarkdownBlock::Diagram(_)
            | MarkdownBlock::Image { .. } => {}
        }
    }
    targets
        .into_keys()
        .enumerate()
        .map(|(index, target)| (target, format!("rIdLink{}", index + 1)))
        .collect()
}

fn collect_link_targets(markdown: &str, targets: &mut BTreeMap<String, ()>) {
    for segment in parse_inline_segments(markdown) {
        if let Some(target) = segment
            .link_target
            .filter(|target| is_external_link(target))
        {
            targets.insert(target, ());
        }
    }
}

fn docx_hyperlink_relationships_xml(link_rel_ids: &BTreeMap<String, String>) -> String {
    link_rel_ids
        .iter()
        .map(|(target, rel_id)| {
            format!(
                r#"<Relationship Id="{}" Target="{}" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"/>"#,
                xml_attr_escape(rel_id),
                xml_attr_escape(target)
            )
        })
        .collect::<String>()
}

fn is_external_link(target: &str) -> bool {
    let lower = target.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("mailto:")
}

fn parse_wrapped<'a>(value: &'a str, start: &str, end: &str) -> Option<(&'a str, usize)> {
    let content_start = value.strip_prefix(start)?;
    let close = content_start.find(end)?;
    if close == 0 {
        return None;
    }
    Some((&content_start[..close], start.len() + close + end.len()))
}

fn parse_link(value: &str) -> Option<(&str, &str, usize)> {
    let rest = value.strip_prefix('[')?;
    let label_end = rest.find("](")?;
    let target_start = label_end + 2;
    let target_end = find_markdown_link_close(&rest[target_start..])? + target_start;
    let target = parse_markdown_link_destination(&rest[target_start..target_end]).trim();
    if target.is_empty() {
        return None;
    }
    Some((&rest[..label_end], target, 1 + target_end + 1))
}

fn next_inline_marker(value: &str) -> Option<usize> {
    ["[", "**", "__", "~~", "`", "<u>", "<mark", "*", "_"]
        .iter()
        .filter_map(|marker| value.find(marker))
        .filter(|index| *index > 0)
        .min()
}

fn parse_highlight(value: &str) -> Option<(&str, &str, usize)> {
    let lower = value.to_ascii_lowercase();
    if !lower.starts_with("<mark") {
        return None;
    }
    let open_end = value.find('>')?;
    let close_start = lower[open_end + 1..].find("</mark>")? + open_end + 1;
    let open_tag = &value[..=open_end];
    let color = normalize_highlight_color_id(html_attr_value(open_tag, "data-knx-highlight"));
    Some((
        &value[open_end + 1..close_start],
        color,
        close_start + "</mark>".len(),
    ))
}

fn normalize_highlight_color_id(value: Option<&str>) -> &'static str {
    let Some(value) = value.map(str::trim) else {
        return DEFAULT_HIGHLIGHT_COLOR_ID;
    };
    HIGHLIGHT_COLORS
        .iter()
        .find(|(id, _)| *id == value)
        .map(|(id, _)| *id)
        .unwrap_or(DEFAULT_HIGHLIGHT_COLOR_ID)
}

fn highlight_color_hex(value: &str) -> &'static str {
    HIGHLIGHT_COLORS
        .iter()
        .find(|(id, _)| *id == value)
        .map(|(_, hex)| *hex)
        .unwrap_or("#FEF08A")
}

fn text_run(
    text: &str,
    style: &DocxTextStyle,
    template: &DocxTemplate,
    flags: InlineFlags,
) -> String {
    text_run_with_override(text, style, template, flags, None, None)
}

fn text_run_with_override(
    text: &str,
    style: &DocxTextStyle,
    _template: &DocxTemplate,
    flags: InlineFlags,
    color_override: Option<&str>,
    highlight_color: Option<&str>,
) -> String {
    if text.is_empty() {
        return String::new();
    }
    let preserve = if text.starts_with(char::is_whitespace)
        || text.ends_with(char::is_whitespace)
        || text.contains("  ")
    {
        r#" xml:space="preserve""#
    } else {
        ""
    };
    format!(
        r#"<w:r><w:rPr>{}</w:rPr><w:t{preserve}>{}</w:t></w:r>"#,
        run_properties_xml(style, color_override, flags, highlight_color),
        xml_escape(text)
    )
}

fn run_properties_xml(
    style: &DocxTextStyle,
    color_override: Option<&str>,
    flags: InlineFlags,
    highlight_color: Option<&str>,
) -> String {
    let color = color_value(color_override.unwrap_or(&style.color));
    let size = (style.font_size_pt * 2.0).round() as i32;
    let format = style.text_format.to_ascii_lowercase();
    let bold = flags.bold || format.contains("bold");
    let italic = flags.italic || format.contains("italic");
    let underline = flags.underline || format.contains("underline");
    let strike = flags.strike || format.contains("strike");
    let highlight = highlight_color
        .map(|color| {
            format!(
                r#"<w:shd w:val="clear" w:color="auto" w:fill="{}"/>"#,
                color_value(highlight_color_hex(color))
            )
        })
        .unwrap_or_default();
    format!(
        r#"<w:rFonts w:ascii="{}" w:hAnsi="{}" w:cs="{}"/><w:sz w:val="{size}"/><w:color w:val="{color}"/>{}{}{}{}{}{}"#,
        xml_attr_escape(&style.font_family),
        xml_attr_escape(&style.font_family),
        xml_attr_escape(&style.font_family),
        if bold { "<w:b/>" } else { "" },
        if italic { "<w:i/>" } else { "" },
        if underline {
            r#"<w:u w:val="single"/>"#
        } else {
            ""
        },
        if strike { "<w:strike/>" } else { "" },
        if flags.code {
            r#"<w:highlight w:val="lightGray"/>"#
        } else {
            ""
        },
        highlight,
    )
}

fn page_size_twips(template: &DocxTemplate) -> (i32, i32) {
    if template.page_size == "Letter" {
        (12240, 15840)
    } else {
        (11906, 16838)
    }
}

fn mm_to_twips(value: f64) -> i32 {
    (value * 56.692_913).round() as i32
}

fn color_value(value: &str) -> String {
    value.trim().trim_start_matches('#').to_ascii_uppercase()
}

fn decode_png_data_url(value: &str) -> Option<Vec<u8>> {
    let (_, data) = value.split_once(',')?;
    BASE64_STANDARD.decode(data.trim()).ok()
}

fn docx_image_paragraph(rel_id: &str, doc_pr_id: usize, name: &str, bytes: &[u8]) -> String {
    let (cx, cy) = docx_image_extent(bytes);
    let name = xml_attr_escape(name);
    format!(
        r#"<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="{cx}" cy="{cy}"/><wp:docPr id="{doc_pr_id}" name="{name}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="{doc_pr_id}" name="{name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{rel_id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>"#
    )
}

fn docx_image_extent(bytes: &[u8]) -> (i64, i64) {
    let max_width = 5_760_000_i64;
    let fallback = (max_width, 3_240_000_i64);
    let Some((width, height)) = image_dimensions(bytes) else {
        return fallback;
    };
    if width == 0 || height == 0 {
        return fallback;
    }
    let ratio = height as f64 / width as f64;
    let calculated_height = (max_width as f64 * ratio).round() as i64;
    (max_width, calculated_height.clamp(900_000, 7_200_000))
}

fn image_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    png_dimensions(bytes)
        .or_else(|| jpeg_dimensions(bytes))
        .or_else(|| gif_dimensions(bytes))
        .or_else(|| webp_dimensions(bytes))
}

fn png_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 24 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return None;
    }
    Some((
        u32::from_be_bytes(bytes[16..20].try_into().ok()?),
        u32::from_be_bytes(bytes[20..24].try_into().ok()?),
    ))
}

fn gif_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 10 || !bytes.starts_with(b"GIF") {
        return None;
    }
    Some((
        u16::from_le_bytes(bytes[6..8].try_into().ok()?) as u32,
        u16::from_le_bytes(bytes[8..10].try_into().ok()?) as u32,
    ))
}

fn jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 4 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut index = 2;
    while index + 9 < bytes.len() {
        if bytes[index] != 0xFF {
            index += 1;
            continue;
        }
        let marker = bytes[index + 1];
        index += 2;
        if marker == 0xD9 || marker == 0xDA {
            break;
        }
        if index + 2 > bytes.len() {
            break;
        }
        let segment_len = u16::from_be_bytes(bytes[index..index + 2].try_into().ok()?) as usize;
        if segment_len < 2 || index + segment_len > bytes.len() {
            break;
        }
        if matches!(marker, 0xC0..=0xC3 | 0xC5..=0xC7 | 0xC9..=0xCB | 0xCD..=0xCF)
            && segment_len >= 7
        {
            let height = u16::from_be_bytes(bytes[index + 3..index + 5].try_into().ok()?) as u32;
            let width = u16::from_be_bytes(bytes[index + 5..index + 7].try_into().ok()?) as u32;
            return Some((width, height));
        }
        index += segment_len;
    }
    None
}

fn webp_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 30 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return None;
    }
    if &bytes[12..16] == b"VP8X" && bytes.len() >= 30 {
        let width = 1 + u32::from_le_bytes([bytes[24], bytes[25], bytes[26], 0]);
        let height = 1 + u32::from_le_bytes([bytes[27], bytes[28], bytes[29], 0]);
        return Some((width, height));
    }
    None
}

fn image_extension(asset: &ExportImageAsset) -> &'static str {
    match asset.content_type.as_str() {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    }
}

fn find_image_asset<'a>(
    assets: &'a [ExportImageAsset],
    source: &str,
) -> Option<&'a ExportImageAsset> {
    assets.iter().find(|asset| asset.source == source)
}

fn image_asset_index(assets: &[ExportImageAsset], source: &str) -> Option<usize> {
    assets.iter().position(|asset| asset.source == source)
}

#[cfg(not(target_os = "android"))]
struct PdfRenderContext {
    doc: PdfDocument,
    pages: Vec<PdfPage>,
    ops: Vec<Op>,
    page_width_mm: f32,
    page_height_mm: f32,
    page_height_pt: f32,
    margin_left_pt: f32,
    margin_right_pt: f32,
    margin_top_pt: f32,
    margin_bottom_pt: f32,
    y: f32,
    regular_font: Option<FontId>,
    bold_font: Option<FontId>,
    mono_font: Option<FontId>,
}

#[cfg(not(target_os = "android"))]
fn print_pdf_with_diagrams_and_template(
    title: &str,
    markdown: &str,
    diagram_assets: &[DiagramAsset],
    image_assets: &[ExportImageAsset],
    template: &DocxTemplate,
) -> Option<Vec<u8>> {
    let mut context = PdfRenderContext::new(title, template);
    if template.include_title {
        context.render_wrapped_text(
            title,
            template.heading(1),
            0.0,
            template.heading(1).space_after_pt + 8.0,
        );
    }

    for block in markdown_blocks(markdown) {
        match block {
            MarkdownBlock::Heading { level, content } => {
                let style = template.heading(level);
                context.render_wrapped_markdown(
                    &content,
                    style,
                    0.0,
                    style.space_after_pt,
                    template,
                );
            }
            MarkdownBlock::Paragraph(content) => {
                context.render_wrapped_markdown(
                    &content,
                    &template.normal,
                    0.0,
                    template.normal.space_after_pt,
                    template,
                );
            }
            MarkdownBlock::ListItem {
                ordered,
                level,
                content,
            } => {
                let marker = if content.starts_with("[ ] ") {
                    "[ ] "
                } else if content.starts_with("[x] ") || content.starts_with("[X] ") {
                    "[x] "
                } else if ordered {
                    "1. "
                } else {
                    "- "
                };
                let content = content
                    .strip_prefix("[ ] ")
                    .or_else(|| content.strip_prefix("[x] "))
                    .or_else(|| content.strip_prefix("[X] "))
                    .unwrap_or(&content);
                let indent = 18.0 + (level as f32 * 14.0);
                context.render_wrapped_segments(
                    &prefixed_segments(marker, &parse_inline_segments(content)),
                    &template.normal,
                    indent,
                    template.normal.space_after_pt * 0.65,
                    template,
                );
            }
            MarkdownBlock::Quote(content) => {
                let mut quote_style = template.normal.clone();
                quote_style.color = "#6B7280".to_string();
                context.render_wrapped_markdown(
                    &content,
                    &quote_style,
                    18.0,
                    quote_style.space_after_pt,
                    template,
                );
            }
            MarkdownBlock::CodeBlock(content) => {
                for line in content.lines() {
                    context.render_wrapped_text(line, &template.code, 12.0, 0.0);
                }
                context.y -= template.space_after_pt as f32;
            }
            MarkdownBlock::HorizontalRule => {
                let mut rule_style = template.normal.clone();
                rule_style.color = template.horizontal_rule_color.clone();
                context.render_wrapped_text(
                    "________________________________________",
                    &rule_style,
                    0.0,
                    template.space_after_pt,
                );
            }
            MarkdownBlock::Table { headers, rows } => {
                context.render_table(&headers, &rows, template);
            }
            MarkdownBlock::Diagram(index) => {
                context.render_diagram(index, diagram_assets, template)?;
            }
            MarkdownBlock::Image { source, alt } => {
                context.render_export_image(&source, &alt, image_assets, template)?;
            }
        }
    }

    if context.ops.is_empty() {
        context.render_wrapped_text(title, &template.normal, 0.0, template.space_after_pt);
    }
    Some(context.finish())
}

#[cfg(not(target_os = "android"))]
impl PdfRenderContext {
    fn new(title: &str, template: &DocxTemplate) -> Self {
        let (page_width_mm, page_height_mm) = pdf_page_size_mm(template);
        let page_height_pt = mm_to_pt(page_height_mm as f64) as f32;
        let margin_top_pt = mm_to_pt(template.margin_top_mm) as f32;
        let mut doc = PdfDocument::new(title);
        let regular_font = load_pdf_font(&mut doc, PDF_REGULAR_FONT_CANDIDATES);
        let bold_font = load_pdf_font(&mut doc, PDF_BOLD_FONT_CANDIDATES);
        let mono_font = load_pdf_font(&mut doc, PDF_MONO_FONT_CANDIDATES);
        Self {
            doc,
            pages: Vec::new(),
            ops: Vec::new(),
            page_width_mm,
            page_height_mm,
            page_height_pt,
            margin_left_pt: mm_to_pt(template.margin_left_mm) as f32,
            margin_right_pt: mm_to_pt(template.margin_right_mm) as f32,
            margin_top_pt,
            margin_bottom_pt: mm_to_pt(template.margin_bottom_mm) as f32,
            y: page_height_pt - margin_top_pt,
            regular_font,
            bold_font,
            mono_font,
        }
    }

    fn content_width_pt(&self, indent_pt: f32) -> f32 {
        (mm_to_pt(self.page_width_mm as f64) as f32
            - self.margin_left_pt
            - self.margin_right_pt
            - indent_pt)
            .max(120.0)
    }

    fn ensure_space(&mut self, needed_pt: f32) {
        if self.y - needed_pt < self.margin_bottom_pt {
            self.end_page();
        }
    }

    fn end_page(&mut self) {
        if self.ops.is_empty() {
            self.y = self.page_height_pt - self.margin_top_pt;
            return;
        }
        self.pages.push(PdfPage::new(
            Mm(self.page_width_mm),
            Mm(self.page_height_mm),
            std::mem::take(&mut self.ops),
        ));
        self.y = self.page_height_pt - self.margin_top_pt;
    }

    fn render_wrapped_text(
        &mut self,
        text: &str,
        style: &DocxTextStyle,
        indent_pt: f32,
        after_pt: f64,
    ) {
        let segment = InlineSegment {
            text: text.to_string(),
            flags: InlineFlags::default(),
            link_target: None,
            highlight_color: None,
        };
        self.render_wrapped_segments(
            &[segment],
            style,
            indent_pt,
            after_pt,
            &DocxTemplate::from_value(None),
        );
    }

    fn render_wrapped_markdown(
        &mut self,
        markdown: &str,
        style: &DocxTextStyle,
        indent_pt: f32,
        after_pt: f64,
        template: &DocxTemplate,
    ) {
        self.render_wrapped_segments(
            &parse_inline_segments(markdown),
            style,
            indent_pt,
            after_pt,
            template,
        );
    }

    fn render_wrapped_segments(
        &mut self,
        segments: &[InlineSegment],
        style: &DocxTextStyle,
        indent_pt: f32,
        after_pt: f64,
        template: &DocxTemplate,
    ) {
        let font_size = style.font_size_pt as f32;
        let line_height = (font_size * 1.25).max(font_size + 3.0);
        let lines =
            wrap_inline_segments(segments, style, template, self.content_width_pt(indent_pt));
        self.y -= style.space_before_pt as f32;
        for line in lines {
            self.ensure_space(line_height);
            self.draw_inline_line(
                &line,
                self.margin_left_pt + indent_pt,
                self.y,
                style,
                template,
            );
            self.y -= line_height;
        }
        self.y -= after_pt as f32;
    }

    fn draw_inline_line(
        &mut self,
        segments: &[InlineSegment],
        mut x_pt: f32,
        y_pt: f32,
        base_style: &DocxTextStyle,
        template: &DocxTemplate,
    ) {
        for segment in segments {
            let style = pdf_segment_style(segment, base_style, template);
            let size = style.font_size_pt as f32;
            let mut flags = segment.flags;
            if segment.link_target.is_some() {
                flags.link = true;
                flags.underline = true;
            }
            let color = if segment.link_target.is_some() {
                pdf_color(&template.link_color)
            } else {
                pdf_color(&style.color)
            };
            let width = text_width_pt(&segment.text, size, flags.code);
            if let Some(highlight_color) = segment.highlight_color.as_deref() {
                self.draw_filled_rect(
                    x_pt - 1.0,
                    y_pt - size * 0.24,
                    width + 2.0,
                    size * 1.12,
                    pdf_color(highlight_color_hex(highlight_color)),
                );
            }
            self.draw_text_line(
                &segment.text,
                x_pt,
                y_pt,
                self.pdf_font_with_flags(&style, flags),
                size,
                color,
            );
            if flags.underline {
                self.draw_line(
                    x_pt,
                    y_pt - size * 0.18,
                    x_pt + width,
                    y_pt - size * 0.18,
                    pdf_color(&template.link_color),
                );
            }
            if flags.strike {
                self.draw_line(
                    x_pt,
                    y_pt + size * 0.32,
                    x_pt + width,
                    y_pt + size * 0.32,
                    pdf_color(&style.color),
                );
            }
            if let Some(target) = segment
                .link_target
                .as_deref()
                .filter(|target| is_external_link(target))
            {
                self.ops.push(Op::LinkAnnotation {
                    link: LinkAnnotation::new(
                        Rect::from_xywh(
                            Pt(x_pt),
                            Pt(y_pt - size * 0.25),
                            Pt(width.max(1.0)),
                            Pt(size * 1.25),
                        ),
                        Actions::uri(target.to_string()),
                        Some(BorderArray::Solid([0.0, 0.0, 0.0])),
                        Some(ColorArray::Transparent),
                        None,
                    ),
                });
            }
            x_pt += width;
        }
    }

    fn draw_text_line(
        &mut self,
        text: &str,
        x_pt: f32,
        y_pt: f32,
        font: PdfFontHandle,
        size: f32,
        color: Color,
    ) {
        self.ops.extend_from_slice(&[
            Op::StartTextSection,
            Op::SetTextCursor {
                pos: Point::new(Mm(x_pt * 25.4 / 72.0), Mm(y_pt * 25.4 / 72.0)),
            },
            Op::SetFont {
                font,
                size: Pt(size),
            },
            Op::SetLineHeight { lh: Pt(size + 3.0) },
            Op::SetFillColor { col: color },
            Op::ShowText {
                items: vec![TextItem::Text(text.to_string())],
            },
            Op::EndTextSection,
        ]);
    }

    fn render_table(&mut self, headers: &[String], rows: &[Vec<String>], template: &DocxTemplate) {
        if headers.is_empty() {
            return;
        }
        let columns = headers.len().min(8);
        let table_width = self.content_width_pt(0.0);
        let column_width = table_width / columns as f32;
        let padding = 4.0;
        let font_size = (template.normal.font_size_pt as f32 - 1.0).max(8.0);
        let line_height = (font_size * 1.2).max(font_size + 2.0);
        let text_color = pdf_color(&template.normal.color);
        let rule_color = pdf_color("#E5E7EB");
        let header_color = pdf_color("#111827");
        let mut header_style = template.normal.clone();
        header_style.text_format = "bold".to_string();
        header_style.font_size_pt = font_size as f64;
        let mut body_style = template.normal.clone();
        body_style.font_size_pt = font_size as f64;
        self.render_table_row(
            &normalize_table_row(headers.to_vec(), columns),
            columns,
            column_width,
            padding,
            line_height,
            &header_style,
            template,
            header_color,
            rule_color.clone(),
        );
        for row in rows {
            self.render_table_row(
                &normalize_table_row(row.clone(), columns),
                columns,
                column_width,
                padding,
                line_height,
                &body_style,
                template,
                text_color.clone(),
                rule_color.clone(),
            );
        }
        self.y -= template.space_after_pt as f32;
    }

    #[allow(clippy::too_many_arguments)]
    fn render_table_row(
        &mut self,
        cells: &[String],
        columns: usize,
        column_width: f32,
        padding: f32,
        line_height: f32,
        style: &DocxTextStyle,
        template: &DocxTemplate,
        color: Color,
        rule_color: Color,
    ) {
        let cell_width = (column_width - padding * 2.0).max(24.0);
        let wrapped = cells
            .iter()
            .take(columns)
            .map(|cell| {
                wrap_inline_segments(&parse_inline_segments(cell), style, template, cell_width)
            })
            .collect::<Vec<_>>();
        let line_count = wrapped.iter().map(Vec::len).max().unwrap_or(1).max(1);
        let row_height = line_count as f32 * line_height + padding * 2.0;
        self.ensure_space(row_height + 2.0);
        let row_top = self.y;
        let row_bottom = self.y - row_height;
        self.draw_horizontal_line(
            self.margin_left_pt,
            self.margin_left_pt + column_width * columns as f32,
            row_top,
            rule_color.clone(),
        );
        for column in 0..=columns {
            let x = self.margin_left_pt + column_width * column as f32;
            self.draw_vertical_line(x, row_top, row_bottom, rule_color.clone());
        }
        for (column, lines) in wrapped.iter().enumerate() {
            let x = self.margin_left_pt + column_width * column as f32 + padding;
            for (line_index, line) in lines.iter().enumerate() {
                let y =
                    row_top - padding - style.font_size_pt as f32 - line_index as f32 * line_height;
                let _ = &color;
                self.draw_inline_line(line, x, y, style, template);
            }
        }
        self.draw_horizontal_line(
            self.margin_left_pt,
            self.margin_left_pt + column_width * columns as f32,
            row_bottom,
            rule_color,
        );
        self.y -= row_height;
    }

    fn draw_horizontal_line(&mut self, x_start: f32, x_end: f32, y: f32, color: Color) {
        self.draw_line(x_start, y, x_end, y, color);
    }

    fn draw_vertical_line(&mut self, x: f32, y_start: f32, y_end: f32, color: Color) {
        self.draw_line(x, y_start, x, y_end, color);
    }

    fn draw_line(&mut self, x_start: f32, y_start: f32, x_end: f32, y_end: f32, color: Color) {
        self.ops.extend_from_slice(&[
            Op::SetOutlineColor { col: color },
            Op::SetOutlineThickness { pt: Pt(0.5) },
            Op::DrawLine {
                line: Line {
                    points: vec![
                        LinePoint {
                            p: Point {
                                x: Pt(x_start),
                                y: Pt(y_start),
                            },
                            bezier: false,
                        },
                        LinePoint {
                            p: Point {
                                x: Pt(x_end),
                                y: Pt(y_end),
                            },
                            bezier: false,
                        },
                    ],
                    is_closed: false,
                },
            },
        ]);
    }

    fn draw_filled_rect(&mut self, x: f32, y: f32, width: f32, height: f32, color: Color) {
        let points = vec![
            (Point { x: Pt(x), y: Pt(y) }, false),
            (Point { x: Pt(x + width), y: Pt(y) }, false),
            (Point { x: Pt(x + width), y: Pt(y + height) }, false),
            (Point { x: Pt(x), y: Pt(y + height) }, false),
        ];
        let mut polygon: Polygon = points.into_iter().collect();
        polygon.mode = PaintMode::Fill;
        polygon.winding_order = WindingOrder::NonZero;
        self.ops.extend_from_slice(&[
            Op::SetFillColor { col: color },
            Op::DrawPolygon { polygon },
        ]);
    }

    fn render_diagram(
        &mut self,
        index: usize,
        diagram_assets: &[DiagramAsset],
        template: &DocxTemplate,
    ) -> Option<()> {
        let Some(asset) = diagram_assets
            .get(index)
            .filter(|asset| !asset.png.is_empty())
        else {
            return Some(());
        };
        let mut warnings = Vec::new();
        let image = RawImage::decode_from_bytes(&asset.png, &mut warnings).ok()?;
        let natural_width_pt = image.width as f32 * 72.0 / 144.0;
        let natural_height_pt = image.height as f32 * 72.0 / 144.0;
        let max_width = self.content_width_pt(0.0);
        let scale = (max_width / natural_width_pt).min(1.0);
        let image_height = natural_height_pt * scale;
        self.ensure_space(image_height + 28.0);
        let image_id = self.doc.add_image(&image);
        self.ops.push(Op::UseXobject {
            id: image_id,
            transform: XObjectTransform {
                translate_x: Some(Pt(self.margin_left_pt)),
                translate_y: Some(Pt(self.y - image_height)),
                scale_x: Some(scale),
                scale_y: Some(scale),
                dpi: Some(144.0),
                ..XObjectTransform::default()
            },
        });
        self.y -= image_height + 8.0;
        if let Some(caption) = asset
            .caption
            .as_ref()
            .filter(|caption| !caption.trim().is_empty())
        {
            let mut caption_style = template.normal.clone();
            caption_style.font_size_pt = (caption_style.font_size_pt - 1.0).max(8.0);
            caption_style.color = "#6B7280".to_string();
            self.render_wrapped_text(caption.trim(), &caption_style, 0.0, template.space_after_pt);
        } else {
            self.y -= template.space_after_pt as f32;
        }
        Some(())
    }

    fn render_export_image(
        &mut self,
        source: &str,
        alt: &str,
        image_assets: &[ExportImageAsset],
        template: &DocxTemplate,
    ) -> Option<()> {
        let Some(asset) = find_image_asset(image_assets, source) else {
            self.render_wrapped_text(
                &format!("[Imagen no disponible: {alt}]"),
                &template.normal,
                0.0,
                template.space_after_pt,
            );
            return Some(());
        };
        if !self.render_raw_image(&asset.bytes, template) {
            self.render_wrapped_text(
                &format!(
                    "[Imagen no compatible: {}]",
                    asset.alt.as_deref().unwrap_or(alt)
                ),
                &template.normal,
                0.0,
                template.space_after_pt,
            );
            return Some(());
        }
        let caption = asset.alt.as_deref().unwrap_or(alt).trim();
        if !caption.is_empty() {
            let mut caption_style = template.normal.clone();
            caption_style.font_size_pt = (caption_style.font_size_pt - 1.0).max(8.0);
            caption_style.color = "#6B7280".to_string();
            self.render_wrapped_text(caption, &caption_style, 0.0, template.space_after_pt);
        } else {
            self.y -= template.space_after_pt as f32;
        }
        Some(())
    }

    fn render_raw_image(&mut self, bytes: &[u8], template: &DocxTemplate) -> bool {
        if bytes.is_empty() {
            return false;
        }
        let mut warnings = Vec::new();
        let Ok(image) = RawImage::decode_from_bytes(bytes, &mut warnings) else {
            return false;
        };
        let natural_width_pt = image.width as f32 * 72.0 / 144.0;
        let natural_height_pt = image.height as f32 * 72.0 / 144.0;
        if natural_width_pt <= 0.0 || natural_height_pt <= 0.0 {
            return false;
        }
        let max_width = self.content_width_pt(0.0);
        let scale = (max_width / natural_width_pt).min(1.0);
        let image_height = natural_height_pt * scale;
        self.ensure_space(image_height + 28.0);
        let image_id = self.doc.add_image(&image);
        self.ops.push(Op::UseXobject {
            id: image_id,
            transform: XObjectTransform {
                translate_x: Some(Pt(self.margin_left_pt)),
                translate_y: Some(Pt(self.y - image_height)),
                scale_x: Some(scale),
                scale_y: Some(scale),
                dpi: Some(144.0),
                ..XObjectTransform::default()
            },
        });
        self.y -= image_height + template.space_after_pt as f32;
        true
    }

    fn finish(mut self) -> Vec<u8> {
        self.end_page();
        self.doc
            .with_pages(self.pages)
            .save(&PdfSaveOptions::default(), &mut Vec::new())
    }

    fn pdf_font_with_flags(&self, style: &DocxTextStyle, flags: InlineFlags) -> PdfFontHandle {
        let family = style.font_family.to_ascii_lowercase();
        let format = style.text_format.to_ascii_lowercase();
        let bold = flags.bold || format.contains("bold");
        let external =
            if family.contains("courier") || family.contains("consolas") || family.contains("mono")
            {
                self.mono_font.as_ref().or(self.regular_font.as_ref())
            } else if bold {
                self.bold_font.as_ref().or(self.regular_font.as_ref())
            } else {
                self.regular_font.as_ref()
            };
        external
            .cloned()
            .map(PdfFontHandle::External)
            .unwrap_or_else(|| PdfFontHandle::Builtin(pdf_builtin_font_with_flags(style, flags)))
    }
}

#[cfg(not(target_os = "android"))]
fn pdf_page_size_mm(template: &DocxTemplate) -> (f32, f32) {
    if template.page_size == "Letter" {
        (215.9, 279.4)
    } else {
        (210.0, 297.0)
    }
}

#[cfg(not(target_os = "android"))]
const PDF_REGULAR_FONT_CANDIDATES: &[&str] = &[
    r"C:\Windows\Fonts\segoeui.ttf",
    r"C:\Windows\Fonts\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
];

#[cfg(not(target_os = "android"))]
const PDF_BOLD_FONT_CANDIDATES: &[&str] = &[
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
];

#[cfg(not(target_os = "android"))]
const PDF_MONO_FONT_CANDIDATES: &[&str] = &[
    r"C:\Windows\Fonts\consola.ttf",
    r"C:\Windows\Fonts\cour.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/Library/Fonts/Courier New.ttf",
    "/System/Library/Fonts/Supplemental/Courier New.ttf",
];

#[cfg(not(target_os = "android"))]
fn load_pdf_font(doc: &mut PdfDocument, candidates: &[&str]) -> Option<FontId> {
    for candidate in candidates {
        let Ok(bytes) = std::fs::read(candidate) else {
            continue;
        };
        let mut warnings = Vec::new();
        if let Some(font) = ParsedFont::from_bytes(&bytes, 0, &mut warnings) {
            return Some(doc.add_font(&font));
        }
    }
    None
}

#[cfg(not(target_os = "android"))]
fn pdf_builtin_font_with_flags(style: &DocxTextStyle, flags: InlineFlags) -> BuiltinFont {
    let family = style.font_family.to_ascii_lowercase();
    let format = style.text_format.to_ascii_lowercase();
    let bold = flags.bold || format.contains("bold");
    if family.contains("courier") || family.contains("consolas") || family.contains("mono") {
        if bold {
            BuiltinFont::CourierBold
        } else {
            BuiltinFont::Courier
        }
    } else if family.contains("times") || family.contains("georgia") {
        if bold {
            BuiltinFont::TimesBold
        } else {
            BuiltinFont::TimesRoman
        }
    } else if bold {
        BuiltinFont::HelveticaBold
    } else {
        BuiltinFont::Helvetica
    }
}

#[cfg(not(target_os = "android"))]
fn pdf_color(value: &str) -> Color {
    let hex = color_value(value);
    if hex.len() != 6 {
        return Color::Rgb(Rgb {
            r: 0.0,
            g: 0.0,
            b: 0.0,
            icc_profile: None,
        });
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0) as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0) as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0) as f32 / 255.0;
    Color::Rgb(Rgb {
        r,
        g,
        b,
        icc_profile: None,
    })
}

fn mm_to_pt(value: f64) -> f64 {
    value * 72.0 / 25.4
}

#[cfg(test)]
fn wrap_text(text: &str, width_pt: f32, font_size: f32) -> Vec<String> {
    let clean = text.trim();
    if clean.is_empty() {
        return Vec::new();
    }
    let max_chars = (width_pt / (font_size * 0.52)).floor().max(12.0) as usize;
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in clean.split_whitespace() {
        let next_len = current.len() + usize::from(!current.is_empty()) + word.len();
        if next_len > max_chars && !current.is_empty() {
            lines.push(std::mem::take(&mut current));
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

fn wrap_inline_segments(
    segments: &[InlineSegment],
    base_style: &DocxTextStyle,
    template: &DocxTemplate,
    width_pt: f32,
) -> Vec<Vec<InlineSegment>> {
    let mut lines: Vec<Vec<InlineSegment>> = Vec::new();
    let mut current: Vec<InlineSegment> = Vec::new();
    let mut current_width = 0.0_f32;
    for segment in segments {
        for word in segment.text.split_whitespace() {
            let mut token = segment.clone();
            token.text = if current.is_empty() {
                word.to_string()
            } else {
                format!(" {word}")
            };
            let style = pdf_segment_style(&token, base_style, template);
            let token_width =
                text_width_pt(&token.text, style.font_size_pt as f32, token.flags.code);
            if current_width + token_width > width_pt && !current.is_empty() {
                lines.push(std::mem::take(&mut current));
                current_width = 0.0;
                token.text = word.to_string();
            }
            let style = pdf_segment_style(&token, base_style, template);
            let token_width =
                text_width_pt(&token.text, style.font_size_pt as f32, token.flags.code);
            push_inline_segment(&mut current, token);
            current_width += token_width;
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

fn text_width_pt(text: &str, font_size: f32, mono: bool) -> f32 {
    let factor = if mono { 0.58 } else { 0.52 };
    text.chars().count() as f32 * font_size * factor
}

fn pdf_segment_style(
    segment: &InlineSegment,
    base_style: &DocxTextStyle,
    template: &DocxTemplate,
) -> DocxTextStyle {
    let mut style = if segment.flags.code {
        template.code.clone()
    } else {
        base_style.clone()
    };
    if segment.flags.link || segment.link_target.is_some() {
        style.color = template.link_color.clone();
    }
    style
}

fn prefixed_segments(prefix: &str, segments: &[InlineSegment]) -> Vec<InlineSegment> {
    let mut prefixed = vec![InlineSegment {
        text: prefix.to_string(),
        flags: InlineFlags::default(),
        link_target: None,
        highlight_color: None,
    }];
    prefixed.extend_from_slice(segments);
    prefixed
}

#[cfg(test)]
fn plain_markdown_text(value: &str) -> String {
    let mut output = value.to_string();
    while let Some(start) = output.find("![") {
        let Some(alt_end) = output[start + 2..].find(']').map(|index| start + 2 + index) else {
            break;
        };
        let target_start = alt_end + 1;
        if !output[target_start..].starts_with('(') {
            break;
        }
        let Some(target_end) = find_markdown_link_close(&output[target_start + 1..])
            .map(|index| target_start + 1 + index)
        else {
            break;
        };
        let alt = output[start + 2..alt_end].to_string();
        output.replace_range(start..=target_end, &alt);
    }
    while let Some(start) = output.find('[') {
        let Some(label_end) = output[start + 1..]
            .find("](")
            .map(|index| start + 1 + index)
        else {
            break;
        };
        let target_start = label_end + 2;
        let Some(target_end) = output[target_start..]
            .find(')')
            .map(|index| target_start + index)
        else {
            break;
        };
        let label = output[start + 1..label_end].to_string();
        output.replace_range(start..=target_end, &label);
    }
    while let Some(start) = output.to_ascii_lowercase().find("<mark") {
        let Some(end) = output[start..].find('>').map(|index| start + index) else {
            break;
        };
        output.replace_range(start..=end, "");
    }
    for marker in ["**", "__", "~~", "`", "<u>", "</u>", "</mark>", "*", "_"] {
        output = output.replace(marker, "");
    }
    output
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

fn xml_attr_escape(value: &str) -> String {
    xml_escape(value).replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn inline_parser_recognizes_mark_highlight_and_normalizes_color() {
        let segments = parse_inline_segments(
            r#"Base <mark data-knx-highlight="green">texto **clave**</mark> y <mark data-knx-highlight="purple">otro</mark>"#,
        );

        assert!(segments
            .iter()
            .any(|segment| segment.text == "texto " && segment.highlight_color.as_deref() == Some("green")));
        assert!(segments
            .iter()
            .any(|segment| segment.text == "clave" && segment.flags.bold && segment.highlight_color.as_deref() == Some("green")));
        assert!(segments
            .iter()
            .any(|segment| segment.text == "otro" && segment.highlight_color.as_deref() == Some("yellow")));
    }

    #[test]
    fn docx_export_writes_highlight_shading() {
        let path = std::env::temp_dir().join(format!(
            "{}.docx",
            knownext_core::compact_id("knownext-docs-highlight-test")
        ));
        let markdown = r#"# Documento

Texto con <mark data-knx-highlight="pink">resaltado</mark>.
"#;

        write_docx(&path, markdown).unwrap();

        let file = std::fs::File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut document_xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document_xml)
            .unwrap();

        assert!(document_xml.contains(r#"<w:shd w:val="clear" w:color="auto" w:fill="FBCFE8"/>"#));
        assert!(document_xml.contains("resaltado"));

        let _ = std::fs::remove_file(path);
    }

    #[cfg(not(target_os = "android"))]
    #[test]
    fn pdf_render_draws_highlight_background_polygon() {
        let template = DocxTemplate::from_value(None);
        let mut context = PdfRenderContext::new("Highlight", &template);

        context.render_wrapped_markdown(
            r#"Texto <mark data-knx-highlight="yellow">resaltado largo</mark>"#,
            &template.normal,
            0.0,
            0.0,
            &template,
        );

        assert!(context
            .ops
            .iter()
            .any(|operation| matches!(operation, Op::DrawPolygon { .. })));
    }

    #[test]
    fn docx_export_embeds_rendered_mermaid_diagram_png() {
        let png = BASE64_STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=")
            .unwrap();
        let path = std::env::temp_dir().join(format!(
            "{}.docx",
            knownext_core::compact_id("knownext-docs-test")
        ));
        let markdown = "# Documento\n\n```mermaid\nflowchart TD\n  A --> B\n```\n";
        let assets = vec![DiagramAsset {
            caption: Some("Flujo principal".to_string()),
            png,
        }];

        write_docx_with_diagrams(&path, markdown, &assets).unwrap();

        let file = std::fs::File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut document_xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document_xml)
            .unwrap();

        assert!(archive.by_name("word/media/diagram-1.png").is_ok());
        assert!(document_xml.contains("rIdDiagram1"));
        assert!(document_xml.contains("Flujo principal"));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn docx_export_embeds_markdown_image_assets() {
        let png = BASE64_STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAADcG2hMAAAAD0lEQVR42mP8z8BQDwAFgwJ/lx8a3wAAAABJRU5ErkJggg==")
            .unwrap();
        let path = std::env::temp_dir().join(format!(
            "{}.docx",
            knownext_core::compact_id("knownext-docs-image-test")
        ));
        let markdown = "# Documento\n\n![Pixel de prueba](assets/pixel.png)\n";
        let image_assets = vec![ExportImageAsset {
            source: "assets/pixel.png".to_string(),
            alt: Some("Pixel de prueba".to_string()),
            content_type: "image/png".to_string(),
            bytes: png,
        }];

        write_docx_with_assets_template_and_title(&path, markdown, &[], &image_assets, None, None)
            .unwrap();

        let file = std::fs::File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut document_xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document_xml)
            .unwrap();
        let mut rels_xml = String::new();
        archive
            .by_name("word/_rels/document.xml.rels")
            .unwrap()
            .read_to_string(&mut rels_xml)
            .unwrap();

        assert!(archive.by_name("word/media/image-1.png").is_ok());
        assert!(document_xml.contains("rIdImage1"));
        assert!(document_xml.contains("Pixel de prueba"));
        assert!(rels_xml.contains("media/image-1.png"));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn docx_export_maps_markdown_blocks_to_configured_docx_styles() {
        let path = std::env::temp_dir().join(format!(
            "{}.docx",
            knownext_core::compact_id("knownext-docs-style-test")
        ));
        let markdown = "# Titulo\n\nTexto con **negrita**, *cursiva*, ~~tachado~~, <u>subrayado</u>, `codigo` y [enlace](https://knownext.ai).\n\n- [x] Item uno\n\n> Cita clave\n\n```text\nlet value = 1;\n```\n\n---\n";
        let template = json!({
            "page": { "size": "Letter", "margins": { "topMm": 10, "rightMm": 11, "bottomMm": 12, "leftMm": 13 } },
            "normal": { "fontFamily": "Calibri", "fontSizePt": 12, "color": "#222222", "textFormat": "normal" },
            "headingFontFamily": "Georgia",
            "headings": {
                "h1": { "fontFamily": "Georgia", "fontSizePt": 24, "color": "#123456", "textFormat": "bold", "spaceBeforePt": 14, "spaceAfterPt": 9 }
            },
            "code": { "fontFamily": "Consolas", "fontSizePt": 9, "color": "#333333", "textFormat": "normal" },
            "paragraph": { "lineSpacing": 1.5, "spaceBeforePt": 2, "spaceAfterPt": 8 },
            "document": { "includeTitle": true, "linkColor": "#D85A12", "horizontalRuleColor": "#E5E7EB" }
        });

        write_docx_with_diagrams_template_and_title(
            &path,
            markdown,
            &[],
            Some(&template),
            Some("Documento configurado"),
        )
        .unwrap();

        let file = std::fs::File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut document_xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document_xml)
            .unwrap();
        let mut styles_xml = String::new();
        archive
            .by_name("word/styles.xml")
            .unwrap()
            .read_to_string(&mut styles_xml)
            .unwrap();
        let mut rels_xml = String::new();
        archive
            .by_name("word/_rels/document.xml.rels")
            .unwrap()
            .read_to_string(&mut rels_xml)
            .unwrap();

        assert!(document_xml.contains(r#"<w:pStyle w:val="Heading1"/>"#));
        assert!(document_xml.contains(r#"<w:pStyle w:val="CodeBlock"/>"#));
        assert!(document_xml.contains(r#"<w:ind w:left="720" w:hanging="360"/>"#));
        assert!(document_xml.contains(r#"<w:pgSz w:w="12240" w:h="15840"/>"#));
        assert!(document_xml
            .contains(r#"<w:pgMar w:top="567" w:right="624" w:bottom="680" w:left="737""#));
        assert!(document_xml.contains(
            r#"<w:spacing w:before="280" w:after="180" w:line="360" w:lineRule="auto"/>"#
        ));
        assert!(document_xml.contains(
            r#"<w:spacing w:before="40" w:after="160" w:line="360" w:lineRule="auto"/>"#
        ));
        assert!(document_xml.contains("Documento configurado"));
        assert!(document_xml.contains(r#"<w:b/>"#));
        assert!(document_xml.contains(r#"<w:i/>"#));
        assert!(document_xml.contains(r#"<w:strike/>"#));
        assert!(document_xml.contains(r#"<w:highlight w:val="lightGray"/>"#));
        assert!(document_xml.contains(r#"<w:u w:val="single"/>"#));
        assert!(document_xml.contains(r#"<w:color w:val="D85A12"/>"#));
        assert!(document_xml.contains(r#"<w:hyperlink r:id="rIdLink1">"#));
        assert!(document_xml.contains("☑"));
        assert!(styles_xml.contains(r#"w:styleId="Heading1""#));
        assert!(styles_xml.contains(r#"w:ascii="Georgia""#));
        assert!(styles_xml.contains(r#"<w:sz w:val="48"/>"#));
        assert!(styles_xml.contains(r#"<w:color w:val="123456"/>"#));
        assert!(rels_xml.contains(r#"Target="https://knownext.ai""#));
        assert!(rels_xml.contains(r#"TargetMode="External""#));
        assert!(rels_xml.contains(r#"relationships/hyperlink""#));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn markdown_parser_detects_pipe_tables() {
        let markdown =
            "| Control | Aplicacion practica |\n| --- | --- |\n| Revision | Evidencia trazable |\n";
        let blocks = markdown_blocks(markdown);
        assert!(matches!(
            blocks.first(),
            Some(MarkdownBlock::Table { headers, rows }) if headers.len() == 2 && rows.len() == 1
        ));
    }

    #[test]
    fn inline_parser_preserves_editor_styles_and_links() {
        let segments = parse_inline_segments("Texto **negrita**, *cursiva*, ~~tachado~~, <u>subrayado</u>, `codigo` y [web](https://knownext.ai).");

        assert!(segments
            .iter()
            .any(|segment| segment.text == "negrita" && segment.flags.bold));
        assert!(segments
            .iter()
            .any(|segment| segment.text == "cursiva" && segment.flags.italic));
        assert!(segments
            .iter()
            .any(|segment| segment.text == "tachado" && segment.flags.strike));
        assert!(segments
            .iter()
            .any(|segment| segment.text == "subrayado" && segment.flags.underline));
        assert!(segments
            .iter()
            .any(|segment| segment.text == "codigo" && segment.flags.code));
        assert!(segments.iter().any(|segment| segment.text == "web"
            && segment.link_target.as_deref() == Some("https://knownext.ai")));
    }

    #[test]
    fn docx_export_writes_markdown_tables_as_word_tables() {
        let path = std::env::temp_dir().join(format!(
            "{}.docx",
            knownext_core::compact_id("knownext-docs-table-test")
        ));
        let markdown = "# Tabla\n\n| Control | Aplicación práctica |\n| --- | --- |\n| Revisión | Certificación y aprobación |\n";

        write_docx(&path, markdown).unwrap();

        let file = std::fs::File::open(&path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        let mut document_xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document_xml)
            .unwrap();

        assert!(document_xml.contains("<w:tbl>"));
        assert!(document_xml.contains("Aplicación práctica"));
        assert!(!document_xml.contains("| --- |"));

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn pdf_export_uses_markdown_blocks_and_template_settings() {
        let markdown = "# Investigación PDF\n\nPárrafo largo con **negrita**, *cursiva*, ~~tachado~~, <u>subrayado</u>, `código` y [enlace](https://knownext.ai) para comprobar que el texto se envuelve en varias líneas y conserva acentos.\n\n| Control | Aplicación práctica |\n| --- | --- |\n| **Revisión** | [Certificación](https://knownext.ai/docs) y aprobación |\n\n- Primer punto\n- Segundo punto\n\n> Cita visible\n\n```text\nlet value = 1;\n```\n";
        let template = json!({
            "page": { "size": "Letter", "margins": { "topMm": 10, "rightMm": 11, "bottomMm": 12, "leftMm": 13 } },
            "normal": { "fontFamily": "Calibri", "fontSizePt": 12, "color": "#222222", "textFormat": "normal" },
            "headingFontFamily": "Georgia",
            "headings": {
                "h1": { "fontFamily": "Georgia", "fontSizePt": 24, "color": "#123456", "textFormat": "bold" }
            },
            "code": { "fontFamily": "Consolas", "fontSizePt": 9, "color": "#333333", "textFormat": "normal" },
            "paragraph": { "lineSpacing": 1.5, "spaceAfterPt": 8 },
            "document": { "includeTitle": true, "linkColor": "#D85A12", "horizontalRuleColor": "#E5E7EB" }
        });

        let image = ExportImageAsset {
            source: "assets/pixel.png".to_string(),
            alt: Some("Pixel PDF".to_string()),
            content_type: "image/png".to_string(),
            bytes: BASE64_STANDARD
                .decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAQAAADcG2hMAAAAD0lEQVR42mP8z8BQDwAFgwJ/lx8a3wAAAABJRU5ErkJggg==")
                .unwrap(),
        };
        let bytes = minimal_pdf_with_assets_and_template(
            "Documento PDF",
            &format!("{markdown}\n\n![Pixel PDF](assets/pixel.png)\n"),
            &[],
            &[image],
            Some(&template),
        );

        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.len() > 2_000);
        let pdf_text = String::from_utf8_lossy(&bytes);
        assert!(pdf_text.contains("/URI"));
        assert!(pdf_text.contains("https://knownext.ai"));
        assert!(markdown_blocks(markdown)
            .iter()
            .any(|block| matches!(block, MarkdownBlock::Table { headers, rows } if headers.len() == 2 && rows.len() == 1)));
        assert_eq!(
            plain_markdown_text("Texto con **negrita**, `codigo` y [enlace](https://knownext.ai)."),
            "Texto con negrita, codigo y enlace."
        );
        assert!(wrap_text(
            "Parrafo largo que necesita partirse en varias lineas para conservar estructura visual.",
            120.0,
            12.0
        )
        .len()
            > 1);
    }
}
