use pulldown_cmark::{Event, LinkType, Options, Parser, Tag, TagEnd};
use std::ops::Range;

#[derive(Debug)]
pub struct MarkdownDestination {
    pub range: Range<usize>,
    pub source_range: Range<usize>,
    pub target: String,
    pub is_image: bool,
}

/// Source spans let callers change only destinations, retaining document formatting.
pub fn markdown_destinations(markdown: &str) -> Vec<MarkdownDestination> {
    let parser = Parser::new_ext(
        markdown,
        Options::ENABLE_TABLES
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_FOOTNOTES
            | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS,
    );
    let mut spans = vec![];
    for (_, definition) in parser.reference_definitions().iter() {
        if let Some(range) = destination_span(&markdown[definition.span.clone()], true) {
            spans.push(MarkdownDestination {
                range: range.start + definition.span.start..range.end + definition.span.start,
                source_range: definition.span.clone(),
                target: definition.dest.to_string(),
                is_image: false,
            });
        }
    }
    let mut html_state = HtmlState::default();
    let mut pending_html: Option<Range<usize>> = None;
    for (event, span) in parser.into_offset_iter() {
        if matches!(&event, Event::Html(_) | Event::InlineHtml(_)) {
            if let Some(pending) = pending_html
                .as_mut()
                .filter(|pending| pending.end == span.start)
            {
                pending.end = span.end;
            } else {
                flush_html(markdown, &mut pending_html, &mut spans, &mut html_state);
                pending_html = Some(span);
            }
            continue;
        }
        flush_html(markdown, &mut pending_html, &mut spans, &mut html_state);
        let image_target = match &event {
            Event::Start(Tag::Image { dest_url, .. }) => Some(dest_url.as_ref()),
            _ => None,
        };
        if let Some(target) = image_target {
            for existing in spans.iter_mut().filter(|span| span.target == target) {
                existing.is_image = true;
            }
        }
        let is_image = image_target.is_some();
        match event {
            Event::Start(
                Tag::Link {
                    link_type: LinkType::Inline,
                    dest_url,
                    ..
                }
                | Tag::Image {
                    link_type: LinkType::Inline,
                    dest_url,
                    ..
                },
            ) if !html_state.comment && html_state.raw_tag.is_none() => {
                if let Some(range) = destination_span(&markdown[span.clone()], false) {
                    spans.push(MarkdownDestination {
                        range: range.start + span.start..range.end + span.start,
                        source_range: span.clone(),
                        target: dest_url.to_string(),
                        is_image,
                    });
                }
            }
            Event::Start(Tag::Link {
                link_type: LinkType::Autolink | LinkType::Email,
                dest_url,
                ..
            }) if !html_state.comment && html_state.raw_tag.is_none() => {
                spans.push(MarkdownDestination {
                    range: span.start + 1..span.end.saturating_sub(1),
                    source_range: span,
                    target: dest_url.to_string(),
                    is_image: false,
                });
            }
            _ => {}
        }
    }
    flush_html(markdown, &mut pending_html, &mut spans, &mut html_state);
    spans.sort_by_key(|span| span.range.start);
    spans.dedup_by(|a, b| a.range == b.range);
    spans
}

#[derive(Debug)]
pub struct MarkdownImage {
    pub source: String,
    pub alt: String,
    pub range: Range<usize>,
    pub kind: &'static str,
}

/// Actual rendered image occurrences, including reference definitions and HTML,
/// without treating code, comments or script examples as export dependencies.
pub fn markdown_images(markdown: &str) -> Vec<MarkdownImage> {
    let parser = Parser::new_ext(
        markdown,
        Options::ENABLE_TABLES
            | Options::ENABLE_TASKLISTS
            | Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_FOOTNOTES
            | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS,
    );
    let mut images = Vec::new();
    let mut html = Vec::new();
    let mut html_state = HtmlState::default();
    let mut pending_html: Option<Range<usize>> = None;
    let mut pending: Option<MarkdownImage> = None;
    let mut depth = 0;
    for (event, span) in parser.into_offset_iter() {
        if matches!(&event, Event::Html(_) | Event::InlineHtml(_)) {
            // HTML inside an image description is not another rendered image.
            if depth > 0 {
                continue;
            }
            if let Some(previous) = pending_html
                .as_mut()
                .filter(|previous| previous.end == span.start)
            {
                previous.end = span.end;
            } else {
                flush_html(markdown, &mut pending_html, &mut html, &mut html_state);
                pending_html = Some(span);
            }
            continue;
        }
        flush_html(markdown, &mut pending_html, &mut html, &mut html_state);
        match event {
            Event::Start(Tag::Image { dest_url, .. })
                if !html_state.comment && html_state.raw_tag.is_none() =>
            {
                if depth == 0 {
                    pending = Some(MarkdownImage {
                        source: dest_url.into_string(),
                        alt: String::new(),
                        range: span,
                        kind: "markdown-image",
                    });
                }
                depth += 1;
            }
            Event::End(TagEnd::Image) if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    if let Some(image) = pending.take() {
                        images.push(image);
                    }
                }
            }
            Event::Text(text) | Event::Code(text) if pending.is_some() => {
                pending.as_mut().unwrap().alt.push_str(&text)
            }
            Event::SoftBreak | Event::HardBreak if pending.is_some() => {
                pending.as_mut().unwrap().alt.push(' ')
            }
            _ => {}
        }
    }
    flush_html(markdown, &mut pending_html, &mut html, &mut html_state);
    for image in html.into_iter().filter(|image| image.is_image) {
        let alt = super::html_attr_value(&markdown[image.source_range.clone()], "alt")
            .unwrap_or("")
            .to_string();
        images.push(MarkdownImage {
            source: image.target,
            alt,
            range: image.source_range,
            kind: "html-image",
        });
    }
    images.sort_by_key(|image| image.range.start);
    images
}

fn destination_span(source: &str, definition: bool) -> Option<Range<usize>> {
    let bytes = source.as_bytes();
    let mut index = source.len() - source.trim_start().len();
    if bytes.get(index) == Some(&b'!') {
        index += 1;
    }
    if bytes.get(index) != Some(&b'[') {
        return None;
    }
    index += 1;
    let mut depth = 1;
    while index < bytes.len() && depth > 0 {
        match bytes[index] {
            b'\\' => {
                index += 2;
                continue;
            }
            b'[' => depth += 1,
            b']' => depth -= 1,
            b'`' => {
                let start = index;
                while bytes.get(index) == Some(&b'`') {
                    index += 1;
                }
                let ticks = &source[start..index];
                if let Some(end) = source[index..].find(ticks) {
                    index += end + ticks.len();
                }
                continue;
            }
            _ => {}
        }
        index += 1;
    }
    if depth != 0 || bytes.get(index) != Some(&(if definition { b':' } else { b'(' })) {
        return None;
    }
    index += 1;
    while bytes.get(index).is_some_and(u8::is_ascii_whitespace) {
        index += 1;
    }
    if bytes.get(index) == Some(&b'<') {
        let start = index + 1;
        index = start;
        while index < bytes.len() {
            if bytes[index] == b'\\' {
                index += 2;
                continue;
            }
            if bytes[index] == b'>' {
                return Some(start..index);
            }
            index += 1;
        }
        return None;
    }
    let start = index;
    let mut depth = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'\\' => {
                index += 2;
                continue;
            }
            b'(' => depth += 1,
            b')' if depth == 0 => break,
            b')' => depth -= 1,
            byte if byte.is_ascii_whitespace() && depth == 0 => break,
            _ => {}
        }
        index += 1;
    }
    (index <= bytes.len()).then_some(start..index)
}

#[derive(Default)]
struct HtmlState {
    comment: bool,
    raw_tag: Option<&'static str>,
}

fn flush_html(
    markdown: &str,
    pending: &mut Option<Range<usize>>,
    spans: &mut Vec<MarkdownDestination>,
    state: &mut HtmlState,
) {
    if let Some(span) = pending.take() {
        html_destinations(&markdown[span.clone()], span.start, spans, state);
    }
}

fn html_tag_end(raw: &str, mut index: usize) -> usize {
    let bytes = raw.as_bytes();
    let mut quote = None;
    while index < bytes.len() {
        match (quote, bytes[index]) {
            (Some(q), b) if q == b => quote = None,
            (None, b'\'' | b'"') => quote = Some(bytes[index]),
            (None, b'>') => return index + 1,
            _ => {}
        }
        index += 1;
    }
    bytes.len()
}

fn html_destinations(
    raw: &str,
    offset: usize,
    spans: &mut Vec<MarkdownDestination>,
    state: &mut HtmlState,
) {
    let bytes = raw.as_bytes();
    let lower = raw.to_ascii_lowercase();
    let mut index = 0;
    while index < bytes.len() {
        if state.comment {
            let Some(end) = raw[index..].find("-->") else {
                return;
            };
            index += end + 3;
            state.comment = false;
            continue;
        }
        if let Some(tag) = state.raw_tag {
            let closing = format!("</{tag}");
            let mut search = index;
            let mut found = None;
            while let Some(relative) = lower[search..].find(&closing) {
                let start = search + relative;
                let after = start + closing.len();
                if bytes.get(after).is_some_and(|byte| {
                    byte.is_ascii_whitespace() || *byte == b'>' || *byte == b'/'
                }) {
                    found = Some(start);
                    break;
                }
                search = after;
            }
            let Some(start) = found else {
                return;
            };
            index = html_tag_end(raw, start + closing.len());
            state.raw_tag = None;
            continue;
        }
        if raw[index..].starts_with("<!--") {
            state.comment = true;
            index += 4;
            continue;
        }
        if bytes[index] != b'<' {
            index += raw[index..].chars().next().unwrap().len_utf8();
            continue;
        }
        index += 1;
        let tag_start = index;
        while bytes
            .get(index)
            .is_some_and(|b| b.is_ascii_alphanumeric() || b"-:_".contains(b))
        {
            index += 1;
        }
        let tag = raw[tag_start..index].to_ascii_lowercase();
        if let Some(raw_tag) = ["script", "style", "textarea", "pre"]
            .into_iter()
            .find(|value| *value == tag)
        {
            state.raw_tag = Some(raw_tag);
            index = html_tag_end(raw, index);
            continue;
        }
        let attr = match tag.as_str() {
            "img" => "src",
            "a" => "href",
            _ => {
                index = html_tag_end(raw, index);
                continue;
            }
        };
        while index < bytes.len() && bytes[index] != b'>' {
            while bytes.get(index).is_some_and(u8::is_ascii_whitespace) {
                index += 1;
            }
            if index >= bytes.len() || bytes[index] == b'>' {
                break;
            }
            let start = index;
            while bytes
                .get(index)
                .is_some_and(|b| b.is_ascii_alphanumeric() || *b == b'-' || *b == b'_')
            {
                index += 1;
            }
            if start == index {
                index += raw[index..].chars().next().unwrap().len_utf8();
                continue;
            }
            let name = &raw[start..index];
            while bytes.get(index).is_some_and(u8::is_ascii_whitespace) {
                index += 1;
            }
            if bytes.get(index) != Some(&b'=') {
                continue;
            }
            index += 1;
            while bytes.get(index).is_some_and(u8::is_ascii_whitespace) {
                index += 1;
            }
            let quote = bytes
                .get(index)
                .copied()
                .filter(|b| matches!(b, b'\'' | b'"'));
            if quote.is_some() {
                index += 1;
            }
            let start = index;
            while index < bytes.len()
                && (if let Some(quote) = quote {
                    bytes[index] != quote
                } else {
                    !bytes[index].is_ascii_whitespace() && bytes[index] != b'>'
                })
            {
                index += 1;
            }
            if name.eq_ignore_ascii_case(attr) {
                spans.push(MarkdownDestination {
                    range: offset + start..offset + index,
                    source_range: offset + tag_start - 1..offset + html_tag_end(raw, tag_start - 1),
                    target: raw[start..index].to_string(),
                    is_image: tag == "img",
                });
            }
            if quote.is_some() && index < bytes.len() {
                index += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn markdown_link_spans_preserve_frontmatter_multiline_comments_and_script_examples() {
        let input="---\nlink: '[hidden](hidden.md)'\n---\n\n<!--\n<img src='comment.png'>\n-->\n\n<div><script>const sample = '<img src=\"script.png\">';</script></div>\n\n[real](real.md)\n";
        let targets = markdown_destinations(input)
            .into_iter()
            .map(|span| span.target)
            .collect::<Vec<_>>();
        assert_eq!(targets, vec!["real.md"]);
    }

    #[test]
    fn markdown_link_spans_do_not_treat_custom_tags_or_quoted_markup_as_resources() {
        let input="<div title=\"\n<img src='attribute.png'>\n\"><img src='actual.png'></div>\n\n<script-editor><a href='custom.md'>Custom</a></script-editor>\n\nText <script>const sample='[fake](inline.md)';</script> [real](real.md)\n";
        let targets = markdown_destinations(input)
            .into_iter()
            .map(|span| span.target)
            .collect::<Vec<_>>();
        assert_eq!(targets, vec!["actual.png", "custom.md", "real.md"]);
    }
    #[test]
    fn markdown_link_spans_exclude_code_and_preserve_titles_labels_and_definitions() {
        let input="[a [nested]](<docs/a b.md#part> \"Title\") ![image](pic.png)\n\n[reference][r]\n\n[r]: docs/old.md \"Reference title\"\n\n`[code](ignored.md)`\n\n```md\n![sample](ignored.png)\n```\n\n<!-- <img src=\"ignored-comment.png\"> -->\n\n<a href=\"docs/link.md#anchor\">x</a> <img src='pic2.png'>\n";
        let spans = markdown_destinations(input);
        let targets = spans
            .iter()
            .map(|span| span.target.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            targets,
            vec![
                "docs/a b.md#part",
                "pic.png",
                "docs/old.md",
                "docs/link.md#anchor",
                "pic2.png"
            ]
        );
        for span in spans {
            assert_eq!(&input[span.range], span.target);
        }
    }
}
