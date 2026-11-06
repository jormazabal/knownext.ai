//! Window authority is supplied by Tauri, never by a frontend request field.
pub fn allows_local_api(window: &str, method: &str, path: &str) -> bool {
    if window == "main" {
        return true;
    }
    if window != "recordings" || method != "GET" {
        return false;
    }
    let parts: Vec<_> = path
        .split('?')
        .next()
        .unwrap_or("")
        .trim_matches('/')
        .split('/')
        .collect();
    matches!(
        parts.as_slice(),
        ["health"] | ["api", "projects"] | ["api", "projects", _, "tree"]
    )
}
pub fn allows_workspace_command(window: &str) -> bool {
    window == "main"
}
pub fn allows_recording_command(window: &str) -> bool {
    matches!(window, "main" | "recordings")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tray_can_select_a_destination_but_cannot_read_content_or_mutate_the_workspace() {
        for route in ["/health", "/api/projects", "/api/projects/p/tree"] {
            assert!(allows_local_api("recordings", "GET", route));
        }
        for (method, path) in [
            ("GET", "/api/documents/p%3A%3Asecret.md"),
            ("GET", "/api/config"),
            ("PUT", "/api/credentials/openai-key"),
            ("POST", "/api/projects/p/nodes/batch/plan"),
            ("POST", "/api/auth/logout"),
            ("GET", "/api/projects/p/tree/extra"),
        ] {
            assert!(!allows_local_api("recordings", method, path));
        }
        assert!(!allows_local_api("unknown", "GET", "/api/projects"));
        assert!(!allows_workspace_command("recordings"));
        assert!(allows_recording_command("recordings"));
        assert!(allows_local_api(
            "main",
            "POST",
            "/api/projects/p/nodes/batch/plan"
        ));
    }
}

#[cfg(test)]
mod security_tests {
    use super::*;
    #[test]
    fn security_block_private_surfaces_are_denied_to_recorder_and_unknown_windows() {
        for window in ["recordings", "other", ""] {
            for (method, path) in [
                ("GET", "/api/security/credentials"),
                ("POST", "/api/security/credentials"),
                ("GET", "/api/security/controls"),
                ("GET", "/api/projects/p/ai/privacy"),
                ("POST", "/api/projects/p/ai/privacy/apply"),
                ("GET", "/api/ai/results"),
                ("GET", "/api/runtime/diagnostics"),
            ] {
                assert!(!allows_local_api(window, method, path), "{window} {path}");
            }
            assert!(!allows_workspace_command(window));
        }
        assert!(allows_local_api(
            "main",
            "POST",
            "/api/security/credentials"
        ));
    }
}
