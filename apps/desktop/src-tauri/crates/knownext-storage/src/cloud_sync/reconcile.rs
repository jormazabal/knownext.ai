//! Three-way content decision without Git, clocks, network or destructive effects.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Decision {
    Unchanged,
    KeepLocal,
    TakeRemote,
    Equivalent,
    Conflict,
}
pub(super) fn reconcile(base: Option<&str>, local: Option<&str>, remote: Option<&str>) -> Decision {
    if local == remote {
        if local == base {
            Decision::Unchanged
        } else {
            Decision::Equivalent
        }
    } else if local == base {
        Decision::TakeRemote
    } else if remote == base {
        Decision::KeepLocal
    } else {
        Decision::Conflict
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cloud_sync_concurrent_edits_and_delete_versus_edit_preserve_both() {
        assert_eq!(
            reconcile(Some("base"), Some("a"), Some("b")),
            Decision::Conflict
        );
        assert_eq!(reconcile(Some("base"), None, Some("b")), Decision::Conflict);
    }
    #[test]
    fn cloud_sync_duplicates_and_unilateral_changes_are_deterministic() {
        assert_eq!(reconcile(None, Some("a"), Some("a")), Decision::Equivalent);
        assert_eq!(
            reconcile(Some("base"), Some("base"), None),
            Decision::TakeRemote
        );
        assert_eq!(
            reconcile(Some("base"), Some("a"), Some("base")),
            Decision::KeepLocal
        );
        assert_eq!(reconcile(None, None, None), Decision::Unchanged);
    }
}
