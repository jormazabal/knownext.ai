//! Auxiliary metadata must not overwrite an unreadable or newer store.
use super::*;
use std::{fs,io::Read};
#[derive(Clone,Copy)]
pub(super) enum Store{Notes,Auth,Device,Activity,Images}
impl Store{
    fn limit(self)->u64{if matches!(self,Self::Auth|Self::Device){1024*1024}else{32*1024*1024}}
    fn validate(self,owner:Option<&str>,value:&Value)->Result<(),String>{
        let object=value.as_object().ok_or("Metadatos locales no compatibles; se conservan")?;
        if object.get("schemaVersion").is_some_and(|v|v.as_u64()!=Some(1)){return Err("Versión de metadatos no compatible; se conserva".into());}
        if let Some(owner)=owner{if object.get("projectId").is_some_and(|v|v.as_str()!=Some(owner)){return Err("Los metadatos pertenecen a otro proyecto; se conservan".into());}}
        let fields:&[&str]=match self{
            Self::Notes=>&["schemaVersion","markdown","updatedAt"],
            Self::Auth=>&["schemaVersion","isAuthenticated","provider","user","scopes","expiresAt","updatedAt","mock","accessToken","refreshToken","token","apiKey","openaiKey","clientSecret","deviceCode"],
            Self::Device=>&["schemaVersion","deviceCode","expiresAtEpochSeconds","interval"],
            Self::Activity=>&["schemaVersion","projectId","events","updatedAt"],
            Self::Images=>&["schemaVersion","projectId","images","indexedAt","updatedAt"],
        };
        if object.keys().any(|key|!fields.contains(&key.as_str())){return Err("Extensión de metadatos no compatible; se conserva".into());}
        match self{
            Self::Notes if !value["markdown"].is_string()=>return Err("Notas locales no compatibles; se conservan".into()),
            Self::Auth=>{if !value["isAuthenticated"].is_boolean()||!value["scopes"].as_array().is_some_and(|v|v.len()<=1024&&v.iter().all(Value::is_string))||object.get("user").is_some_and(|v|!v.is_null()&&!v.is_object()){return Err("Sesión local no compatible; se conserva".into());}},
            Self::Device=>{if !value["deviceCode"].is_string()||value["expiresAtEpochSeconds"].as_i64().is_none()||value["interval"].as_u64().is_none(){return Err("Desafío de acceso no compatible; se conserva".into());}},
            Self::Activity|Self::Images=>{let key=if matches!(self,Self::Activity){"events"}else{"images"};let entries=value[key].as_array().filter(|v|v.len()<=100_000).ok_or("Colección local no compatible o fuera de límites; se conserva")?;for entry in entries{if !entry.is_object()||entry.get("projectId").is_some_and(|id|id.as_str()!=owner){return Err("Entrada de metadatos no compatible o de otro propietario; se conserva".into());}}},
            _=>{},
        }Ok(())
    }
}
fn directory(path:&Path,optional:bool)->Result<(),String>{match fs::symlink_metadata(path){Ok(meta) if meta.is_dir()&&!batch::linked(&meta)=>Ok(()),Err(e) if optional&&e.kind()==std::io::ErrorKind::NotFound=>Ok(()),_=>Err("Los metadatos requieren una carpeta regular accesible; se conservan".into())}}
pub(super) fn read(root:&Path,path:&Path,store:Store,owner:Option<&str>,default:Value)->Result<Value,String>{
    directory(root,false)?;if let Some(parent)=path.parent(){directory(parent,true)?;}
    let meta=match fs::symlink_metadata(path){Ok(v)=>v,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(default),Err(_)=>return Err("No se pueden consultar los metadatos locales; se conservan".into())};
    if !meta.is_file()||batch::linked(&meta)||meta.len()>store.limit(){return Err("Metadatos no regulares o fuera de límites; se conservan".into());}
    let mut bytes=Vec::new();fs::File::open(path).map_err(|_|"No se pueden abrir los metadatos locales")?.take(store.limit()+1).read_to_end(&mut bytes).map_err(|_|"No se pudo completar la lectura local")?;if bytes.len() as u64>store.limit(){return Err("Metadatos fuera de límites; se conservan".into());}let value:Value=serde_json::from_slice(&bytes).map_err(|_|"Metadatos locales ilegibles; se conservan sin cambios")?;store.validate(owner,&value)?;Ok(value)
}
pub(super) fn before_write(root:&Path,path:&Path,value:&Value)->Result<(),String>{
    let name=path.file_name().and_then(|n|n.to_str()).ok_or("Identidad local no válida")?;
    let(store,owner)=if path==root.join("notes.json"){(Store::Notes,None)}else if path==root.join("auth.json"){(Store::Auth,None)}else if path==root.join("github-device.json"){(Store::Device,None)}else if path.parent()==Some(root.join("activity").as_path()){
        let owner=value["projectId"].as_str().filter(|id|request_scope::portable_id(id)).ok_or("Propietario de actividad no válido")?;
        if name!=format!("{}.json",safe_name(owner)){return Err("La actividad no corresponde a su archivo; se conserva".into());}(Store::Activity,Some(owner))
    }else if path.parent()==Some(root.join("image-index").as_path()){(Store::Images,name.strip_suffix(".json"))}else{return Ok(());};
    read(root,path,store,owner,Value::Null)?;store.validate(owner,value)?;if serde_json::to_vec_pretty(value).map_err(|_|"No se pudieron preparar metadatos")?.len() as u64>store.limit(){return Err("Metadatos fuera de límites; no se han escrito".into());}Ok(())
}
impl LocalApi{
    pub(super) fn auth_checked(&self)->Result<Value,String>{read(&self.app_data_dir,&self.auth_path(),Store::Auth,None,default_auth_status())}
    pub(super) fn device_checked(&self)->Result<Value,String>{read(&self.app_data_dir,&self.github_device_path(),Store::Device,None,json!({}))}
}
