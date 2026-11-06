//! Cooperative ownership of a shared source folder, independent of private state.
//! Keep the lock inode stable; never remove it to release a project.
use super::*;
use std::{
    fs::{self, File, OpenOptions},
    sync::{Arc, Mutex, OnceLock, Weak},
};

const DIRECTORY: &str = ".knownext-runtime";
const IGNORE: &[u8] = b"*\n";
mod operations;
pub(crate) struct ProjectOwner {
    _file: File,
    state: PathBuf,
    operations: Mutex<operations::Operations>,
}
static OWNERS: OnceLock<Mutex<BTreeMap<PathBuf, Weak<ProjectOwner>>>> = OnceLock::new();

fn directory(path: &Path, trusted: Option<&Path>) -> Result<PathBuf, String> {
    for ancestor in path.ancestors() {
        if trusted == Some(ancestor) {
            break;
        }
        let meta = fs::symlink_metadata(ancestor)
            .map_err(|_| "La carpeta del proyecto no está disponible; no se ha creado otra")?;
        if !meta.is_dir() || batch::linked(&meta) {
            return Err(
                "La coordinación del proyecto requiere una carpeta regular sin enlaces".into(),
            );
        }
    }
    path.canonicalize()
        .map_err(|_| "No se puede verificar la carpeta del proyecto".into())
}
fn regular(path: &Path, expected: Option<&[u8]>) -> Result<(), String> {
    let meta = fs::symlink_metadata(path)
        .map_err(|_| "La coordinación del proyecto no está completa; se conserva para revisión")?;
    if !meta.is_file()
        || batch::linked(&meta)
        || meta.len() != expected.map_or(0, |v| v.len() as u64)
    {
        return Err(
            "La coordinación del proyecto contiene un archivo desconocido; se conserva sin cambios"
                .into(),
        );
    }
    if let Some(bytes) = expected {
        if fs::read(path).map_err(|_| "No se puede revisar la coordinación del proyecto")? != bytes
        {
            return Err(
                "La coordinación del proyecto tiene un formato desconocido; se conserva".into(),
            );
        }
    }
    Ok(())
}
fn acquire(root: &Path, state: &Path) -> Result<Arc<ProjectOwner>, String> {
    let mut owners = OWNERS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| "No se puede coordinar el acceso al proyecto")?;
    owners.retain(|_, owner| owner.strong_count() > 0);
    let internal = root.join(DIRECTORY);
    match fs::create_dir(&internal) {
        Ok(()) => {
            atomic_io::create(&internal.join(".gitignore"),IGNORE).map_err(|_|"No se pudo preparar la coordinación del proyecto; no se han modificado sus documentos")?;
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(_) => {
            return Err(
                "No se puede proteger la carpeta del proyecto; comprueba sus permisos".into(),
            )
        }
    }
    let meta = fs::symlink_metadata(&internal)
        .map_err(|_| "La coordinación del proyecto no está disponible")?;
    if !meta.is_dir() || batch::linked(&meta) {
        return Err("La coordinación del proyecto no es una carpeta regular; se conserva".into());
    }
    regular(&internal.join(".gitignore"), Some(IGNORE))?;
    for entry in
        fs::read_dir(&internal).map_err(|_| "No se puede revisar la coordinación del proyecto")?
    {
        let entry = entry.map_err(|_| "No se puede revisar la coordinación del proyecto")?;
        if entry.file_name() != ".gitignore" && entry.file_name() != "owner.lock" {
            return Err(
                "La carpeta de coordinación contiene datos desconocidos; se conservan sin cambios"
                    .into(),
            );
        }
    }
    let lock = internal.join("owner.lock");
    match fs::symlink_metadata(&lock) {
        Ok(_) => regular(&lock, None)?,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("No se puede comprobar la coordinación del proyecto".into()),
    }
    if let Some(owner) = owners.get(root).and_then(Weak::upgrade) {
        if owner.state != state {
            return Err(busy());
        }
        return Ok(owner);
    }
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock)
        .map_err(|_| "No se puede reservar la carpeta del proyecto")?;
    regular(&lock, None)?;
    fs2::FileExt::try_lock_exclusive(&file).map_err(|error| {
        if error.kind() == std::io::ErrorKind::WouldBlock
            || error.raw_os_error() == fs2::lock_contended_error().raw_os_error()
        {
            busy()
        } else {
            "No se pudo confirmar la protección del proyecto; no se han modificado sus documentos"
                .into()
        }
    })?;
    let owner = Arc::new(ProjectOwner {
        _file: file,
        state: state.into(),
        operations: Default::default(),
    });
    owners.insert(root.into(), Arc::downgrade(&owner));
    Ok(owner)
}
fn busy() -> String {
    "Otra instancia o perfil está utilizando esta carpeta de proyecto. Cierra esa aplicación y vuelve a abrir el proyecto. Tus cambios locales se conservan.".into()
}

impl LocalApi {
    pub(super) fn claim_project_root(&self, path: &Path) -> Result<PathBuf, String> {
        // Android's per-app mount namespace can expose /data/user/0 as an OS
        // alias to /data/data. Verify the private root itself, then use it as
        // the boundary for managed descendants; do not trust links below it.
        let private = fs::symlink_metadata(&self.app_data_dir)
            .map_err(|_| "No se puede comprobar el almacén privado")?;
        if !private.is_dir() || batch::linked(&private) {
            return Err("El almacén privado requiere una carpeta regular".into());
        }
        let state = self
            .app_data_dir
            .canonicalize()
            .map_err(|_| "No se puede verificar el almacén privado")?;
        let managed = path.starts_with(&self.app_data_dir);
        let root = directory(path, managed.then_some(self.app_data_dir.as_path()))?;
        if managed && !root.starts_with(&state) {
            return Err("La carpeta del proyecto sale del almacén privado verificado".into());
        }
        let mut held = self
            .project_owners
            .lock()
            .map_err(|_| "No se puede coordinar este proyecto")?;
        // Recheck the on-disk format even when this service already holds a lease.
        let owner = acquire(&root, &state)?;
        if held.len() >= 1024 && !held.contains_key(&root) {
            return Err("Cierra la aplicación para liberar los proyectos previamente utilizados antes de abrir más carpetas".into());
        }
        held.insert(root, owner);
        Ok(path.into())
    }
}
