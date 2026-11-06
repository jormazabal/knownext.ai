//! A bounded text excerpt, with no HTML, media loading or executable markup.
pub fn markdown_excerpt(markdown: &str, max_chars: usize) -> (String, bool) {
    use pulldown_cmark::{Event, Parser, TagEnd};
    let mut text = String::new();
    let mut length = 0;
    for event in Parser::new(markdown) {
        let chunk = match event {
            Event::Text(value) | Event::Code(value) => value.to_string(),
            Event::SoftBreak
            | Event::HardBreak
            | Event::End(TagEnd::Paragraph | TagEnd::Heading(_)) => "\n".to_owned(),
            _ => continue,
        };
        for ch in chunk.chars() {
            if length >= max_chars {
                return (text, true);
            }
            text.push(ch);
            length += 1;
        }
    }
    (text, false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn excerpts_text_without_executable_html_and_respects_unicode_boundaries() {
        let (text, truncated) = markdown_excerpt(
            "# Título\n\n**Texto** [enlace](https://example.test/)\n\n<script>secret()</script>",
            2000,
        );
        assert!(text.contains("Título\n"));
        assert!(text.contains("Texto enlace"));
        assert!(!text.contains("<script>"));
        assert!(!text.contains("secret()"));
        assert!(!truncated);
        assert_eq!(markdown_excerpt("áéíóú", 3), ("áéí".to_owned(), true));
    }
}
