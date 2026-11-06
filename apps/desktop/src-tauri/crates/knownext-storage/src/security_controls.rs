//! Native credential lifecycle. No secret is returned or copied in plaintext.
use super::*;
use std::{fs, io::Read};
fn directory(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(m) if m.is_dir() && !batch::linked(&m) => Ok(()),
        _ => Err("La carpeta privada no es regular; se conserva".into()),
    }
}
fn revision(raw: &Option<Vec<u8>>) -> String {
    sha256_hex(raw.as_deref().unwrap_or(b"absent-credential-store"))
}
fn backup_id(id: &str) -> bool {
    id.starts_with("credential-copy-") && request_scope::portable_id(id)
}
fn recovery_dir(api: &LocalApi) -> Result<PathBuf, String> {
    directory(&api.app_data_dir)?;
    let p = api.app_data_dir.join("credential-recovery");
    if p.exists() {
        directory(&p)?;
    }
    Ok(p)
}
fn recovery_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let m = fs::symlink_metadata(path).map_err(|_| "No se puede revisar la copia privada")?;
    if !m.is_file() || batch::linked(&m) || m.len() > 2 * 1024 * 1024 {
        return Err("Copia privada no regular o fuera de límite".into());
    }
    let mut b = vec![];
    fs::File::open(path)
        .map_err(|_| "No se puede leer la copia privada")?
        .take(2 * 1024 * 1024 + 1)
        .read_to_end(&mut b)
        .map_err(|_| "Lectura privada incompleta")?;
    if b.len() > 2 * 1024 * 1024 {
        return Err("Copia privada fuera de límite".into());
    }
    Ok(b)
}
fn recovery_read(path: &Path) -> Result<Value, String> {
    serde_json::from_slice(&recovery_bytes(path)?).map_err(|_| "Copia privada no compatible".into())
}

fn backups(api: &LocalApi) -> Result<Vec<Value>, String> {
    let root = recovery_dir(api)?;
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut rows = vec![];
    let mut total = 0u64;
    for entry in fs::read_dir(root)
        .map_err(|_| "No se pueden revisar las copias privadas")?
        .take(17)
    {
        let e = entry.map_err(|_| "Copia privada no accesible")?;
        let name = e.file_name().to_string_lossy().into_owned();
        let id = name
            .strip_suffix(".json")
            .ok_or("Hay una entrada privada desconocida; se conserva")?;
        if !backup_id(id) {
            return Err("Hay una entrada privada desconocida; se conserva".into());
        }
        let m =
            fs::symlink_metadata(e.path()).map_err(|_| "No se puede revisar la copia privada")?;
        if !m.is_file() || batch::linked(&m) {
            return Err("Copia privada no regular; se conserva".into());
        }
        total = total.saturating_add(m.len());
        if rows.len() >= 16 || total > 16 * 1024 * 1024 {
            return Err("Las copias privadas alcanzan su límite; se conservan".into());
        }
        let restorable = recovery_read(&e.path())
            .and_then(|v| credential_store::unseal_original(&v))
            .and_then(|b| credential_store::decode(&b))
            .is_ok();
        rows.push(json!({"id":id,"restorable":restorable,"bytes":m.len(),"createdAt":m.modified().ok().and_then(|t|OffsetDateTime::from(t).format(&Rfc3339).ok()).unwrap_or_else(knownext_core::now_iso),"revision":sha256_hex(&recovery_bytes(&e.path())?)}));
    }
    rows.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    Ok(rows)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Change {
    schema_version: u8,
    revision: String,
    action: String,
    confirmed: bool,
    secret: Option<String>,
    recovery_id: Option<String>,
    recovery_revision: Option<String>,
}
impl LocalApi {
    pub(super) fn review_credentials(&self) -> Result<Value, String> {
        let _gate = self.credential_gate.lock().map_err(|_| "Almacén ocupado")?;
        let raw = credential_store::raw(&self.credentials_path())?;
        let decoded = raw.as_deref().map(credential_store::decode).transpose();
        let valid = decoded.is_ok();
        let value = decoded.ok().flatten().unwrap_or(json!({}));
        let rows = backups(self);
        Ok(
            json!({"schemaVersion":1,"checkedAt":knownext_core::now_iso(),"revision":revision(&raw),"state":if raw.is_none(){"absent"}else if valid{"ready"}else{"unreadable"},"protection":credential_store::protection_name(),"openaiConfigured":value["openaiKey"].as_str().is_some_and(|k|!k.is_empty()),"githubConfigured":value.pointer("/github/accessToken").or_else(||value.get("accessToken")).and_then(Value::as_str).is_some_and(|k|!k.is_empty()),"recoveries":rows.as_ref().ok().cloned().unwrap_or_default(),"recoveryAvailable":rows.is_ok(),"remoteRevocation":false}),
        )
    }
    pub(super) fn change_credentials(&self, body: Value) -> Result<Value, String> {
        let q: Change =
            serde_json::from_value(body).map_err(|_| "Cambio de credenciales no válido")?;
        if q.schema_version != 1 || !q.confirmed {
            return Err("Confirma el cambio revisado de credenciales".into());
        }
        let _auth = self.auth_gate.lock().map_err(|_| "Sesión ocupada")?;
        let _gate = self.credential_gate.lock().map_err(|_| "Almacén ocupado")?;
        let raw = credential_store::raw(&self.credentials_path())?;
        if revision(&raw) != q.revision {
            return Err("El almacén cambió; vuelve a revisarlo".into());
        }
        if q.action == "remove-recovery" {
            if q.secret.is_some() {
                return Err("Campos ajenos al cambio".into());
            }
            let id = q
                .recovery_id
                .as_deref()
                .filter(|id| backup_id(id))
                .ok_or("Selecciona una copia privada")?;
            let rows = backups(self)?;
            let selected = rows
                .iter()
                .find(|r| r["id"] == id)
                .ok_or("La copia ya no está disponible")?;
            if selected["revision"].as_str() != q.recovery_revision.as_deref() {
                return Err("La copia cambió; vuelve a revisarla".into());
            }
            let path = recovery_dir(self)?.join(format!("{id}.json"));
            let raw = recovery_bytes(&path)?;
            if Some(sha256_hex(&raw)) != q.recovery_revision {
                return Err("La copia cambió; se conserva".into());
            }
            fs::remove_file(path).map_err(|_| "No se pudo confirmar la retirada de la copia")?;
            return Ok(
                json!({"schemaVersion":1,"status":"changed","checkedAt":knownext_core::now_iso(),"remoteRevocation":false}),
            );
        }
        let mut value = if q.action == "reset-store" || q.action == "restore-store" {
            json!({})
        } else {
            raw.as_deref()
                .map(credential_store::decode)
                .transpose()?
                .unwrap_or(json!({}))
        };
        match q.action.as_str() {
            "replace-openai" => {
                let key = q
                    .secret
                    .as_deref()
                    .map(str::trim)
                    .filter(|k| {
                        !k.is_empty() && k.len() <= 8192 && !k.chars().any(char::is_control)
                    })
                    .ok_or("Indica una clave válida")?;
                value["openaiKey"] = json!(key);
            }
            "remove-openai" => {
                value
                    .as_object_mut()
                    .ok_or("Almacén no válido")?
                    .remove("openaiKey");
            }
            "disconnect-github" => {
                for k in ["github", "accessToken", "provider", "scopes"] {
                    value.as_object_mut().ok_or("Almacén no válido")?.remove(k);
                }
            }
            "reset-store" => (),
            "restore-store" => {
                let id = q
                    .recovery_id
                    .as_deref()
                    .filter(|id| backup_id(id))
                    .ok_or("Selecciona una copia compatible")?;
                let rows = backups(self)?;
                let selected = rows
                    .iter()
                    .find(|r| r["id"] == id)
                    .ok_or("La copia ya no está disponible")?;
                if selected["revision"].as_str() != q.recovery_revision.as_deref() {
                    return Err("La copia cambió; vuelve a revisarla".into());
                }
                let data = recovery_bytes(&recovery_dir(self)?.join(format!("{id}.json")))?;
                if Some(sha256_hex(&data)) != q.recovery_revision {
                    return Err("La copia cambió; se conserva".into());
                }
                let sealed: Value =
                    serde_json::from_slice(&data).map_err(|_| "Copia no compatible")?;
                value = credential_store::decode(&credential_store::unseal_original(&sealed)?)?;
            }
            _ => return Err("Acción de credenciales no permitida".into()),
        };
        if q.action != "restore-store" && q.recovery_revision.is_some()
            || q.action != "replace-openai" && q.secret.is_some()
            || q.action != "restore-store" && q.recovery_id.is_some()
        {
            return Err("Campos ajenos al cambio de credenciales".into());
        }
        let github_changed = matches!(
            q.action.as_str(),
            "reset-store" | "restore-store" | "disconnect-github"
        );
        if github_changed {
            self.auth_checked()?;
            self.device_checked()?;
        }
        if matches!(q.action.as_str(), "reset-store" | "restore-store") {
            let rows = backups(self)?;
            if rows.len() >= 16 {
                return Err(
                    "Se conservan16 copias privadas; no se ha sustituido el almacén".into(),
                );
            }
            if let Some(original) = &raw {
                let sealed = credential_store::seal_original(original)?;
                let data = serde_json::to_vec(&sealed)
                    .map_err(|_| "No se pudo preparar la copia privada")?;
                let used: u64 = rows.iter().filter_map(|r| r["bytes"].as_u64()).sum();
                if used + data.len() as u64 > 16 * 1024 * 1024 {
                    return Err(
                        "Las copias privadas alcanzan16MiB; no se ha sustituido el almacén".into(),
                    );
                }
                let root = recovery_dir(self)?;
                if !root.exists() {
                    fs::create_dir(&root).map_err(|_| "No se puede preparar la copia privada")?;
                }
                directory(&root)?;
                let target = root.join(format!(
                    "{}.json",
                    knownext_core::compact_id("credential-copy")
                ));
                atomic_io::create(&target, &data)
                    .map_err(|_| "No se pudo conservar el original cifrado")?;
                if credential_store::unseal_original(&recovery_read(&target)?)? != *original {
                    return Err(
                        "La copia privada no se pudo verificar; el almacén no se sustituye".into(),
                    );
                }
            }
        }
        if github_changed {
            self.auth_generation
                .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        }
        credential_store::replace_reviewed(&self.credentials_path(), &raw, &value)?;
        if github_changed {
            self.write_json(&self.auth_path(), &default_auth_status())?;
            match fs::remove_file(self.github_device_path()){Ok(())=>(),Err(e)if e.kind()==std::io::ErrorKind::NotFound=>(),Err(_)=>return Err("El almacén cambió; el cierre del desafío no está confirmado. Consulta la sesión".into())}
        }
        Ok(
            json!({"schemaVersion":1,"status":"changed","checkedAt":knownext_core::now_iso(),"remoteRevocation":false}),
        )
    }
    pub(super) fn security_controls(&self) -> Value {
        json!({"schemaVersion":1,"checkedAt":knownext_core::now_iso(),"windows":[{"id":"main","authority":"workspace"},{"id":"recordings","authority":"recording-and-destination"},{"id":"other","authority":"none"}],"authority":[{"id":"read","effect":"none","checks":["project","sources","freshness"]},{"id":"edit","effect":"reviewed-document","checks":["project","root","permission","base","draft","destination"]},{"id":"create","effect":"new-file","checks":["project","root","permission","parent","exclusive-create"]},{"id":"delete","effect":"explicit-confirmation","checks":["project","permission","confirmation","reviewed-paths"]},{"id":"image-drawing","effect":"reviewed-resource","checks":["project","permission","base","format","budget"]},{"id":"research","effect":"retained-result","checks":["project","policy","sources","budget","review"]},{"id":"transcription","effect":"proposal","checks":["project","audio","privacy","budget"]}],"limits":{"filesPerRequest":64,"jsonDepth":64,"jsonNodes":250000,"textMiB":192,"encodedFileMiB":180,"encodedTotalMiB":352},"privacy":{"remoteDeletionGuaranteed":false,"forensicErasureGuaranteed":false,"automaticExpiry":false}})
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, LocalApi) {
        let d = tempfile::tempdir().unwrap();
        let a = LocalApi::new(d.path().join("state"), "qa".into(), "test".into());
        (d, a)
    }
    fn change(a: &LocalApi, action: &str, secret: Option<&str>) -> Result<Value, String> {
        let r = a.review_credentials()?;
        a.change_credentials(json!({"schemaVersion":1,"revision":r["revision"],"action":action,"confirmed":true,"secret":secret}))
    }
    #[test]
    fn security_block_rotation_and_removal_preserve_other_credentials_and_never_return_secrets() {
        let (_d, a) = fixture();
        a.update_credentials(|c| {
            c.insert(
                "github".into(),
                json!({"accessToken":"SYNTHETIC-GITHUB-CANARY"}),
            );
        })
        .unwrap();
        change(&a, "replace-openai", Some("SYNTHETIC-OPENAI-CANARY")).unwrap();
        let review = a.review_credentials().unwrap();
        assert_eq!(review["githubConfigured"], true);
        assert_eq!(review["openaiConfigured"], true);
        assert!(!review.to_string().contains("CANARY"));
        change(&a, "remove-openai", None).unwrap();
        let c = credential_store::read(&a.credentials_path()).unwrap();
        assert_eq!(c["github"]["accessToken"], "SYNTHETIC-GITHUB-CANARY");
        assert!(c["openaiKey"].is_null());
        #[cfg(windows)]
        assert!(
            !String::from_utf8_lossy(&fs::read(a.credentials_path()).unwrap()).contains("CANARY")
        );
    }
    #[cfg(windows)]
    #[test]
    fn security_block_recovery_encrypts_exact_original_and_restores_only_compatible_store() {
        let (_d, a) = fixture();
        change(&a, "replace-openai", Some("SYNTHETIC-RECOVERY-CANARY")).unwrap();
        let original = fs::read(a.credentials_path()).unwrap();
        change(&a, "reset-store", None).unwrap();
        let r = a.review_credentials().unwrap();
        let row = &r["recoveries"][0];
        assert_eq!(row["restorable"], true);
        let path = recovery_dir(&a)
            .unwrap()
            .join(format!("{}.json", row["id"].as_str().unwrap()));
        let sealed = fs::read(&path).unwrap();
        assert!(!String::from_utf8_lossy(&sealed).contains("CANARY"));
        assert_eq!(
            credential_store::unseal_original(&recovery_read(&path).unwrap()).unwrap(),
            original
        );
        a.change_credentials(json!({"schemaVersion":1,"revision":r["revision"],"action":"restore-store","recoveryId":row["id"],"recoveryRevision":row["revision"],"confirmed":true})).unwrap();
        assert_eq!(
            credential_store::read(&a.credentials_path()).unwrap()["openaiKey"],
            "SYNTHETIC-RECOVERY-CANARY"
        );
        let bad = b"{future opaque SYNTHETIC-PRIVATE-CANARY}";
        fs::write(a.credentials_path(), bad).unwrap();
        assert_eq!(a.review_credentials().unwrap()["state"], "unreadable");
        change(&a, "reset-store", None).unwrap();
        let rows = a.review_credentials().unwrap();
        assert!(rows["recoveries"]
            .as_array()
            .unwrap()
            .iter()
            .any(|r| r["restorable"] == false));
        assert!(!rows.to_string().contains("CANARY"));
    }
    #[test]
    fn security_block_stale_credential_review_and_future_actions_do_not_change_the_store() {
        let (_d, a) = fixture();
        let r = a.review_credentials().unwrap();
        change(&a, "replace-openai", Some("SYNTHETIC-KEY-ONE")).unwrap();
        let before = fs::read(a.credentials_path()).unwrap();
        assert!(a.change_credentials(json!({"schemaVersion":1,"revision":r["revision"],"action":"remove-openai","confirmed":true})).is_err());
        assert!(change(&a, "future-action", None).is_err());
        assert_eq!(fs::read(a.credentials_path()).unwrap(), before);
    }
}
