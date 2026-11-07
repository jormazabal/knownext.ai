use tauri::Url;
pub(crate) fn allowed(url: &Url, development: bool) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    if url.as_str() == "about:blank" {
        return true;
    }
    match (url.scheme(), url.host_str()) {
        ("tauri", Some("localhost")) => true,
        ("http" | "https", Some("tauri.localhost")) => url.port().is_none(),
        ("http", Some("127.0.0.1" | "10.0.2.2")) if development => url.port() == Some(1420),
        _ => false,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn security_block_navigation_is_local_and_never_accepts_lookalikes_or_credentials() {
        for s in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/index.html",
            "https://tauri.localhost/",
        ] {
            assert!(allowed(&Url::parse(s).unwrap(), false), "{s}");
        }
        for s in [
            "https://example.com",
            "javascript:alert(1)",
            "file:///C:/secret.txt",
            "data:text/html,hi",
            "https://tauri.localhost.evil/",
            "https://user:pass@tauri.localhost/",
            "http://127.0.0.1:1420/",
        ] {
            assert!(!allowed(&Url::parse(s).unwrap(), false), "{s}");
        }
        assert!(allowed(
            &Url::parse("http://127.0.0.1:1420/").unwrap(),
            true
        ));
    }
}
