//! Reviewed page choices only prepare a recoverable draft; saving remains explicit.
use super::*;
use std::{fs,io::Read};
const LIMIT:u64=16*1024*1024;

#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
struct Apply{#[serde(default,skip_serializing_if="Option::is_none")]attempt_id:Option<String>,location_revision:String,disk_fingerprint:Value,draft_revision:Option<String>,local_content:Value,merged_content:Value}
struct Snapshot{review:Value,original:Value,draft:Option<Value>}
fn checked(content:&Value)->Result<(),String>{
    document_validation::handwritten(content)?;
    if serde_json::to_vec(content).map_err(|_|"No se pudo revisar la nota")?.len() as u64>LIMIT{return Err("La revisión de cada nota admite hasta16MiB; se conservan las fuentes".into())}
    let mut ids=BTreeSet::new();for page in content["pages"].as_array().unwrap(){let id=page["id"].as_str().filter(|s|!s.is_empty()).ok_or("Página sin identidad")?;if !ids.insert(id){return Err("La nota tiene identidades de página duplicadas; se conserva".into())}}
    if !content["ocr"].is_object()||!content["ocr"]["textByPage"].is_object()||content["ocr"]["textByPage"].as_object().unwrap().values().any(|v|!v.is_string()){return Err("El texto asociado a las páginas no tiene un formato compatible".into())}Ok(())
}
fn snapshot(api:&LocalApi,id:&str)->Result<Snapshot,String>{
    let path=api.resolve_handwritten_path(id)?;let meta=fs::symlink_metadata(&path).map_err(|_|"No se puede consultar la nota del disco")?;
    if !meta.is_file()||batch::linked(&meta)||meta.len()>LIMIT{return Err("Nota no regular o mayor de16MiB; se conserva el contenido abierto".into())}
    let mut bytes=Vec::new();fs::File::open(&path).map_err(|_|"No se puede abrir la nota del disco")?.take(LIMIT+1).read_to_end(&mut bytes).map_err(|_|"No se pudo completar la lectura de la nota")?;
    if bytes.len() as u64>LIMIT{return Err("La nota creció fuera del límite; se conserva".into())}
    let original:Value=serde_json::from_slice(&bytes).map_err(|_|"La nota del disco no contiene JSON válido; se conserva")?;checked(&original)?;
    let normalized=normalize_handwritten_note(original.clone(),id,path.file_stem().and_then(|n|n.to_str()).unwrap_or("Nota"));
    let draft=api.read_draft(id)?;draft_versions::ensure_kind(id,draft.as_ref())?;let (project,_)=document_ref(id)?;let root=api.project_root(&project)?.canonicalize().map_err(|_|"No se pudo verificar la ubicación del proyecto")?;
    let review=json!({"noteId":id,"diskContent":normalized,"diskFingerprint":fingerprint_bytes(&bytes),"locationRevision":sha256_hex(root.to_string_lossy().as_bytes()),"draftRevision":document_conflicts::draft_revision(&draft)?,"checkedAt":knownext_core::now_iso()});
    Ok(Snapshot{review,original,draft})
}
fn same(review:&Value,request:&Apply)->bool{review["locationRevision"]==request.location_revision&&review["diskFingerprint"]==request.disk_fingerprint&&review["draftRevision"]==json!(request.draft_revision)}
impl LocalApi{
    pub(super) fn review_handwritten_conflict(&self,id:&str)->Result<Value,String>{Ok(snapshot(self,id)?.review)}
    pub(super) fn apply_handwritten_conflict(&self,id:&str,payload:Value)->Result<Value,String>{
        let _transaction=self.project_transaction(&document_ref(id)?.0)?;
        let request:Apply=serde_json::from_value(payload).map_err(|_|"La combinación de páginas requiere una revisión completa")?;
        checked(&request.local_content)?;checked(&request.merged_content)?;
        if request.local_content["id"]!=id||request.merged_content["id"]!=id{return Err("La combinación pertenece a otra nota; se conserva sin aplicar".into())}
        let prepared=snapshot(self,id)?;if !same(&prepared.review,&request){return Err("La nota, ubicación o borrador cambiaron. Revisa antes de combinar".into())}
        let request_value=serde_json::to_value(&request).map_err(|_|"No se pudo identificar la combinación de páginas")?;
        let mut attempt=conflict_attempts::begin(self,id,"handwritten",&request_value)?;
        let operation=attempt.as_ref().map(|attempt|attempt.operation_id().to_owned()).unwrap_or_else(||knownext_core::compact_id("conflict"));let base=prepared.draft.as_ref().and_then(|v|v.get("baseFingerprint")).cloned().unwrap_or(Value::Null);
        let local=self.preserve_conflict_copy(id,json!({"content":request.local_content}),base,&operation,"conflict-local")?;
        let disk=self.preserve_conflict_copy(id,json!({"content":prepared.original}),prepared.review["diskFingerprint"].clone(),&operation,"conflict-disk")?;
        let proposed=self.preserve_conflict_copy(id,json!({"content":request.merged_content}),prepared.review["diskFingerprint"].clone(),&operation,"conflict-proposed")?;
        let copies=vec![local,disk,proposed];if let Some(attempt)=&mut attempt{attempt.ready(self,&copies)?;}
        if !same(&snapshot(self,id)?.review,&request){return Err("Una versión cambió durante la conservación. Las tres copias permanecen; revisa de nuevo".into())}
        let now=knownext_core::now_iso();let disk_content=&prepared.review["diskContent"];let disk_hash=handwritten_content_hash(disk_content);let merged_hash=handwritten_content_hash(&request.merged_content);let dirty=disk_hash!=merged_hash;
        let target=if dirty{let mut draft=prepared.draft.unwrap_or_else(||json!({}));draft["documentId"]=json!(id);draft["content"]=request.merged_content.clone();draft["baseFingerprint"]=prepared.review["diskFingerprint"].clone();for field in ["baseContentHash","savedContentHash","diskContentHash"]{draft[field]=json!(disk_hash)}draft["draftContentHash"]=json!(merged_hash);draft["draftUpdatedAt"]=json!(now);Some(draft)}else{None};
        if let Some(attempt)=&mut attempt{attempt.applying(self,&target)?;}
        let write_revision=draft_versions::revision(target.as_ref())?;
        if let Some(draft)=target{draft_store::write(&self.app_data_dir.join("drafts"),id,&draft).map_err(|_|"No se confirmó el borrador; las versiones están en Apartadas. Revisa antes de otra acción")?;}else{self.delete_draft(id)?;}
        if let Some(attempt)=&mut attempt{attempt.complete(self)?;}
        let(project,relative)=document_ref(id)?;let record=json!({"id":id,"projectId":project,"path":relative,"name":Path::new(&relative).file_name().and_then(|n|n.to_str()).unwrap_or("Nota.knote"),"content":request.merged_content,"diskContent":disk_content,"pageCount":request.merged_content["pages"].as_array().unwrap().len(),"updatedAt":now,"baseFingerprint":prepared.review["diskFingerprint"],"baseVerified":true,"diskContentHash":disk_hash,"savedContentHash":disk_hash,"draftWriteRevision":write_revision,"draftContentHash":if dirty{json!(merged_hash)}else{Value::Null},"hasDraft":dirty,"isDirty":dirty,"diskChanged":false,"orphaned":false,"conflictStatus":if dirty{"draft"}else{"none"},"draftUpdatedAt":if dirty{json!(now)}else{Value::Null}});
        Ok(json!({"id":operation,"attemptId":request.attempt_id,"note":record,"preservedCopies":copies,"sourceUnchanged":true,"checkedAt":now}))
    }
    pub(crate) fn review_handwritten_conflict_attempt(&self,id:&str,attempt:&str,payload:Value)->Result<Value,String>{
        let request:Apply=serde_json::from_value(payload).map_err(|_|"La consulta necesita el intento y revisión originales de páginas")?;
        if request.attempt_id.as_deref()!=Some(attempt){return Err("La consulta no corresponde al intento elegido".into());}
        checked(&request.local_content)?;checked(&request.merged_content)?;
        let current=self.review_handwritten_conflict(id)?;let value=serde_json::to_value(&request).map_err(|_|"No se pudo identificar el intento de páginas")?;
        conflict_attempts::observe(self,id,"handwritten",attempt,&value,&current)
    }
}
