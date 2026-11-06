//! Backup preparation uses its own bounded admission, outside the editor mutex.
pub fn is_scheduled_backup_work(method: &str, path: &str) -> bool {
    let parts: Vec<_> = path
        .split('?')
        .next()
        .unwrap_or("")
        .trim_matches('/')
        .split('/')
        .collect();
    matches!(
        (method, parts.as_slice()),
        ("POST", ["api", "projects", _, "scheduled-backups", "run"])
            | (
                "POST",
                ["api", "projects", _, "scheduled-backups", _, "restore"]
            )
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn block9_only_backup_effects_bypass_editor_mutex() {
        assert!(is_scheduled_backup_work(
            "POST",
            "/api/projects/p/scheduled-backups/run"
        ));
        assert!(is_scheduled_backup_work(
            "POST",
            "/api/projects/p/scheduled-backups/2/restore"
        ));
        assert!(!is_scheduled_backup_work(
            "GET",
            "/api/projects/p/scheduled-backups/2"
        ));
        assert!(!is_scheduled_backup_work(
            "PUT",
            "/api/projects/p/scheduled-backups"
        ));
        assert!(!is_scheduled_backup_work(
            "POST",
            "/api/projects/p/scheduled-backups/2/commit"
        ));
    }
}
