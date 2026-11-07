//! One cooperative application process per state directory. Never delete this inode.
use std::{fs::{self,File,OpenOptions},path::Path};

pub struct RuntimeOwner { _file:File }
pub fn acquire_runtime_owner(root:&Path)->Result<RuntimeOwner,String>{
    let directory=fs::symlink_metadata(root).map_err(|_|"No se puede consultar el estado local")?;
    if !directory.is_dir()||crate::batch::linked(&directory){return Err("El estado local requiere una carpeta regular".into());}
    let path=root.join("runtime-owner.lock");
    match fs::symlink_metadata(&path){
        Ok(meta) if !meta.is_file()||crate::batch::linked(&meta)||meta.len()!=0=>return Err("El archivo de coordinación local no es compatible. Se conserva sin cambios".into()),
        Ok(_)=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(_)=>return Err("No se puede comprobar la coordinación del estado local".into()),
    }
    let file=OpenOptions::new().read(true).write(true).create(true).truncate(false).open(&path).map_err(|_|"No se puede preparar la coordinación del estado local")?;
    if !file.metadata().map_err(|_|"No se puede comprobar la coordinación local")?.is_file(){return Err("La coordinación local requiere un archivo regular".into());}
    fs2::FileExt::try_lock_exclusive(&file).map_err(|e|{
        if e.kind()==std::io::ErrorKind::WouldBlock||e.raw_os_error()==fs2::lock_contended_error().raw_os_error(){"Otra instancia está utilizando este estado local. Cierra esa instancia antes de abrirlo de nuevo.".to_string()}else{"No se pudo proteger el estado local frente a otra instancia. No se han iniciado sus servicios.".to_string()}
    })?;
    Ok(RuntimeOwner{_file:file})
}
