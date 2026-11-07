//! Verified immutable folder transport. Does not contact Proton or modify a
//! receiving worktree. A successful publish means local exchange publication;
//! only a separately observed recipient receipt can demonstrate delivery.
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use std::{collections::{BTreeMap,HashSet},fs,io::{Read,Write},path::{Path,PathBuf}};
use unicode_normalization::UnicodeNormalization;
use unicase::UniCase;

pub const MAX_FILE_BYTES:u64=64*1024*1024;
pub const MAX_TOTAL_BYTES:u64=512*1024*1024;
pub const MAX_ENTRIES:usize=10_000;
const MAX_MANIFEST_BYTES:u64=8*1024*1024;

#[derive(Debug,Clone,PartialEq,Eq)]
pub struct SyncFolderError { pub code:&'static str }
impl std::fmt::Display for SyncFolderError {fn fmt(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {f.write_str(self.code)}}
impl std::error::Error for SyncFolderError {}
type Result<T>=std::result::Result<T,SyncFolderError>;
fn err(code:&'static str)->SyncFolderError {SyncFolderError{code}}

#[derive(Debug,Clone,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct FileEntry {pub sha256:String,pub bytes:u64}

#[derive(Debug,Clone,Serialize,Deserialize,PartialEq,Eq)]
#[serde(rename_all="camelCase",deny_unknown_fields)]
pub struct Manifest {
    pub schema_version:u32,
    pub project_id:String,
    pub publication_id:String,
    pub sender_id:String,
    pub parent_publication:Option<String>,
    #[serde(deserialize_with="unique_files")]
    pub files:BTreeMap<String,FileEntry>,
    #[serde(default)]
    pub directories:Vec<String>,
    #[serde(default)]
    pub exclusions:Vec<String>,
}

pub struct Snapshot {
    pub manifest:Manifest,
    pub contents:BTreeMap<String,Vec<u8>>,
    source_root:PathBuf,
}

pub fn sha256(bytes:&[u8])->String {format!("{:x}",Sha256::digest(bytes))}
pub fn manifest_hash(manifest:&Manifest)->Result<String> {
    validate_manifest(manifest)?;
    Ok(sha256(&serde_json::to_vec(manifest).map_err(|_|err("manifest-encoding-failed"))?))
}

fn valid_id(id:&str)->Result<()> {
    if id.is_empty() || id.len()>128 || !id.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-".contains(&c)) {return Err(err("invalid-identity"));}
    Ok(())
}
fn valid_hash(hash:&str)->Result<()> {
    if hash.len()!=64 || !hash.bytes().all(|c|c.is_ascii_digit()||(b'a'..=b'f').contains(&c)) {return Err(err("invalid-content-hash"));}
    Ok(())
}
fn reserved(name:&str)->bool {
    name.starts_with('.') || matches!(name.to_ascii_lowercase().as_str(),"owner.lock"|"runtime-owner.lock"|"capture.lock")
}
fn unique_files<'de,D:serde::Deserializer<'de>>(deserializer:D)->std::result::Result<BTreeMap<String,FileEntry>,D::Error> {
    struct FilesVisitor;
    impl<'de> serde::de::Visitor<'de> for FilesVisitor {
        type Value=BTreeMap<String,FileEntry>;
        fn expecting(&self,f:&mut std::fmt::Formatter<'_>)->std::fmt::Result {f.write_str("unique file identities")}
        fn visit_map<A:serde::de::MapAccess<'de>>(self,mut map:A)->std::result::Result<Self::Value,A::Error> {
            let mut files=BTreeMap::new();
            while let Some((key,value))=map.next_entry::<String,FileEntry>()? {
                if files.len()>=MAX_ENTRIES || files.insert(key,value).is_some() {
                    return Err(serde::de::Error::custom("duplicate or excessive file identities"));
                }
            }
            Ok(files)
        }
    }
    deserializer.deserialize_map(FilesVisitor)
}
fn relative_path(path:&str)->Result<()> {
    if path.is_empty()||path.len()>1024||path.starts_with('/')||path.contains(['\\',':']) {return Err(err("unsafe-relative-path"));}
    for component in path.split('/') {
        if component.is_empty()||component=="."||component==".."||reserved(component)
            ||component.ends_with(['.',' '])||component.chars().any(|c|c.is_control()||"<>\"|?*".contains(c)) {
            return Err(err("unsafe-relative-path"));
        }
        let stem=component.split('.').next().unwrap_or("").to_ascii_uppercase();
        if matches!(stem.as_str(),"CON"|"PRN"|"AUX"|"NUL")
            || (stem.len()==4 && (stem.starts_with("COM")||stem.starts_with("LPT")) && matches!(stem.as_bytes()[3],b'1'..=b'9')) {
            return Err(err("nonportable-path"));
        }
    }
    Ok(())
}
#[cfg(windows)]
fn linked(meta:&fs::Metadata)->bool {
    use std::os::windows::fs::MetadataExt;
    meta.file_type().is_symlink() || meta.file_attributes()&0x400!=0
}
#[cfg(not(windows))]
fn linked(meta:&fs::Metadata)->bool {meta.file_type().is_symlink()}

#[derive(Clone,Copy)]
enum Access { Local, Exchange }

/// Exact Windows Cloud Files tags only. Non-surrogate is necessary but not
/// sufficient: WOF/ProjFS/unknown tags remain rejected.
fn supported_cloud_tag(tag:u32)->bool {
    tag&0x2000_0000==0 && tag&!0x0000_f000==0x9000_001a
}

#[cfg(windows)]
fn reparse_tag(path:&Path)->Result<u32> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::{Foundation::INVALID_HANDLE_VALUE,Storage::FileSystem::{FindFirstFileW,FindClose,WIN32_FIND_DATAW}};
    let normalized:PathBuf=path.components().collect();
    let wide:Vec<u16>=normalized.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut data=WIN32_FIND_DATAW::default();
    let handle=unsafe {FindFirstFileW(wide.as_ptr(),&mut data)};
    if handle==INVALID_HANDLE_VALUE {return Err(err("reparse-tag-unavailable"));}
    unsafe {FindClose(handle)};
    if data.dwFileAttributes&0x400==0 {return Err(err("reparse-tag-changed"));}
    Ok(data.dwReserved0)
}

fn unsafe_metadata(path:&Path,meta:&fs::Metadata,access:Access)->Result<bool> {
    if matches!(access,Access::Local) {return Ok(linked(meta));}
    if meta.file_type().is_symlink() {return Ok(true);}
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes()&0x400!=0 {return Ok(!supported_cloud_tag(reparse_tag(path)?));}
    }
    #[cfg(not(windows))]
    let _=path;
    Ok(false)
}

fn unsafe_opened_file(file:&fs::File,meta:&fs::Metadata,access:Access)->Result<bool> {
    if matches!(access,Access::Local) {return Ok(linked(meta));}
    if meta.file_type().is_symlink() {return Ok(true);}
    #[cfg(windows)]
    {
        use std::os::windows::{fs::MetadataExt,io::AsRawHandle};
        use windows_sys::Win32::Storage::FileSystem::{GetFileInformationByHandleEx,FileAttributeTagInfo,FILE_ATTRIBUTE_TAG_INFO};
        if meta.file_attributes()&0x400!=0 {
            let mut info:FILE_ATTRIBUTE_TAG_INFO=unsafe {std::mem::zeroed()};
            let success=unsafe {GetFileInformationByHandleEx(file.as_raw_handle(),FileAttributeTagInfo,&mut info as *mut _ as *mut std::ffi::c_void,std::mem::size_of::<FILE_ATTRIBUTE_TAG_INFO>() as u32)};
            if success==0 {return Err(err("reparse-tag-unavailable"));}
            if info.FileAttributes&0x400!=0 {return Ok(!supported_cloud_tag(info.ReparseTag));}
        }
    }
    #[cfg(not(windows))]
    let _=file;
    Ok(false)
}

/// Check components without following a symlink/junction. Never call this on
/// names excluded by `reserved` when walking user project content.
pub fn regular_directory(path:&Path)->Result<()> {
    directory_guard(path,Access::Local)
}

/// Exchange-only CFAPI compatibility. Strict source/private directory guards
/// are unchanged; no name-surrogate, junction or unknown reparse is accepted.
pub fn regular_exchange_directory(path:&Path)->Result<()> {
    directory_guard(path,Access::Exchange)
}
fn directory_guard(path:&Path,access:Access)->Result<()> {
    if !path.is_absolute() || path.components().any(|c|matches!(c,std::path::Component::ParentDir)) {return Err(err("absolute-directory-required"));}
    let ancestors:Vec<_>=path.ancestors().collect();
    for ancestor in ancestors.into_iter().rev() {
        let meta=fs::symlink_metadata(ancestor).map_err(|_|err("directory-unavailable"))?;
        if unsafe_metadata(ancestor,&meta,access)?||!meta.is_dir() {return Err(err("unsafe-directory"));}
    }
    Ok(())
}
fn file_guard(path:&Path,access:Access)->Result<fs::Metadata> {
    directory_guard(path.parent().ok_or_else(||err("unsafe-file"))?,access)?;
    let meta=fs::symlink_metadata(path).map_err(|_|err("file-unavailable"))?;
    if unsafe_metadata(path,&meta,access)?||!meta.is_file() {return Err(err("unsafe-file"));}
    Ok(meta)
}
fn read_file(path:&Path,limit:u64)->Result<Vec<u8>> {
    read_file_mode(path,limit,Access::Local)
}
fn read_exchange_file(path:&Path,limit:u64)->Result<Vec<u8>> {
    read_file_mode(path,limit,Access::Exchange)
}
fn read_file_mode(path:&Path,limit:u64,access:Access)->Result<Vec<u8>> {
    let before=file_guard(path,access)?;
    if before.len()>limit {return Err(err("file-too-large"));}
    let file=fs::File::open(path).map_err(|_|err("file-unavailable"))?;
    let opened=file.metadata().map_err(|_|err("file-unavailable"))?;
    if !opened.is_file()||unsafe_opened_file(&file,&opened,access)?||opened.len()>limit {return Err(err("unsafe-file"));}
    let mut bytes=Vec::new();
    file.take(limit+1).read_to_end(&mut bytes).map_err(|_|err("incomplete-file"))?;
    let after=file_guard(path,access)?;
    if bytes.len() as u64>limit {return Err(err("file-too-large"));}
    if before.len()!=after.len()||before.modified().ok()!=after.modified().ok()||after.len()!=bytes.len() as u64 {
        return Err(err("source-changed"));
    }
    Ok(bytes)
}
fn directory(parent:&Path,name:&str)->Result<PathBuf> {
    regular_exchange_directory(parent)?;
    let path=parent.join(name);
    match fs::create_dir(&path) {
        Ok(())=>(),Err(e) if e.kind()==std::io::ErrorKind::AlreadyExists=>(),
        Err(_)=>return Err(err("directory-creation-failed")),
    }
    regular_exchange_directory(&path)?;
    Ok(path)
}

pub fn validate_manifest(manifest:&Manifest)->Result<()> {
    if manifest.schema_version!=1 {return Err(err("unsupported-manifest"));}
    valid_id(&manifest.project_id)?;valid_id(&manifest.publication_id)?;valid_id(&manifest.sender_id)?;
    if let Some(parent)=&manifest.parent_publication {valid_id(parent)?;if parent==&manifest.publication_id {return Err(err("invalid-parent"));}}
    if manifest.files.len()+manifest.exclusions.len()+manifest.directories.len()>MAX_ENTRIES {return Err(err("too-many-entries"));}
    let mut total=0u64;
    let mut portable=HashSet::new();
    for (path,file) in &manifest.files {
        relative_path(path)?;valid_hash(&file.sha256)?;
        if file.bytes>MAX_FILE_BYTES {return Err(err("file-too-large"));}
        total=total.checked_add(file.bytes).ok_or_else(||err("snapshot-too-large"))?;
        if total>MAX_TOTAL_BYTES {return Err(err("snapshot-too-large"));}
        if !portable.insert(UniCase::new(path.nfc().collect::<String>())) {return Err(err("portable-name-collision"));}
    }
    // Detect a file also used as a parent directory.
    for path in manifest.files.keys() {
        let mut ancestor=String::new();
        let parts:Vec<_>=path.split('/').collect();
        for part in parts.iter().take(parts.len().saturating_sub(1)) {
            if !ancestor.is_empty(){ancestor.push('/');}ancestor.push_str(part);
            if portable.contains(&UniCase::new(ancestor.nfc().collect::<String>())) {return Err(err("file-directory-collision"));}
        }
    }
    let mut directories=HashSet::new();
    for path in &manifest.directories {
        relative_path(path)?;
        let key=UniCase::new(path.nfc().collect::<String>());
        if portable.contains(&key)||!directories.insert(key) {return Err(err("file-directory-collision"));}
        let parts:Vec<_>=path.split('/').collect();
        let mut parent=String::new();
        for part in parts.iter().take(parts.len().saturating_sub(1)) {
            if !parent.is_empty(){parent.push('/');}parent.push_str(part);
            if portable.contains(&UniCase::new(parent.nfc().collect::<String>())) {return Err(err("file-directory-collision"));}
        }
    }
    // Case/NFC variants of any prefix cannot silently merge directories when
    // materialized on Windows or another case-insensitive filesystem.
    let mut prefixes=BTreeMap::new();
    for path in manifest.files.keys().chain(manifest.directories.iter()) {
        let mut prefix=String::new();
        for component in path.split('/') {
            if !prefix.is_empty(){prefix.push('/');}prefix.push_str(component);
            let key=UniCase::new(prefix.nfc().collect::<String>());
            if let Some(original)=prefixes.insert(key,prefix.clone()) {
                if original!=prefix {return Err(err("portable-name-collision"));}
            }
        }
    }
    for exclusion in &manifest.exclusions {
        if exclusion.is_empty()||exclusion.len()>1024||exclusion.chars().any(char::is_control) {return Err(err("invalid-exclusion"));}
    }
    Ok(())
}

pub fn capture(source:&Path,project_id:&str,publication_id:&str,sender_id:&str,parent_publication:Option<&str>)->Result<Snapshot> {
    regular_directory(source)?;
    let mut snapshot=Snapshot {
        manifest:Manifest{schema_version:1,project_id:project_id.into(),publication_id:publication_id.into(),sender_id:sender_id.into(),parent_publication:parent_publication.map(str::to_owned),files:BTreeMap::new(),directories:Vec::new(),exclusions:Vec::new()},
        contents:BTreeMap::new(),source_root:source.canonicalize().map_err(|_|err("directory-unavailable"))?,
    };
    validate_manifest(&snapshot.manifest)?;
    let mut total=0u64;
    walk(source,"",&mut snapshot,&mut total)?;
    snapshot.manifest.exclusions.sort();
    snapshot.manifest.directories.sort();
    validate_manifest(&snapshot.manifest)?;
    Ok(snapshot)
}

/// Reconstruct a durable outbox capture without re-reading live project bytes.
/// The caller supplies the original project root, not the outbox directory, so
/// the exchange-overlap check continues to protect the live project.
pub fn restore_snapshot(manifest:Manifest,contents:BTreeMap<String,Vec<u8>>,source_root:&Path)->Result<Snapshot> {
    validate_manifest(&manifest)?;
    regular_directory(source_root)?;
    if contents.len()!=manifest.files.len() {return Err(err("snapshot-content-mismatch"));}
    for (path,file) in &manifest.files {
        let bytes=contents.get(path).ok_or_else(||err("snapshot-content-mismatch"))?;
        if bytes.len() as u64!=file.bytes||sha256(bytes)!=file.sha256 {return Err(err("snapshot-content-mismatch"));}
    }
    Ok(Snapshot{manifest,contents,source_root:source_root.canonicalize().map_err(|_|err("directory-unavailable"))?})
}
fn walk(root:&Path,relative:&str,snapshot:&mut Snapshot,total:&mut u64)->Result<()> {
    let here=if relative.is_empty(){root.to_path_buf()}else{root.join(relative)};
    regular_directory(&here)?;
    let entries=fs::read_dir(&here).map_err(|_|err("inventory-unavailable"))?;
    for entry in entries {
        let entry=entry.map_err(|_|err("inventory-unavailable"))?;
        let name=entry.file_name().into_string().map_err(|_|err("nonportable-path"))?;
        let path=if relative.is_empty(){name.clone()}else{format!("{relative}/{name}")};
        // Deliberately before entry.metadata/file_type/stat/open.
        if reserved(&name) {
            snapshot.manifest.exclusions.push(path);
            if snapshot.manifest.exclusions.len()+snapshot.manifest.files.len()+snapshot.manifest.directories.len()>MAX_ENTRIES {return Err(err("too-many-entries"));}
            continue;
        }
        relative_path(&path)?;
        let meta=fs::symlink_metadata(entry.path()).map_err(|_|err("inventory-unavailable"))?;
        if linked(&meta) {return Err(err("unsafe-file"));}
        if meta.is_dir() {
            snapshot.manifest.directories.push(path.clone());
            if snapshot.manifest.exclusions.len()+snapshot.manifest.files.len()+snapshot.manifest.directories.len()>MAX_ENTRIES {return Err(err("too-many-entries"));}
            walk(root,&path,snapshot,total)?;
        }
        else if meta.is_file() {
            if snapshot.manifest.files.len()+snapshot.manifest.exclusions.len()+snapshot.manifest.directories.len()>=MAX_ENTRIES {return Err(err("too-many-entries"));}
            if meta.len()>MAX_FILE_BYTES || total.checked_add(meta.len()).is_none_or(|n|n>MAX_TOTAL_BYTES) {return Err(err("snapshot-too-large"));}
            let bytes=read_file(&entry.path(),MAX_FILE_BYTES)?;
            *total=total.checked_add(bytes.len() as u64).ok_or_else(||err("snapshot-too-large"))?;
            if *total>MAX_TOTAL_BYTES {return Err(err("snapshot-too-large"));}
            snapshot.manifest.files.insert(path.clone(),FileEntry{sha256:sha256(&bytes),bytes:bytes.len() as u64});
            snapshot.contents.insert(path,bytes);
        } else {return Err(err("unsafe-file"));}
    }
    Ok(())
}

/// Atomic create-only commit. Unknown/preexisting data is never replaced.
fn create_only(path:&Path,bytes:&[u8])->Result<()> {
    let parent=path.parent().ok_or_else(||err("unsafe-file"))?;
    regular_exchange_directory(parent)?;
    if fs::symlink_metadata(path).is_ok() {
        if read_exchange_file(path,bytes.len() as u64)?==bytes {return Ok(());}
        return Err(err("occupied-destination"));
    }
    let mut temp=tempfile::Builder::new().prefix(".knownext-sync-").suffix(".tmp").tempfile_in(parent).map_err(|_|err("preparation-failed"))?;
    temp.write_all(bytes).and_then(|_|temp.as_file().sync_all()).map_err(|_|err("preparation-failed"))?;
    regular_exchange_directory(parent)?;
    let result=commit_no_replace(temp.path(),path);
    match result {
        Ok(())=>(),
        Err(_) if fs::symlink_metadata(path).is_ok()=>{
            if read_exchange_file(path,bytes.len() as u64)?!=bytes {return Err(err("occupied-destination"));}
        },
        Err(_)=>return Err(err("publication-failed")),
    }
    if read_exchange_file(path,bytes.len() as u64)?!=bytes {return Err(err("publication-verification-failed"));}
    Ok(())
}
#[cfg(windows)]
fn commit_no_replace(source:&Path,target:&Path)->std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    let source:Vec<u16>=source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target:Vec<u16>=target.as_os_str().encode_wide().chain(Some(0)).collect();
    // No MOVEFILE_REPLACE_EXISTING: fail rather than replace a concurrent writer.
    let result=unsafe {windows_sys::Win32::Storage::FileSystem::MoveFileExW(source.as_ptr(),target.as_ptr(),windows_sys::Win32::Storage::FileSystem::MOVEFILE_WRITE_THROUGH)};
    if result==0 {Err(std::io::Error::last_os_error())}else{Ok(())}
}
#[cfg(not(windows))]
fn commit_no_replace(source:&Path,target:&Path)->std::io::Result<()> {fs::hard_link(source,target)}

fn publications(exchange:&Path,project_id:&str)->Result<PathBuf> {
    valid_id(project_id)?;
    let projects=exchange.join("projects");regular_exchange_directory(&projects)?;
    let project=projects.join(project_id);regular_exchange_directory(&project)?;
    let publications=project.join("publications");regular_exchange_directory(&publications)?;
    Ok(publications)
}

pub fn publish(exchange:&Path,snapshot:&Snapshot)->Result<Manifest> {
    regular_exchange_directory(exchange)?;
    let canonical=exchange.canonicalize().map_err(|_|err("directory-unavailable"))?;
    if canonical.starts_with(&snapshot.source_root)||snapshot.source_root.starts_with(&canonical) {return Err(err("exchange-overlaps-project"));}
    validate_manifest(&snapshot.manifest)?;
    if snapshot.contents.len()!=snapshot.manifest.files.len() {return Err(err("snapshot-content-mismatch"));}
    let descriptor=serde_json::to_vec(&snapshot.manifest).map_err(|_|err("manifest-encoding-failed"))?;
    if descriptor.len() as u64>MAX_MANIFEST_BYTES {return Err(err("manifest-too-large"));}
    let objects=directory(exchange,"objects")?;
    let projects=directory(exchange,"projects")?;
    let project=directory(&projects,&snapshot.manifest.project_id)?;
    let descriptors=directory(&project,"publications")?;
    for (path,file) in &snapshot.manifest.files {
        let bytes=snapshot.contents.get(path).ok_or_else(||err("snapshot-content-mismatch"))?;
        if bytes.len() as u64!=file.bytes||sha256(bytes)!=file.sha256 {return Err(err("snapshot-content-mismatch"));}
        create_only(&objects.join(format!("{}.blob",file.sha256)),bytes)?;
    }
    // Descriptor is the finalization marker, after all durable verified objects.
    create_only(&descriptors.join(format!("{}.json",snapshot.manifest.publication_id)),&descriptor)?;
    read_verified(exchange,&snapshot.manifest)?;
    Ok(snapshot.manifest.clone())
}

pub fn inspect(exchange:&Path,project_id:&str,publication_id:&str)->Result<Manifest> {
    regular_exchange_directory(exchange)?;valid_id(project_id)?;valid_id(publication_id)?;
    let path=publications(exchange,project_id)?.join(format!("{publication_id}.json"));
    let bytes=read_exchange_file(&path,MAX_MANIFEST_BYTES)?;
    let manifest:Manifest=serde_json::from_slice(&bytes).map_err(|_|err("invalid-manifest"))?;
    validate_manifest(&manifest)?;
    if manifest.project_id!=project_id||manifest.publication_id!=publication_id {return Err(err("manifest-identity-mismatch"));}
    Ok(manifest)
}

pub fn list(exchange:&Path,project_id:&str)->Result<Vec<Manifest>> {
    regular_exchange_directory(exchange)?;
    let path=publications(exchange,project_id)?;
    let mut manifests=Vec::new();
    let mut budget=0usize;
    for entry in fs::read_dir(path).map_err(|_|err("inventory-unavailable"))? {
        let entry=entry.map_err(|_|err("inventory-unavailable"))?;
        let name=entry.file_name().into_string().map_err(|_|err("unexpected-exchange-entry"))?;
        if name.ends_with(".tmp") {continue;}
        let id=name.strip_suffix(".json").ok_or_else(||err("unexpected-exchange-entry"))?;
        if manifests.len()>=MAX_ENTRIES {return Err(err("too-many-publications"));}
        let manifest=inspect(exchange,project_id,id)?;
        budget=budget.checked_add(serde_json::to_vec(&manifest).map_err(|_|err("invalid-manifest"))?.len()).ok_or_else(||err("inventory-too-large"))?;
        if budget as u64>MAX_MANIFEST_BYTES {return Err(err("inventory-too-large"));}
        manifests.push(manifest);
    }
    manifests.sort_by(|a,b|a.publication_id.cmp(&b.publication_id));
    Ok(manifests)
}

/// Discover only managed projects whose complete published inventory can be
/// verified within one bounded scan. A partial cloud delivery is an explicit
/// error so it cannot be mistaken for an empty exchange or an intentional delete.
pub fn discover_projects(exchange:&Path)->Result<Vec<String>> {
    regular_exchange_directory(exchange)?;
    let mut has_projects=false;
    let mut has_objects=false;
    for entry in fs::read_dir(exchange).map_err(|_|err("inventory-unavailable"))? {
        let entry=entry.map_err(|_|err("inventory-unavailable"))?;
        let name=entry.file_name().into_string().map_err(|_|err("unexpected-exchange-entry"))?;
        // Never inspect coordination/secret filenames, even when unexpected.
        match name.as_str() {
            "projects"=>{regular_exchange_directory(&entry.path())?;has_projects=true;},
            "objects"=>{regular_exchange_directory(&entry.path())?;has_objects=true;},
            _=>return Err(err("unexpected-exchange-entry")),
        }
    }
    if !has_projects&&!has_objects {return Ok(Vec::new());}
    if !has_projects||!has_objects {return Err(err("incomplete-exchange"));}
    let mut projects=Vec::new();
    let mut bytes_budget=0u64;
    let mut entries_budget=0usize;
    for entry in fs::read_dir(exchange.join("projects")).map_err(|_|err("inventory-unavailable"))? {
        let entry=entry.map_err(|_|err("inventory-unavailable"))?;
        let id=entry.file_name().into_string().map_err(|_|err("invalid-identity"))?;
        valid_id(&id)?;regular_exchange_directory(&entry.path())?;
        if projects.len()>=128 {return Err(err("too-many-projects"));}
        let manifests=list(exchange,&id)?;
        if manifests.is_empty() {return Err(err("incomplete-project"));}
        for manifest in &manifests {
            for file in manifest.files.values() {
                bytes_budget=bytes_budget.checked_add(file.bytes).ok_or_else(||err("discovery-budget-exceeded"))?;
            }
            entries_budget=entries_budget.checked_add(manifest.files.len()).ok_or_else(||err("discovery-budget-exceeded"))?;
            if bytes_budget>MAX_TOTAL_BYTES||entries_budget>MAX_ENTRIES {return Err(err("discovery-budget-exceeded"));}
            read_verified(exchange,manifest)?;
        }
        projects.push(id);
    }
    projects.sort();
    Ok(projects)
}

/// Verify content before the caller can prepare a receiving worktree operation.
/// Partial/out-of-order cloud delivery produces an error, never a partial map.
pub fn read_verified(exchange:&Path,manifest:&Manifest)->Result<BTreeMap<String,Vec<u8>>> {
    regular_exchange_directory(exchange)?;validate_manifest(manifest)?;
    let actual=inspect(exchange,&manifest.project_id,&manifest.publication_id)?;
    if &actual!=manifest {return Err(err("manifest-changed"));}
    let objects=exchange.join("objects");regular_exchange_directory(&objects)?;
    let mut contents=BTreeMap::new();
    for (path,file) in &manifest.files {
        let bytes=read_exchange_file(&objects.join(format!("{}.blob",file.sha256)),MAX_FILE_BYTES)?;
        if bytes.len() as u64!=file.bytes||sha256(&bytes)!=file.sha256 {return Err(err("content-verification-failed"));}
        contents.insert(path.clone(),bytes);
    }
    Ok(contents)
}

#[cfg(test)]
mod cfapi_policy_tests {
    use super::*;
    #[test]
    fn only_exact_cloud_variants_are_exchange_compatible() {
        for variant in 0..16 {assert!(supported_cloud_tag(0x9000_001a | variant<<12));}
        for tag in [0,0xA000_000C,0xA000_0003,0x8000_0017,0x9000_1018,0x9001_001a,0x9000_001b,0xb000_001a] {
            assert!(!supported_cloud_tag(tag),"{tag:x}");
        }
    }
    #[test]
    fn no_cloud_variant_can_carry_the_name_surrogate_bit() {
        for variant in 0..16 {
            let tag=0x9000_001a | variant<<12;
            assert!(!supported_cloud_tag(tag|0x2000_0000));
        }
    }
}
