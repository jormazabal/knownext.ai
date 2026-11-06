//! Portable image geometry, kept outside the Markdown alternative text.
use pulldown_cmark::{Event, Parser, Tag, TagEnd};

const PREFIX: &str = "<!-- knownext-image:";

pub(super) fn single_image(markdown: &str) -> Option<(String, String, String)> {
    let mut events = Parser::new(markdown);
    if !matches!(events.next()?, Event::Start(Tag::Paragraph)) {
        return None;
    }
    let Event::Start(Tag::Image {
        dest_url, title, ..
    }) = events.next()?
    else {
        return None;
    };
    let source = dest_url.into_string();
    let mut alt = String::new();
    for event in events.by_ref() {
        match event {
            Event::End(TagEnd::Image) => break,
            Event::Text(text) | Event::Code(text) => alt.push_str(&text),
            Event::SoftBreak | Event::HardBreak => alt.push(' '),
            Event::Start(Tag::Emphasis | Tag::Strong | Tag::Strikethrough)
            | Event::End(TagEnd::Emphasis | TagEnd::Strong | TagEnd::Strikethrough) => {}
            _ => return None,
        }
    }
    if source.is_empty()
        || !matches!(events.next()?, Event::End(TagEnd::Paragraph))
        || events.next().is_some()
    {
        return None;
    }
    Some((alt, source, title.into_string()))
}

fn annotation(line: &str) -> bool {
    let text = line.trim();
    text.starts_with(PREFIX) && text.ends_with("-->") && !text[..text.len() - 3].contains("-->")
}

fn explicit_ratio(line: &str) -> Option<f64> {
    if line.chars().count() > 1024 || !annotation(line) {
        return None;
    }
    let text = line.trim();
    let value: serde_json::Value =
        serde_json::from_str(text[PREFIX.len()..text.len() - 3].trim()).ok()?;
    let object = value.as_object()?;
    let ratio = object.get("ratio")?.as_f64()?;
    (object.len() == 2
        && object.get("version")?.as_u64()? == 1
        && ratio.is_finite()
        && (0.01..=4.0).contains(&ratio))
    .then_some(ratio)
}

/// Consume only complete owned HTML comments adjacent to this image. Unknown
/// versions remain untouched in the source, but never become exported prose.
/// Multiple/future/invalid annotations cannot override geometry.
pub(super) fn after_image(lines: &[&str], alt: &str) -> (f64, usize) {
    let legacy = alt
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(1.0)
        .clamp(0.01, 4.0);
    let mut at = 0;
    let mut count = 0;
    let mut candidate = None;
    while at < lines.len() {
        let mut next = at;
        while next < lines.len() && lines[next].trim().is_empty() {
            next += 1;
        }
        if next == lines.len() || !annotation(lines[next]) {
            break;
        }
        count += 1;
        if count == 1 {
            candidate = explicit_ratio(lines[next]);
        }
        at = next + 1;
    }
    (
        if count == 1 {
            candidate.unwrap_or(legacy)
        } else {
            legacy
        },
        at,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_alt_destination_and_title_are_parsed_as_markdown() {
        assert_eq!(
            single_image(r#"![Pixel \[A\] &amp; B](<assets/image (1).png> "Título")"#),
            Some((
                "Pixel [A] & B".into(),
                "assets/image (1).png".into(),
                "Título".into()
            ))
        );
        assert!(single_image("![A](a.png) texto").is_none());
        assert!(single_image("![A](a.png) ![B](b.png)").is_none());
    }

    #[test]
    fn only_one_supported_annotation_can_supply_geometry() {
        let good = "<!-- knownext-image: {\"version\":1,\"ratio\":0.25} -->";
        assert_eq!(
            after_image(&["", good, "", "Texto"], "Descriptivo"),
            (0.25, 2)
        );
        assert_eq!(after_image(&[good, good], "0.5"), (0.5, 2));
        for raw in [
            "{\"version\":2,\"ratio\":0.2}",
            "{\"version\":1,\"ratio\":0}",
            "{\"version\":1,\"ratio\":0.2,\"extra\":true}",
            "inválido",
        ] {
            let comment = format!("{PREFIX} {raw} -->");
            assert_eq!(after_image(&[&comment], "0.5"), (0.5, 1));
        }
        assert_eq!(
            after_image(&["<!-- knownext-image: incompleto"], "Texto"),
            (1.0, 0)
        );
        assert_eq!(after_image(&["<!-- otro -->"], "Texto"), (1.0, 0));
        let oversized = format!("{PREFIX} {} -->", " ".repeat(1025));
        assert_eq!(after_image(&[&oversized], "Texto"), (1.0, 1));
    }
}
