//! Operational AI data: failed reads never become writable empty collections.
use super::*;
use std::{fs, io::Read};

#[derive(Clone, Copy)]
pub(super) enum Store { Usage, Jobs, Policy, Budgets }
impl Store {
    fn limit(self) -> u64 {match self{Self::Budgets=>256*1024,Self::Policy=>64*1024,Self::Usage=>64*1024*1024,Self::Jobs=>32*1024*1024}}
    fn path(self, root:&Path, owner:&str)->PathBuf {
        match self { Self::Budgets=>root.join("ai/usage-policy.json"),Self::Usage=>root.join("ai/usage.json"),Self::Jobs=>root.join("ai-research").join(format!("{owner}.json")),Self::Policy=>root.join("ai-research").join(format!("{owner}.policy.json")) }
    }
    fn validate(self, owner:&str, value:&Value)->Result<(),String> {
        if matches!(self,Self::Budgets){return ai_usage::budget::validate(value);}
        let object=value.as_object().ok_or("Estado operativo IA no compatible; se conserva")?;
        if matches!(self,Self::Usage)&&object.get("schemaVersion").and_then(Value::as_u64)==Some(2){return ai_usage::validate_usage_store(value);}
        if object.get("schemaVersion").is_some_and(|version|version.as_u64()!=Some(1)) {return Err("Versión operativa IA no compatible; se conserva".into());}
        if !matches!(self,Self::Usage)&&object.get("projectId").is_some_and(|id|id.as_str()!=Some(owner)){return Err("El estado operativo IA pertenece a otro proyecto; se conserva".into());}
        let fields:&[&str]=match self {
            Self::Budgets=>unreachable!(),
            Self::Usage=>&["entries","schemaVersion","updatedAt"],
            Self::Jobs=>&["jobs","projectId","schemaVersion","updatedAt"],
            Self::Policy=>&["projectId","schemaVersion","allowedSourceScopes","blockedDomains","preferredLanguage","defaultDepth","maxEstimatedCostEur","maxSources","confirmBeforeCreating","allowPrivateProjectDocuments","minimumSources","requireCitations","updatedAt"],
        };
        if object.keys().any(|key|!fields.contains(&key.as_str())){return Err("Extensión operativa IA no compatible; se conserva".into());}
        if matches!(self,Self::Policy){
            for field in ["allowedSourceScopes","blockedDomains"] { if !value[field].as_array().is_some_and(|items|items.len()<=1024&&items.iter().all(Value::is_string)){return Err("Lista de política IA no compatible; se conserva".into());} }
            if !matches!(value["preferredLanguage"].as_str(),Some("es"|"en"|"auto"))||!matches!(value["defaultDepth"].as_str(),Some("quick"|"standard"|"deep")) {return Err("Idioma o profundidad de política no compatibles; se conservan".into());}
            if !value["maxEstimatedCostEur"].as_f64().is_some_and(|v|v.is_finite()&&v>0.0)||!value["maxSources"].as_u64().is_some_and(|v|v>0&&v<=1000)||!value["minimumSources"].as_u64().is_some_and(|v|v<=1000){return Err("Límites de política IA no compatibles; se conservan".into());}
            for field in ["confirmBeforeCreating","allowPrivateProjectDocuments","requireCitations"] {if !value[field].is_boolean(){return Err("Permiso de política IA no compatible; se conserva".into());}}
        } else {
            let key=if matches!(self,Self::Usage){"entries"}else{"jobs"};
            let max=if matches!(self,Self::Usage){5000}else{10_000};
            let entries=value[key].as_array().filter(|v|v.len()<=max).ok_or("Colección operativa IA no compatible o fuera de límites; se conserva")?;
            let mut ids=BTreeSet::new();
            for entry in entries {
                if !entry.is_object(){return Err("Entrada operativa IA no compatible; se conserva".into());}
                if matches!(self,Self::Jobs) {
                    if entry.get("projectId").is_some_and(|id|id.as_str()!=Some(owner))||!entry["id"].as_str().is_some_and(|id|request_scope::portable_id(id)&&ids.insert(id)){return Err("Identidad de investigación no compatible; se conserva".into());}
                } else {
                    if entry.get("projectId").is_some_and(|id|!id.is_null()&&!id.as_str().is_some_and(request_scope::portable_id)){return Err("Identidad de consumo no compatible; se conserva".into());}
                    ai_usage::validate_usage_entry(entry)?;
                }
            }
        }
        Ok(())
    }
}
fn directory(path:&Path,optional:bool)->Result<(),String>{match fs::symlink_metadata(path){Ok(meta) if meta.is_dir()&&!batch::linked(&meta)=>Ok(()),Err(e) if optional&&e.kind()==std::io::ErrorKind::NotFound=>Ok(()),_=>Err("El estado operativo IA requiere una carpeta regular accesible; se conserva".into())}}
pub(super) fn read(root:&Path,owner:&str,store:Store,default:Value)->Result<Value,String>{
    snapshot(root,owner,store,default).map(|(value,_)|value)
}
pub(super) fn snapshot(root:&Path,owner:&str,store:Store,default:Value)->Result<(Value,Option<Vec<u8>>),String>{
    if !request_scope::portable_id(owner){return Err("Identidad operativa IA no válida".into());}
    directory(root,false)?;let path=store.path(root,owner);directory(path.parent().ok_or("Almacén IA no válido")?,true)?;
    let metadata=match fs::symlink_metadata(&path){Ok(v)=>v,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok((default,None)),Err(_)=>return Err("No se puede consultar el estado operativo IA; se conserva".into())};
    if !metadata.is_file()||batch::linked(&metadata)||metadata.len()>store.limit(){return Err("Estado operativo IA no regular o fuera de límites; se conserva".into());}
    let mut bytes=Vec::new();fs::File::open(&path).map_err(|_|"No se puede abrir el estado operativo IA")?.take(store.limit()+1).read_to_end(&mut bytes).map_err(|_|"No se pudo completar la lectura operativa IA")?;
    if bytes.len() as u64>store.limit(){return Err("Estado operativo IA fuera de límites; se conserva".into());}
    let value:Value=serde_json::from_slice(&bytes).map_err(|_|"Estado operativo IA ilegible; se conserva sin cambios")?;
    if matches!(store,Store::Usage)&&value["schemaVersion"]!=2&&bytes.len()>32*1024*1024{return Err("El consumo legado supera32MiB; se conserva sin convertir".into());}
    store.validate(owner,&value)?;Ok((value,Some(bytes)))
}
pub(super) fn before_write(root:&Path,path:&Path,value:&Value)->Result<(),String>{
    let name=path.file_name().and_then(|n|n.to_str()).ok_or("Identidad de archivo no válida")?;
    let (store,owner)=if path==root.join("ai/usage-policy.json"){(Store::Budgets,"budgets")}else if path==root.join("ai/usage.json"){(Store::Usage,"usage")}else if path.parent()==Some(root.join("ai-research").as_path()){
        if let Some(owner)=name.strip_suffix(".policy.json"){(Store::Policy,owner)}else if let Some(owner)=name.strip_suffix(".json"){(Store::Jobs,owner)}else{return Err("Archivo operativo IA no compatible".into());}
    }else{return Ok(());};
    read(root,owner,store,Value::Null)?;store.validate(owner,value)?;
    if serde_json::to_vec_pretty(value).map_err(|_|"No se pudo preparar el estado operativo IA")?.len() as u64>store.limit(){return Err("Estado operativo IA fuera de límites; no se ha escrito".into());}Ok(())
}
impl LocalApi {
    pub(super) fn note_research_persistence_failure(&self,project:&str,job:&str){
        if let Ok(mut failures)=self.research_failures.lock(){if failures.len()<128{failures.insert(format!("{project}::{job}"));}}
    }
    pub(super) fn observed_research_job(&self,project:&str,mut job:Value)->Value{
        let id=job["id"].as_str().unwrap_or("");
        let failed=self.research_failures.lock().map(|v|v.contains(&format!("{project}::{id}"))).unwrap_or(true);
        let terminal=matches!(job["status"].as_str(),Some("ready"|"ready_pass"|"ready_warning"|"cancelled"|"failed"|"failed_runtime"|"failed_provider"|"failed_quality"|"failed_publish"));
        if failed||(!terminal&&job["runtimeId"].as_str()!=Some(&self.runtime_id)){
            let message=if failed{"No se pudo confirmar el último estado local. Se conserva la información disponible; revisa el resultado antes de iniciar otra investigación."}else{"La ejecución anterior se interrumpió. Se conserva su información; revisa documentos y resultados antes de iniciar otra investigación."};
            job["status"]=json!("failed_runtime");job["phase"]=json!("failed_runtime");job["currentPhase"]=json!("failed_runtime");job["progress"]=json!(100);job["progressMessage"]=json!(message);job["message"]=json!(message);job["persistenceWarning"]=json!(message);job["error"]=json!({"code":if failed{"persistence_unconfirmed"}else{"interrupted_runtime"},"message":message,"retryable":false});
        }job
    }
    pub(super) fn usage_checked(&self)->Result<Value,String>{read(&self.app_data_dir,"usage",Store::Usage,json!({"entries":[]}))}
    pub(super) fn research_jobs_checked(&self,project:&str)->Result<Value,String>{read(&self.app_data_dir,project,Store::Jobs,json!({"jobs":[]}))}
    pub(super) fn research_state_preflight(&self,project:&str)->Result<(),String>{self.usage_checked()?;self.research_jobs_checked(project)?;self.ai_research_policy(project)?;self.spend_preflight(Some(project))?;Ok(())}
}
