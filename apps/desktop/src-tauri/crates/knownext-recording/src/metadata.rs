use super::*;
use std::io::Read;
use sha2::{Digest,Sha256};
pub(super) fn linked(meta:&fs::Metadata)->bool{
    if meta.file_type().is_symlink(){return true;}
    #[cfg(windows)]{use std::os::windows::fs::MetadataExt;if meta.file_attributes()&0x400!=0{return true;}}
    false
}
pub(super) fn directory(path:&Path)->Result<(),String>{let meta=fs::symlink_metadata(path).map_err(|_|"No se puede consultar la carpeta de grabación")?;if !meta.is_dir()||linked(&meta){return Err("La grabación requiere una carpeta regular; se conserva el contenido".into());}Ok(())}
pub(super) fn bytes(path:&Path)->Result<Option<Vec<u8>>,String>{
    directory(path.parent().ok_or("Ruta de grabación inválida")?)?;
    let meta=match fs::symlink_metadata(path){Ok(v)=>v,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(_)=>return Err("No se pueden consultar los metadatos de grabación".into())};
    if !meta.is_file()||linked(&meta)||meta.len()>4*1024*1024{return Err("Metadatos de grabación no regulares o fuera de límites; se conservan".into());}
    let mut bytes=Vec::new();File::open(path).map_err(|_|"No se pueden abrir los metadatos de grabación")?.take(4*1024*1024+1).read_to_end(&mut bytes).map_err(|_|"No se pudo completar la lectura de grabación")?;if bytes.len()>4*1024*1024{return Err("Metadatos de grabación fuera de límites; se conservan".into());}Ok(Some(bytes))
}
pub(super) fn hash(bytes:&[u8])->String{format!("{:x}",Sha256::digest(bytes))}
pub(super) fn preserve_usage_origin(root:&Path,raw:&[u8])->Result<(),String>{
    directory(root)?;
    let folder=root.join("sessions-recovery");
    match fs::symlink_metadata(&folder){Ok(_)=>directory(&folder)?,Err(error) if error.kind()==std::io::ErrorKind::NotFound=>fs::create_dir(&folder).map_err(|_|"No se pudo preparar la copia de sesión")?,Err(_)=>return Err("No se puede consultar la copia previa de sesión".into())}
    let target=folder.join(format!("usage-origin-{}.json",hash(raw)));
    if let Some(existing)=bytes(&target)?{return if existing==raw{Ok(())}else{Err("La copia previa de sesión no coincide; se conserva el original".into())};}
    let mut count=0u64;let mut size=0u64;
    for entry in fs::read_dir(&folder).map_err(|_|"No se puede completar el inventario de copias de sesión")? {
        let entry=entry.map_err(|_|"No se pudo consultar una copia de sesión")?;let meta=fs::symlink_metadata(entry.path()).map_err(|_|"Copia de sesión no accesible")?;
        if !meta.is_file()||linked(&meta){return Err("La recuperación de sesiones contiene elementos no regulares; se conserva".into());}
        count+=1;size=size.checked_add(meta.len()).ok_or("Tamaño de recuperación no representable")?;
        if count>=500||size.checked_add(raw.len() as u64).is_none_or(|total|total>128*1024*1024){return Err("La recuperación de sesiones alcanza su límite; no se inicia otro envío de audio".into());}
    }
    let mut file=OpenOptions::new().create_new(true).write(true).open(&target).map_err(|_|"No se pudo conservar la sesión previa")?;
    file.write_all(raw).and_then(|_|file.sync_all()).map_err(|_|"No se pudo confirmar la copia previa de sesión")?;
    if bytes(&target)?.as_deref()!=Some(raw){return Err("La copia previa de sesión no coincide; no se sustituye el original".into());}
    Ok(())
}
pub(super) fn settings(root:&Path)->(Settings,Option<String>,Option<String>){
    match bytes(&root.join("settings.json")){
        Ok(None)=>(Settings::default(),None,None),
        Ok(Some(raw))=>{let revision=Some(hash(&raw));match serde_json::from_slice::<Settings>(&raw).map_err(|_|"Preferencias de grabación no compatibles; se conserva el archivo".to_string()).and_then(|value|{validate_settings(&value)?;Ok(value)}){Ok(value)=>(value,None,revision),Err(error)=>(Settings::default(),Some(error),revision)}},
        Err(error)=>(Settings::default(),Some(error),None),
    }
}
pub(super) fn session(root:&Path,id:&str)->Result<Option<(Session,Vec<u8>)>,String>{
    if uuid::Uuid::parse_str(id).is_err(){return Err("Identidad de sesión no compatible".into());}
    let Some(raw)=bytes(&root.join(id).join("session.json"))? else{return Ok(None);};
    let value:Session=serde_json::from_slice(&raw).map_err(|_|"Sesión de grabación no compatible; se conserva sin cambios")?;
    if value.id!=id{return Err("La sesión no corresponde a su carpeta; se conserva".into());}validate_settings(&value.settings)?;
    if value.portable_origin.as_ref().is_some_and(|origin|!origin.is_supported()){return Err("Origen portable de sesión futuro o incompatible; se conserva sin cambios".into());}
    Ok(Some((value,raw)))
}
pub(super) fn archive(root:&Path,category:&str,raw:&[u8])->Result<String,String>{
    directory(root)?;let folder=root.join(category);match fs::symlink_metadata(&folder){Ok(_)=>directory(&folder)?,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>fs::create_dir(&folder).map_err(|_|"No se pudo preparar la copia de grabación")?,Err(_)=>return Err("No se puede consultar la recuperación de grabación".into())};directory(&folder)?;
    let id=uuid::Uuid::new_v4().to_string();let path=folder.join(format!("{id}.json"));let mut file=OpenOptions::new().create_new(true).write(true).open(&path).map_err(|_|"No se pudo conservar la copia de grabación")?;file.write_all(raw).and_then(|_|file.sync_all()).map_err(|_|"No se pudo confirmar la copia de grabación")?;drop(file);if bytes(&path)?.as_deref()!=Some(raw){return Err("La copia de grabación no coincide; no se ha sustituido el original".into());}Ok(id)
}
pub(super) fn recover_settings(root:&Path,revision:&str)->Result<Settings,String>{
    let path=root.join("settings.json");let raw=bytes(&path)?.ok_or("Las preferencias ya no están presentes; vuelve a revisar")?;
    if hash(&raw)!=revision{return Err("Las preferencias cambiaron; vuelve a revisar antes de recuperarlas".into());}
    if serde_json::from_slice::<Settings>(&raw).ok().is_some_and(|value|validate_settings(&value).is_ok()){return Err("Las preferencias ya son compatibles; vuelve a consultar el estado".into());}
    archive(root,"settings-recovery",&raw)?;
    if bytes(&path)?.as_deref()!=Some(raw.as_slice()){return Err("Las preferencias cambiaron durante la conservación; la copia permanece disponible".into());}
    let settings=Settings{start_with_windows:false,..Settings::default()};validate_settings(&settings)?;atomic_json(&path,&settings)?;Ok(settings)
}
