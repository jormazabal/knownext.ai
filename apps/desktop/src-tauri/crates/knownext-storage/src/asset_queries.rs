//! Domain methods moved verbatim; contracts, preconditions and effects remain unchanged.
use super::*;
impl LocalApi {
    pub(super) fn asset_metadata(&self, project_id: &str, asset_id: &str) -> Result<Value, String> {
        let path = self.resolve_project_asset(project_id, asset_id)?;
        let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
        let relative = path
            .strip_prefix(self.project_root(project_id)?)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");
        let usage_count = self.asset_references(project_id, Some(&relative))?.len();
        let indexed = self.image_index_entry(project_id, &relative)?.is_some();
        let is_image = is_image_path(&path);
        Ok(json!({
            "id": doc_id(project_id, &relative),
            "projectId": project_id,
            "name": path.file_name().and_then(|value| value.to_str()).unwrap_or("asset"),
            "path": relative,
            "mimeType": mime_for_path(&path),
            "sizeBytes": metadata.len(),
            "width": null,
            "height": null,
            "colorDepthBits": null,
            "updatedAt": knownext_core::now_iso(),
            "usageCount": usage_count,
            "indexed": indexed,
            "indexStatus": if is_image { if indexed { "indexed" } else { "not-indexed" } } else { "not-applicable" },
            "visualDescription": null
        }))
    }
    pub(super) fn asset_usage(&self, project_id: &str, asset_id: &str) -> Result<Value, String> {
        let asset = self.asset_metadata(project_id, asset_id)?;
        let relative = asset["path"].as_str().unwrap_or("");
        Ok(
            json!({ "asset": asset, "references": self.asset_references(project_id, Some(relative))? }),
        )
    }
    pub(super) fn reindex_project_images(&self, project_id: &str) -> Result<Value, String> {self.rebuild_image_inventory(project_id)}
    pub(super) fn image_index_entry(&self, project_id: &str, relative: &str) -> Result<Option<Value>,String> {
        let index=ancillary_state::read(&self.app_data_dir,&self.image_index_path(project_id),ancillary_state::Store::Images,Some(project_id),json!({"images":[]}))?;
        Ok(index["images"]
            .as_array().ok_or("Índice de imágenes no compatible")?
            .iter()
            .find(|image| image["path"].as_str() == Some(relative))
            .cloned())
    }
    pub(super) fn asset_references(
        &self,
        project_id: &str,
        asset_relative: Option<&str>,
    ) -> Result<Vec<Value>, String> {
        let root = self.project_root(project_id)?;
        let mut references = Vec::new();
        for path in collect_project_files(&root)? {
            if !is_markdown_path(&path) {
                continue;
            }
            let document_path = relative_from_root(&root, &path);
            let document_id = doc_id(project_id, &document_path);
            let document_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("documento.md")
                .to_string();
            let markdown = std::fs::read_to_string(&path).unwrap_or_default();
            for reference in markdown_image_references(
                &markdown,
                project_id,
                &document_id,
                &document_name,
                &document_path,
            ) {
                let resolved = reference["resolvedAssetPath"].as_str();
                if asset_relative
                    .map(|relative| resolved == Some(relative))
                    .unwrap_or(true)
                {
                    references.push(reference);
                }
            }
        }
        references.sort_by(|left, right| {
            (
                left["documentPath"].as_str().unwrap_or(""),
                left["line"].as_u64().unwrap_or(0),
                left["column"].as_u64().unwrap_or(0),
            )
                .cmp(&(
                    right["documentPath"].as_str().unwrap_or(""),
                    right["line"].as_u64().unwrap_or(0),
                    right["column"].as_u64().unwrap_or(0),
                ))
        });
        Ok(references)
    }
    pub(super) fn image_reference(
        &self,
        project_id: &str,
        document_id: &str,
        body: Value,
    ) -> Result<Value, String> {
        let asset_id = body.get("assetId").and_then(Value::as_str).unwrap_or("");
        let asset = self.asset_metadata(project_id, asset_id)?;
        let alt = body
            .get("altText")
            .and_then(Value::as_str)
            .unwrap_or_else(|| asset["name"].as_str().unwrap_or("Imagen"));
        let target = document_ref_path(document_id)
            .ok()
            .map(|document_path| {
                relative_link_target(&document_path, asset["path"].as_str().unwrap_or(""))
            })
            .unwrap_or_else(|| asset["path"].as_str().unwrap_or("").to_string());
        Ok(
            json!({ "markdown": format!("![{}]({})", markdown_alt_escape(alt), markdown_image_destination_escape(&target)), "asset": asset, "documentId": document_id }),
        )
    }
    pub(super) fn document_move_impact(&self, project_id: &str, document_id: &str) -> Result<Value, String> {
        let (_, relative) = document_ref(document_id)?;
        let references = self
            .asset_references(project_id, None)?
            .into_iter()
            .filter(|reference| reference["documentId"].as_str() == Some(document_id))
            .collect::<Vec<_>>();
        let mut shared_asset_paths = Vec::new();
        for reference in &references {
            let Some(asset_path) = reference["resolvedAssetPath"].as_str() else {
                continue;
            };
            if shared_asset_paths
                .iter()
                .any(|path: &String| path == asset_path)
            {
                continue;
            }
            if self.asset_references(project_id, Some(asset_path))?.len() > 1 {
                shared_asset_paths.push(asset_path.to_string());
            }
        }
        let message = if references.is_empty() {
            "Sin referencias de imagen que actualizar."
        } else {
            "El documento contiene referencias de imagen; al moverlo se deben revisar rutas relativas."
        };
        Ok(
            json!({ "documentId": document_id, "documentPath": relative, "references": references, "sharedAssetPaths": shared_asset_paths, "message": message }),
        )
    }
}
