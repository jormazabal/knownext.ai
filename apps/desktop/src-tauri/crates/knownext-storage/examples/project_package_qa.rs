//! Synthetic Windows-produced package for cross-platform QA. No user app state or provider access.
use knownext_storage::LocalApi;
use serde_json::{json,Value};
use base64::Engine;
use std::{fs,path::PathBuf};
fn main()->Result<(),String>{
    let output=PathBuf::from(std::env::args().nth(1).ok_or("Indica una carpeta QA nueva y absoluta")?);
    if !output.is_absolute()||output.exists(){return Err("La carpeta QA debe ser nueva; no se reemplazan datos existentes".into());}
    fs::create_dir(&output).map_err(|e|e.to_string())?;
    let api=LocalApi::new(output.join("state"),"qa".into(),"qa".into());let source=output.join("source");
    let project=api.handle("POST","/api/projects",json!({"name":"Proyecto portable QA19","folderPath":source,"versioningMode":"none"}),vec![]).map_err(|e|e.to_string())?.body;
    let project_id=project["id"].as_str().ok_or("Falta proyecto QA")?;
    fs::create_dir(source.join("Recursos")).map_err(|e|e.to_string())?;fs::create_dir(source.join("Vacía")).map_err(|e|e.to_string())?;
    fs::write(source.join("Plan.md"),"# Proyecto portable QA19\n\n![Pixel](recursos/pixel.png)\n\n[Carpeta vacía](Vacía/)\n").map_err(|e|e.to_string())?;
    let png=base64::engine::general_purpose::STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=").map_err(|e|e.to_string())?;
    fs::write(source.join("Recursos/Pixel.png"),png).map_err(|e|e.to_string())?;fs::write(source.join(".env"),b"QA_EXCLUDED_TOKEN=synthetic_not_a_credential").map_err(|e|e.to_string())?;
    api.handle("POST",&format!("/api/projects/{project_id}/handwritten-notes"),json!({"name":"Pizarra QA19","parentId":null}),vec![])?;
    let job=api.handle("POST","/api/project-transfers",json!({"kind":"export","projectId":project_id}),vec![])?.body;
    let id=job["id"].as_str().ok_or("Falta transferencia QA")?;let ready=api.prepare_project_transfer(id)?;
    if ready["phase"]!="ready"{return Err(ready["error"].as_str().unwrap_or("Preparación fallida").into());}
    let staged=api.begin_project_transfer_delivery(id,ready["archiveSha256"].as_str().ok_or("Falta huella QA")?,&output.join("cache"),None)?;
    let package=output.join("Proyecto QA19.knownext-project.zip");let bytes=api.deliver_project_transfer_file(&staged.path,&package)?;
    let receipt=api.finish_project_transfer_delivery(id,Ok(json!({"status":"saved","fileName":"Proyecto QA19.knownext-project.zip","byteLength":bytes})))?;
    fs::write(output.join("receipt.json"),serde_json::to_vec_pretty(&json!({"receipt":receipt,"package":package,"platform":std::env::consts::OS,"synthetic":true,"providerCalls":0,"originalMarkdown":fs::read_to_string(source.join("Plan.md")).map_err(|e|e.to_string())?})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    println!("{}",serde_json::to_string(&json!({"package":package,"bytes":bytes,"phase":receipt["phase"],"manifest":ready["manifest"],"projectId":project_id,"archiveSha256":ready["archiveSha256"],"metadata":Value::String("synthetic QA".into())})).map_err(|e|e.to_string())?);Ok(())
}
