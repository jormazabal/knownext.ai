use super::*;

pub(super) fn local_target(document_path: &str, target: &str) -> Option<String> {
    let target = target.trim();
    let private_asset = knownext_asset_url_relative(target).is_some();
    let has_scheme = target.split_once(':').is_some_and(|(scheme, _)| {
        !scheme.is_empty()
            && scheme.as_bytes()[0].is_ascii_alphabetic()
            && scheme
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"+-.".contains(&b))
    });
    if !private_asset && (has_scheme || target.starts_with("//")) {
        return None;
    }
    resolve_markdown_asset_target(document_path, &target.replace('+', "%2B"))
}

pub(super) fn rewrite(
    markdown: &str,
    old: &str,
    new: &str,
    mappings: &BTreeMap<String, String>,
) -> String {
    let mut output = markdown.to_string();
    for span in knownext_docs::markdown_destinations(markdown)
        .into_iter()
        .rev()
    {
        let target = span.target.trim();
        let Some(previous) = local_target(old, target) else {
            continue;
        };
        let next = mappings
            .get(&previous)
            .map(String::as_str)
            .unwrap_or(&previous);
        if old == new && previous == next {
            continue;
        }
        let suffix = target
            .find(['?', '#'])
            .map(|at| &target[at..])
            .unwrap_or("");
        let path = relative_link_target(new, next);
        let mut encoded = String::new();
        for byte in path.bytes() {
            if byte.is_ascii_alphanumeric() || b"/._-~".contains(&byte) {
                encoded.push(byte as char);
            } else {
                encoded.push_str(&format!("%{byte:02X}"));
            }
        }
        encoded.push_str(suffix);
        output.replace_range(span.range, &encoded);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn document_links_keep_anchors_queries_code_and_external_destinations() {
        let input="[file](../old.md?q=1#section \"Title\") ![image](../pic.png#view) [plus](../C++.md) [site](HTTPS://example.test/old.md) [network](//example.test/old.md)\n\n`[example](../old.md)`\n\n```md\n[x](../old.md)\n```\n\n[ref][r]\n\n[r]: ../old.md#anchor\n";
        let mapping = BTreeMap::from([
            ("old.md".into(), "new name.md".into()),
            ("C++.md".into(), "New++.md".into()),
        ]);
        let result = rewrite(input, "docs/source.md", "other/deep/source.md", &mapping);
        assert!(result.contains("[file](../../new%20name.md?q=1#section \"Title\")"));
        assert!(result.contains("![image](../../pic.png#view)"));
        assert!(result.contains("[plus](../../New%2B%2B.md)"));
        assert!(
            result.contains("HTTPS://example.test/old.md")
                && result.contains("//example.test/old.md")
        );
        assert!(
            result.contains("`[example](../old.md)`") && result.contains("```md\n[x](../old.md)")
        );
        assert!(result.contains("[r]: ../../new%20name.md#anchor"));
    }
}
