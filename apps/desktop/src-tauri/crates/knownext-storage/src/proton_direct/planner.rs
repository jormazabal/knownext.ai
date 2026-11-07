//! Pure three-way decision; the caller owns snapshot, draft and review checks.
//! `reviewed` is supplied only after its local/remote fingerprints were checked.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Decision {
    Same,
    Keep,
    Write,
    Delete,
    Both,
    Conflict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DirectoryDecision {
    Same,
    Keep,
    Create,
    RemoveIfEmpty,
}

/// A directory tombstone needs the same observed base as a file deletion.
/// The caller must additionally verify identity and emptiness before removal.
pub(crate) fn directory(
    local: bool,
    remote: bool,
    base: Option<bool>,
    causal: bool,
) -> DirectoryDecision {
    use DirectoryDecision::*;
    if local == remote {
        return Same;
    }
    if base == Some(remote) {
        return Keep;
    }
    if local == base.unwrap_or(false) && causal {
        return if remote { Create } else { RemoveIfEmpty };
    }
    Keep
}

pub(crate) fn decide(
    local: Option<&str>,
    remote: Option<&str>,
    base: Option<&str>,
    causal: bool,
    draft: bool,
    reviewed: Option<&str>,
) -> Decision {
    if local == remote {
        // No document write is needed, so an unsaved draft remains untouched.
        return Decision::Same;
    }
    if draft {
        return Decision::Conflict;
    }
    if let Some(choice) = reviewed {
        return match choice {
            "local" => Decision::Keep,
            "remote" if remote.is_some() => Decision::Write,
            "remote" => Decision::Delete,
            "both" if remote.is_some() => Decision::Both,
            _ => Decision::Conflict,
        };
    }
    if remote == base {
        // The received side has no content change relative to the base.
        return Decision::Keep;
    }
    if local == base && causal {
        return if remote.is_some() {
            Decision::Write
        } else {
            Decision::Delete
        };
    }
    // A sender head alone is not proof that this path's base is an ancestor.
    Decision::Conflict
}

/// Select a locally published snapshot that the incoming publication proves it
/// observed. The caller passes the verified ancestor chain nearest-first and
/// supplies the hash for this exact path (None means absent in that snapshot).
/// Never turn an unrelated branch into evidence, or rewind past the existing
/// shared base. Publishing alone must not change the shared base.
pub(crate) fn observed_own_base<'a>(
    current_base_publication: Option<&str>,
    ordered_ancestors: &'a [(&'a str, &'a str, Option<&'a str>)],
    device_id: &str,
) -> Option<(&'a str, Option<&'a str>)> {
    let base_index = match current_base_publication {
        Some(base) => ordered_ancestors
            .iter()
            .position(|(id, _, _)| *id == base)?,
        None => ordered_ancestors.len(),
    };
    ordered_ancestors[..base_index]
        .iter()
        .find(|(_, sender, _)| *sender == device_id)
        .map(|(publication, _, hash)| (*publication, *hash))
}

#[cfg(test)]
mod tests {
    use super::{decide, observed_own_base, Decision::*};

    #[test]
    fn directory_removal_needs_an_observed_present_base() {
        use super::{directory, DirectoryDecision::*};
        assert_eq!(directory(true, false, Some(true), true), RemoveIfEmpty);
        assert_eq!(directory(true, false, Some(true), false), Keep);
        assert_eq!(directory(true, false, None, true), Keep);
        assert_eq!(directory(true, false, Some(false), true), Keep);
    }
    #[test]
    fn directory_local_deletion_and_causal_tombstones_are_preserved() {
        use super::{directory, DirectoryDecision::*};
        assert_eq!(directory(false, true, Some(true), true), Keep);
        assert_eq!(directory(false, true, Some(false), false), Keep);
        assert_eq!(directory(false, true, Some(false), true), Create);
        assert_eq!(directory(false, false, Some(true), false), Same);
    }

    #[test]
    fn same_content_never_needs_a_write_even_with_draft() {
        assert_eq!(
            decide(Some("same"), Some("same"), Some("old"), false, true, None),
            Same
        );
        assert_eq!(decide(None, None, Some("old"), false, true, None), Same);
    }

    #[test]
    fn new_remote_file_can_be_received_from_a_verified_empty_base() {
        assert_eq!(decide(None, Some("new"), None, true, false, None), Write);
    }

    #[test]
    fn known_descendant_updates_an_unchanged_local_document() {
        assert_eq!(
            decide(Some("base"), Some("new"), Some("base"), true, false, None),
            Write
        );
    }

    #[test]
    fn foreign_branch_does_not_overwrite_a_base_it_did_not_observe() {
        assert_eq!(
            decide(
                Some("third-replica-base"),
                Some("foreign-edit"),
                Some("third-replica-base"),
                false,
                false,
                None
            ),
            Conflict
        );
    }

    #[test]
    fn unchanged_remote_preserves_local_edits_even_without_causal_proof() {
        assert_eq!(
            decide(
                Some("local-edit"),
                Some("base"),
                Some("base"),
                false,
                false,
                None
            ),
            Keep
        );
        assert_eq!(
            decide(Some("local-addition"), None, None, false, false, None),
            Keep
        );
    }

    #[test]
    fn concurrent_content_changes_preserve_both_variants_for_review() {
        assert_eq!(
            decide(
                Some("local"),
                Some("remote"),
                Some("base"),
                true,
                false,
                None
            ),
            Conflict
        );
    }

    #[test]
    fn verified_remote_deletion_requires_unchanged_local_base() {
        assert_eq!(
            decide(Some("base"), None, Some("base"), true, false, None),
            Delete
        );
        assert_eq!(
            decide(Some("edited"), None, Some("base"), true, false, None),
            Conflict
        );
        assert_eq!(
            decide(Some("base"), None, Some("base"), false, false, None),
            Conflict
        );
    }

    #[test]
    fn local_deletion_against_remote_edit_needs_review() {
        assert_eq!(
            decide(None, Some("remote-edit"), Some("base"), true, false, None),
            Conflict
        );
    }

    #[test]
    fn a_draft_blocks_writes_even_after_explicit_resolution() {
        for reviewed in [None, Some("local"), Some("remote"), Some("both")] {
            assert_eq!(
                decide(
                    Some("base"),
                    Some("remote"),
                    Some("base"),
                    true,
                    true,
                    reviewed
                ),
                Conflict
            );
        }
    }

    #[test]
    fn a_current_review_can_select_local_remote_or_both() {
        assert_eq!(
            decide(
                Some("local"),
                Some("remote"),
                Some("base"),
                false,
                false,
                Some("local")
            ),
            Keep
        );
        assert_eq!(
            decide(
                Some("local"),
                Some("remote"),
                Some("base"),
                false,
                false,
                Some("remote")
            ),
            Write
        );
        assert_eq!(
            decide(
                Some("local"),
                Some("remote"),
                Some("base"),
                false,
                false,
                Some("both")
            ),
            Both
        );
        assert_eq!(
            decide(
                Some("local"),
                None,
                Some("base"),
                false,
                false,
                Some("remote")
            ),
            Delete
        );
    }

    #[test]
    fn unknown_or_impossible_resolution_never_defaults_to_overwrite() {
        assert_eq!(
            decide(
                Some("local"),
                Some("remote"),
                Some("base"),
                true,
                false,
                Some("unknown")
            ),
            Conflict
        );
        assert_eq!(
            decide(Some("local"), None, Some("base"), true, false, Some("both")),
            Conflict
        );
    }

    #[test]
    fn observed_own_snapshot_allows_sequential_round_trip_without_false_conflict() {
        let ancestors = [("a2", "device-a", Some("y")), ("a1", "device-a", Some("x"))];
        let (publication, base) = observed_own_base(Some("a1"), &ancestors, "device-a").unwrap();
        assert_eq!(publication, "a2");
        assert_eq!(base, Some("y"));
        assert_eq!(decide(Some("y"), Some("z"), base, true, false, None), Write);
        // A further edit after A2 is a real concurrent change and is preserved.
        assert_eq!(
            decide(Some("local-after-a2"), Some("z"), base, true, false, None),
            Conflict
        );
    }

    #[test]
    fn observed_own_snapshot_cannot_bridge_an_unrelated_current_base() {
        let ancestors = [("a2", "device-a", Some("y")), ("a1", "device-a", Some("x"))];
        assert_eq!(
            observed_own_base(Some("third-replica-base"), &ancestors, "device-a"),
            None
        );
        assert_eq!(
            observed_own_base(Some("a1"), &[("a1", "device-a", Some("x"))], "device-a"),
            None
        );
    }

    #[test]
    fn observed_own_snapshot_never_rewinds_past_a_more_recent_shared_base() {
        let ancestors = [
            ("b3", "device-b", Some("z")),
            ("a2", "device-a", Some("y")),
            ("a1", "device-a", Some("x")),
        ];
        assert_eq!(observed_own_base(Some("b3"), &ancestors, "device-a"), None);
        // No own snapshot was observed between the incoming parent and A1.
        assert_eq!(
            observed_own_base(
                Some("a1"),
                &[("b2", "device-b", Some("y")), ("a1", "device-a", Some("x"))],
                "device-a"
            ),
            None
        );
    }

    #[test]
    fn observed_own_snapshot_keeps_absence_distinct_from_no_causal_evidence() {
        let ancestors = [("a2", "device-a", None), ("a1", "device-a", Some("x"))];
        assert_eq!(
            observed_own_base(Some("a1"), &ancestors, "device-a"),
            Some(("a2", None))
        );
        let (_, base) = observed_own_base(Some("a1"), &ancestors, "device-a").unwrap();
        assert_eq!(
            decide(None, Some("recreated"), base, true, false, None),
            Write
        );
        assert_eq!(
            observed_own_base(None, &ancestors, "device-a"),
            Some(("a2", None))
        );
    }
}
