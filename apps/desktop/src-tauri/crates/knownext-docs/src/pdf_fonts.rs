//! Bundled, unmodified OFL fonts: identical offline resources on every platform.
use super::*;
use std::collections::BTreeSet;

pub(super) fn select(style: &DocxTextStyle, flags: InlineFlags) -> (&'static str, &'static [u8]) {
    let family = style.font_family.to_ascii_lowercase();
    let format = style.text_format.to_ascii_lowercase();
    let bold = flags.bold || format.contains("bold");
    let italic = flags.italic || format.contains("italic");
    if flags.code
        || family.contains("courier")
        || family.contains("consolas")
        || family.contains("mono")
    {
        return if bold {
            (
                "mono-bold",
                include_bytes!("../assets/fonts/NotoSansMono-Bold.ttf"),
            )
        } else {
            (
                "mono",
                include_bytes!("../assets/fonts/NotoSansMono-Regular.ttf"),
            )
        };
    }
    if family.contains("times")
        || family.contains("georgia")
        || family.contains("serif") && !family.contains("sans")
    {
        return match (bold, italic) {
            (false, false) => (
                "serif",
                include_bytes!("../assets/fonts/NotoSerif-Regular.ttf"),
            ),
            (true, false) => (
                "serif-bold",
                include_bytes!("../assets/fonts/NotoSerif-Bold.ttf"),
            ),
            (false, true) => (
                "serif-italic",
                include_bytes!("../assets/fonts/NotoSerif-Italic.ttf"),
            ),
            (true, true) => (
                "serif-bold-italic",
                include_bytes!("../assets/fonts/NotoSerif-BoldItalic.ttf"),
            ),
        };
    }
    match (bold, italic) {
        (false, false) => (
            "sans",
            include_bytes!("../assets/fonts/NotoSans-Regular.ttf"),
        ),
        (true, false) => (
            "sans-bold",
            include_bytes!("../assets/fonts/NotoSans-Bold.ttf"),
        ),
        (false, true) => (
            "sans-italic",
            include_bytes!("../assets/fonts/NotoSans-Italic.ttf"),
        ),
        (true, true) => (
            "sans-bold-italic",
            include_bytes!("../assets/fonts/NotoSans-BoldItalic.ttf"),
        ),
    }
}
pub(super) struct RegisteredFont {
    pub id: FontId,
    pub characters: BTreeSet<u32>,
}
pub(super) fn advances(text: &str, style: &DocxTextStyle, flags: InlineFlags) -> Vec<(char, f32)> {
    let (_, bytes) = select(style, flags);
    let Ok(face) = ttf_parser::Face::parse(bytes, 0) else {
        return Vec::new();
    };
    let scale = style.font_size_pt as f32 / face.units_per_em() as f32;
    text.chars()
        .map(|ch| {
            let width = face
                .glyph_index(ch)
                .and_then(|glyph| face.glyph_hor_advance(glyph))
                .unwrap_or(face.units_per_em() / 2);
            (ch, width as f32 * scale)
        })
        .collect()
}
pub(super) fn width(text: &str, style: &DocxTextStyle, flags: InlineFlags) -> f32 {
    advances(text, style, flags)
        .iter()
        .map(|(_, width)| width)
        .sum()
}
pub(super) fn register(doc: &mut PdfDocument, bytes: &[u8]) -> Result<RegisteredFont, String> {
    let face =
        ttf_parser::Face::parse(bytes, 0).map_err(|_| "La fuente PDF incluida no es válida")?;
    let mut codepoints = BTreeMap::new();
    let mut widths = BTreeMap::new();
    for table in face
        .tables()
        .cmap
        .into_iter()
        .flat_map(|cmap| cmap.subtables)
        .filter(|table| table.is_unicode())
    {
        table.codepoints(|codepoint| {
            if let Some(glyph) = char::from_u32(codepoint).and_then(|ch| face.glyph_index(ch)) {
                codepoints.insert(codepoint, glyph.0);
                if let Some(width) = face.glyph_hor_advance(glyph) {
                    widths.insert(glyph.0, width);
                }
            }
        });
    }
    let characters = codepoints.keys().copied().collect();
    let bounds = face.global_bounding_box();
    let mut parsed = ParsedFont::with_glyph_data(
        bytes.to_vec(),
        0,
        None,
        codepoints,
        widths,
        face.units_per_em(),
        printpdf::FontMetrics {
            ascent: face.ascender(),
            descent: face.descender(),
        },
    );
    parsed.pdf_font_metrics = printpdf::PdfFontMetricsStub {
        units_per_em: face.units_per_em(),
        x_min: bounds.x_min,
        y_min: bounds.y_min,
        x_max: bounds.x_max,
        y_max: bounds.y_max,
    };
    Ok(RegisteredFont {
        id: doc.add_font(&parsed),
        characters,
    })
}
