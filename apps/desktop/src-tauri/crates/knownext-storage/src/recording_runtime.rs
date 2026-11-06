//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub fn model_access(key: &str, model: &str) -> Result<Value, String> {
        let descriptor = knownext_core::model_catalog::model(model)
            .ok_or("Modelo desconocido en el catálogo")?;
        let response = knownext_core::http_client_builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| e.to_string())?
            .get(format!("https://api.openai.com/v1/models/{model}"))
            .bearer_auth(key)
            .send()
            .map_err(|_| "No se pudo comprobar el acceso a OpenAI".to_string())?;
        Ok(
            json!({"model":model,"catalogAvailable":true,"status":descriptor["status"],"accountVisible":response.status().is_success(),"httpStatus":response.status().as_u16(),"requestValidated":false,"message":"La visibilidad en la cuenta no confirma una generación. No se ha realizado una petición de generación facturable."}),
        )
    }
    /// Local-only credential snapshot for background jobs. Never sent to React.
    pub fn recording_credential(&self) -> Result<String, String> {
        self.openai_key()
            .ok_or_else(|| "Configura la clave de OpenAI en IA documental".into())
    }

    pub fn create_recording_document(
        &self,
        session_id: &str,
        project_id: &str,
        folder_id: Option<&str>,
        name: &str,
        markdown: &str,
    ) -> Result<String, String> {
        use std::io::{Read, Write};
        let _project_write=self.project_write(project_id)?;
        let parent = self.node_relative(project_id, folder_id)?;
        let root = self
            .project_root(project_id)?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let directory = self
            .resolve_project_relative(project_id, parent.as_deref().unwrap_or(""))?
            .canonicalize()
            .map_err(|_| "La carpeta de destino ya no está disponible. Elige otra.".to_string())?;
        if !directory.is_dir() || !directory.starts_with(&root) {
            return Err("Destino fuera del proyecto".into());
        }
        if let Some(folder) = folder_id {
            if !folder.starts_with(&format!("{project_id}::")) {
                return Err("La carpeta no pertenece al proyecto".into());
            }
        }
        let stem = name.trim().trim_end_matches(".md");
        if stem.is_empty()
            || stem.len() > 150
            || stem
                .chars()
                .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
            || stem == "."
            || stem == ".."
        {
            return Err("Nombre de documento inválido".into());
        }
        let markers = [format!("[knownext-recording:{session_id}]: #"),format!("<!-- knownext-recording:{session_id} -->")];
        // Recover a crash after publication but before updating the manifest.
        for entry in std::fs::read_dir(&directory)
            .map_err(|e| e.to_string())?
            .flatten()
        {
            if entry.path().extension().is_some_and(|e| e == "md") {
                if let Ok(mut file) = std::fs::File::open(entry.path()) {
                    let mut head = [0u8; 256];
                    let read=file.read(&mut head).map_err(|e|e.to_string())?;
                    if markers.iter().any(|marker|head[..read].starts_with(marker.as_bytes())) {
                        return Ok(doc_id(
                            project_id,
                            &join_relative(parent.as_deref(), &entry.file_name().to_string_lossy()),
                        ));
                    }
                }
            }
        }
        for suffix in 0..10000 {
            let filename = if suffix == 0 {
                format!("{stem}.md")
            } else {
                format!("{stem} ({suffix}).md")
            };
            let mut temp =
                tempfile::NamedTempFile::new_in(&directory).map_err(|e| e.to_string())?;
            temp.write_all(markdown.as_bytes())
                .map_err(|e| e.to_string())?;
            temp.as_file().sync_all().map_err(|e| e.to_string())?;
            match temp.persist_noclobber(directory.join(&filename)) {
                Ok(_) => {
                    return Ok(doc_id(
                        project_id,
                        &join_relative(parent.as_deref(), &filename),
                    ))
                }
                Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.to_string()),
            }
        }
        Err("No se ha encontrado un nombre libre".into())
    }
}
