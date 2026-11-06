//! Validate project identity before dispatch or private filename construction.
use super::*;

pub(super) fn portable_id(id: &str) -> bool {
    if id.is_empty()
        || id.len() > 200
        || !id.as_bytes()[0].is_ascii_alphanumeric()
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'-' | b'_'))
    {
        return false;
    }
    let lower = id.to_ascii_lowercase();
    !matches!(lower.as_str(), "con" | "prn" | "aux" | "nul")
        && !(lower.len() == 4
            && (lower.starts_with("com") || lower.starts_with("lpt"))
            && matches!(lower.as_bytes()[3], b'1'..=b'9'))
}

fn failure(status: u16, code: &str, detail: &str) -> LocalApiResponse {
    LocalApiResponse {
        status,
        body: json!({"code":code,"detail":detail,
        "scope":"project","checkedAt":knownext_core::now_iso()}),
    }
}

impl LocalApi {
    pub(super) fn resolve_project_asset(&self, owner: &str, id: &str) -> Result<PathBuf, String> {
        let relative = if let Some((project, relative)) = id.split_once("::") {
            if project != owner {
                return Err("El recurso no pertenece al proyecto solicitado".into());
            }
            relative
        } else {
            id
        };
        self.resolve_project_relative(owner, relative)
    }
    pub(super) fn registered_project_root(&self, id: &str) -> Result<PathBuf, LocalApiResponse> {
        if !portable_id(id) {
            return Err(failure(
                400,
                "project_identity_invalid",
                "Identificador de proyecto no válido",
            ));
        }
        let registry = self.registry_checked().map_err(|_| {
            failure(
                503,
                "project_registry_unavailable",
                "El registro de proyectos no se puede leer con seguridad; se conserva",
            )
        })?;
        let project = registry["projects"]
            .as_array()
            .and_then(|projects| {
                projects
                    .iter()
                    .find(|project| project["id"].as_str() == Some(id))
            })
            .ok_or_else(|| failure(404, "project_not_registered", "Proyecto no registrado"))?;
        let root = project["folderPath"]
            .as_str()
            .map(PathBuf::from)
            .filter(|root| root.is_absolute())
            .ok_or_else(|| {
                failure(
                    503,
                    "project_location_invalid",
                    "La ubicación registrada no es absoluta; se conserva",
                )
            })?;
        Ok(root)
    }

    /// Shared by the native gateway and direct local calls. This check reads
    /// only the registry; it neither probes external roots nor creates folders.
    pub fn request_scope_failure(&self, method: &str, raw_path: &str) -> Option<LocalApiResponse> {
        let (path, _) = split_path(raw_path);
        let segments = path
            .trim_matches('/')
            .split('/')
            .map(knownext_core::percent_decode)
            .collect::<Vec<_>>();
        let parts = segments.iter().map(String::as_str).collect::<Vec<_>>();
        let ["api", "projects", id, tail @ ..] = parts.as_slice() else {
            return None;
        };
        if tail.is_empty()
            && method.eq_ignore_ascii_case("GET")
            && matches!(*id, "active" | "capabilities")
        {
            return None;
        }
        // Catalog retirement has its own validated, idempotent record lookup.
        // Only retirement is exempt from registration, never resource access.
        if portable_id(id)
            && ((tail.is_empty() && method.eq_ignore_ascii_case("DELETE"))
                || (*tail == ["retire"] && method.eq_ignore_ascii_case("POST")))
        {
            return None;
        }
        self.registered_project_root(id).err()
    }
}

#[cfg(test)]
mod tests {
    use super::super::*;
    use std::fs;

    #[test]
    fn scoped_routes_reject_invalid_unknown_and_unreadable_registry_without_writes() {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        for id in [
            "..%2Fneighbor",
            "CON",
            "project%5Cneighbor",
            "project%00bad",
        ] {
            for tail in [
                "ai/conversation",
                "ai/context-sources",
                "ai/research/jobs",
                "image-index",
                "tree",
            ] {
                let response = api
                    .handle(
                        "GET",
                        &format!("/api/projects/{id}/{tail}"),
                        Value::Null,
                        vec![],
                    )
                    .unwrap();
                assert_eq!(response.status, 400);
                assert_eq!(response.body["code"], "project_identity_invalid");
                assert!(response.body["checkedAt"].as_str().is_some());
            }
        }
        assert_eq!(
            api.handle(
                "GET",
                "/api/projects/unknown/ai/conversation",
                Value::Null,
                vec![]
            )
            .unwrap()
            .status,
            404
        );
        assert!(!root.path().join("ai").exists());
        let future = br#"{"schemaVersion":99,"private":"preserve"}"#;
        fs::write(root.path().join("projects.json"), future).unwrap();
        assert_eq!(
            api.handle(
                "GET",
                "/api/projects/project-valid/tree",
                Value::Null,
                vec![]
            )
            .unwrap()
            .status,
            503
        );
        assert_eq!(fs::read(root.path().join("projects.json")).unwrap(), future);
    }

    #[test]
    fn absolute_registered_roots_and_global_routes_remain_supported() {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        let project = api
            .create_project(json!({"name":"QA","versioningMode":"none"}))
            .unwrap();
        let id = project["id"].as_str().unwrap();
        assert!(api
            .request_scope_failure("GET", &format!("/api/projects/{id}/tree"))
            .is_none());
        assert!(api
            .request_scope_failure("GET", "/api/projects/active")
            .is_none());
        assert!(api
            .request_scope_failure("GET", "/api/projects/capabilities")
            .is_none());
        assert!(api.request_scope_failure("GET", "/api/projects").is_none());
        let mut registry = api.registry_checked().unwrap();
        registry["projects"][0]["folderPath"] = json!("relative-root");
        api.write_registry(&registry).unwrap();
        assert_eq!(
            api.request_scope_failure("GET", &format!("/api/projects/{id}/tree"))
                .unwrap()
                .body["code"],
            "project_location_invalid"
        );
        assert!(!root.path().join("relative-root").exists());
    }

    #[test]
    fn asset_content_and_metadata_never_accept_another_projects_document_identity() {
        let root = tempfile::tempdir().unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        let a = api
            .create_project(json!({"name":"A","versioningMode":"none"}))
            .unwrap();
        let b = api
            .create_project(json!({"name":"B","versioningMode":"none"}))
            .unwrap();
        let a = a["id"].as_str().unwrap();
        let b = b["id"].as_str().unwrap();
        fs::write(
            api.project_root(b).unwrap().join("owned.png"),
            b"private owned asset",
        )
        .unwrap();
        let foreign = doc_id(b, "owned.png").replace(':', "%3A");
        assert!(api
            .handle(
                "GET",
                &format!("/api/projects/{a}/assets/{foreign}"),
                Value::Null,
                vec![]
            )
            .is_err());
        assert!(api
            .content(
                &format!("/api/projects/{a}/assets/{foreign}/content"),
                Value::Null
            )
            .is_err());
        assert_eq!(
            api.content(
                &format!("/api/projects/{b}/assets/{foreign}/content"),
                Value::Null
            )
            .unwrap()
            .status,
            200
        );
        assert_eq!(
            fs::read(api.project_root(b).unwrap().join("owned.png")).unwrap(),
            b"private owned asset"
        );
    }

    #[test]
    fn escaped_conversation_identity_neither_discloses_nor_replaces_a_private_neighbor() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("ai")).unwrap();
        let sentinel = root.path().join("owned-private.json");
        let bytes = br#"{"events":[{"content":"owned private scope sentinel"}]}"#;
        fs::write(&sentinel, bytes).unwrap();
        let api = LocalApi::new(root.path().into(), "qa".into(), "test".into());
        let path = "/api/projects/..%2Fowned-private/ai/conversation";
        let read = api.handle("GET", path, Value::Null, vec![]);
        let removed = api.handle("DELETE", path, Value::Null, vec![]);
        let leaked = read.as_ref().is_ok_and(|response| {
            response
                .body
                .to_string()
                .contains("owned private scope sentinel")
        });
        assert!(
            !leaked,
            "project identity disclosed a neighboring private file"
        );
        assert_eq!(
            fs::read(&sentinel).unwrap(),
            bytes,
            "project identity replaced a neighboring private file"
        );
        assert!(removed.is_err() || removed.unwrap().status >= 400);
    }
}
