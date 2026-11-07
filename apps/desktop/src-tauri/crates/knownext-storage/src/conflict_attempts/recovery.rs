//! Inspect existing receipts and private copies after the UI has lost its request.
//! This is not confirmation of the original request, a replay or a source/Git review.
use super::*;

fn row(record: &Record, bytes: u64) -> Value {
    let (_, relative) = document_ref(&record.document_id).expect("validated receipt identity");
    json!({"id":record.id,"documentId":record.document_id,"name":relative.rsplit('/').next(),"kind":record.kind,"phase":record.phase,"createdAt":record.created_at,"archivedAt":record.archived_at,"bytes":bytes,"revision":record.revision,"canReview":true,"warning":null})
}
fn private_revision(api: &LocalApi, record: &Record) -> Result<Option<String>, String> {
    let draft = draft_store::inspect(&api.app_data_dir.join("drafts"), &record.document_id)?;
    draft_versions::ensure_kind(&record.document_id, draft.as_ref())?;
    document_conflicts::draft_revision(&draft)
}
impl LocalApi {
    pub(crate) fn list_conflict_attempt_recovery(&self, archived: bool) -> Result<Value, String> {
        directory(&self.app_data_dir)?;
        let root = self.app_data_dir.join("conflict-attempts");
        directory(&root)?;
        let entries = match fs::read_dir(&root) {
            Ok(entries) => Some(entries),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(_) => return Err("No se pueden consultar los recibos; se conservan".into()),
        };
        let start = std::time::Instant::now();
        let mut scanned = 0;
        let mut budget = MAX_TOTAL;
        let mut items = vec![];
        let mut warnings = vec![];
        let mut limited = false;
        let mut unsupported = 0;
        if let Some(entries) = entries {
            for entry in entries {
                if scanned >= MAX_RECORDS || budget == 0 || start.elapsed() > Duration::from_secs(2)
                {
                    limited = true;
                    break;
                }
                scanned += 1;
                let entry = entry.map_err(|_| "No se puede consultar una entrada de recibos")?;
                let name = entry.file_name();
                let Some(id) = name
                    .to_str()
                    .and_then(|name| name.strip_suffix(".json"))
                    .filter(|id| identity(id).is_ok())
                else {
                    unsupported += 1;
                    continue;
                };
                let bytes = fs::symlink_metadata(entry.path())
                    .map(|meta| meta.len())
                    .unwrap_or(0);
                if bytes <= MAX_RECORD && bytes > budget {
                    limited = true;
                    break;
                }
                match read_budgeted(self,id,&mut budget){
                Ok(Some(record))=>{if record.archived_at.is_some()==archived{items.push(row(&record,bytes));}},
                Ok(None)=>warnings.push("Un recibo dejó de estar disponible durante la consulta; vuelve a revisar".into()),
                Err(message)=>items.push(json!({"id":id,"documentId":null,"name":"Recibo no revisable","kind":null,"phase":null,"createdAt":null,"bytes":bytes,"revision":null,"canReview":false,"warning":message})),
            }
            }
        }
        items.sort_by(|a, b| {
            b["createdAt"]
                .as_str()
                .unwrap_or("")
                .cmp(a["createdAt"].as_str().unwrap_or(""))
                .then_with(|| a["id"].as_str().cmp(&b["id"].as_str()))
        });
        if unsupported > 0 {
            warnings.push(format!(
                "{unsupported} entradas no compatibles se conservan sin abrir ni modificar"
            ));
        }
        Ok(
            json!({"items":items,"archived":archived,"scanned":scanned,"limited":limited,"warnings":warnings,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn review_conflict_attempt_recovery(&self, id: &str) -> Result<Value, String> {
        let record = read(self, id)?.ok_or("El recibo ya no está disponible; vuelve a revisar")?;
        if retirement::present(self, id)? {
            let state = self.review_conflict_payloads(id)?;
            let bytes = fs::symlink_metadata(path(self, id)?)
                .map_err(|_| "No se pudo comprobar el recibo")?
                .len();
            return Ok(
                json!({"receipt":row(&record,bytes),"operationId":record.operation_id,"copies":[],"copiesVerified":false,"draftMatchesRecordedPublication":null,"fileStateReviewed":false,"remoteStateReviewed":false,"canReplay":false,"payloadRetirement":state,"warnings":["La retirada local está registrada. Consulta su estado; las variantes completas permanecen en el respaldo externo elegido."],"checkedAt":knownext_core::now_iso()}),
            );
        }
        let initial = private_revision(self, &record);
        let mut warnings = vec![];
        let mut copies = vec![];
        let mut budget = COPY_BUDGET;
        let mut roles = BTreeSet::new();
        let mut copies_verified = !record.copies.is_empty();
        for copy in &record.copies {
            match self.conflict_copy_review(
                &copy.key,
                &record.document_id,
                &record.operation_id,
                &mut budget,
            ) {
                Ok((content, manifest, row))
                    if content == copy.content_hash && manifest == copy.manifest_hash =>
                {
                    if !row["variantRole"]
                        .as_str()
                        .is_some_and(|role| roles.insert(role.to_owned()))
                    {
                        copies_verified = false;
                        warnings.push("Las funciones de las copias no son únicas o conocidas; no se confirma el conjunto".into());
                    }
                    copies.push(row);
                }
                Ok(_) => {
                    copies_verified = false;
                    warnings.push(format!(
                        "La copia {} cambió respecto al recibo y se conserva sin atribuirla",
                        copy.key
                    ));
                }
                Err(message) => {
                    copies_verified = false;
                    warnings.push(format!("Copia {}: {message}", copy.key));
                }
            }
        }
        copies_verified &= roles.contains("local")
            && roles.contains("disk")
            && roles.contains("proposal")
            && (roles.len() == 3 || roles.len() == 4 && roles.contains("remote"));
        let draft_matches = match &initial {
            Ok(revision) if record.target_prepared => {
                Some(revision == &record.after_draft_revision)
            }
            Ok(_) => None,
            Err(message) => {
                warnings.push(message.clone());
                None
            }
        };
        if !record.target_prepared {
            warnings.push("No hay publicación preparada en este recibo. Puede haber copias adicionales en Apartadas; no se reanuda el intento.".into());
        }
        let last = private_revision(self, &record);
        if matches!((&initial,&last),(Ok(a),Ok(b)) if a!=b)
            || initial.is_ok() != last.is_ok()
            || read(self, id)?.and_then(|record| record.revision) != record.revision
        {
            return Err("El recibo o el borrador cambiaron durante la consulta. Actualiza; no se ha repetido ninguna operación.".into());
        }
        let bytes = fs::symlink_metadata(path(self, id)?)
            .map_err(|_| "No se puede volver a consultar el recibo")?
            .len();
        Ok(
            json!({"receipt":row(&record,bytes),"operationId":record.operation_id,"copies":copies,"copiesVerified":copies_verified,"draftMatchesRecordedPublication":draft_matches,"fileStateReviewed":false,"remoteStateReviewed":false,"canReplay":false,"warnings":warnings,"checkedAt":knownext_core::now_iso()}),
        )
    }
    pub(crate) fn change_conflict_attempt_archive(
        &self,
        id: &str,
        body: Value,
    ) -> Result<Value, String> {
        retention::with_mutation(self, || {
            #[derive(Deserialize)]
            #[serde(deny_unknown_fields)]
            struct Change {
                revision: String,
                action: String,
            }
            if retirement::present(self, id)? {
                return Err("La retirada local ya está registrada. El recibo y su identidad se conservan; no se reabre".into());
            }
            let request: Change = serde_json::from_value(body)
                .map_err(|_| "La acción de archivo del recibo no tiene un formato conocido")?;
            if !hash(&request.revision) || !matches!(request.action.as_str(), "archive" | "reopen")
            {
                return Err("La acción o revisión del recibo no son compatibles".into());
            }
            let mut record = read(self, id)?
                .ok_or("El recibo no está disponible; actualiza antes de continuar")?;
            if record.revision.as_deref() != Some(request.revision.as_str()) {
                return Err("El recibo cambió desde la revisión. Consulta su estado; no se ha cambiado el archivo.".into());
            }
            if record.phase != "completed" {
                return Err("El intento sigue pendiente. Revisa sus copias; no puede archivarse como completado.".into());
            }
            let archived = request.action == "archive";
            if record.archived_at.is_some() != archived {
                record.archived_at = if archived {
                    Some(knownext_core::now_iso())
                } else {
                    None
                };
                write(self, &mut record)?;
            }
            Ok(
                json!({"id":id,"status":if archived{"archived"}else{"active"},"revision":record.revision,"checkedAt":knownext_core::now_iso()}),
            )
        })
    }
}
