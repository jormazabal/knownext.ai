use knownext_storage::{LocalApi,read_transfer_file};
use serde_json::{json,Value};
use std::{fs,path::PathBuf};

fn request(api:&LocalApi,method:&str,path:&str,body:Value)->Value {let response=api.handle(method,path,body,vec![]).unwrap();assert!(response.status<400,"{}: {}",path,response.body);response.body}
fn post(api:&LocalApi,path:&str,body:Value)->Value{request(api,"POST",path,body)}

#[test]
fn reviewed_local_images_are_independent_and_catalogues_preserve_collisions_and_unknown_formats(){
    let owned=tempfile::tempdir().unwrap();
    let first=LocalApi::new(owned.path().join("first"),"qa".into(),"test".into());
    let second=LocalApi::new(owned.path().join("second"),"qa".into(),"test".into());
    let project=post(&first,"/api/projects",json!({"name":"Owned images","versioningMode":"none","syncMode":"none"}));
    let project_id=project["id"].as_str().unwrap();
    let root=PathBuf::from(project["folderPath"].as_str().unwrap());
    fs::create_dir(root.join("assets")).unwrap();
    image::RgbaImage::new(2,2).save(root.join("assets/logo.png")).unwrap();
    let image=fs::read(root.join("assets/logo.png")).unwrap();
    let markdown="# {{titulo}}\n\n![Marca](assets/logo.png \"Título\")\n\n![Referencia][marca]\n\n[marca]: assets/logo.png\n\n<img src=\"assets/logo.png\" alt=\"Marca HTML\" width=\"20\">\n";
    fs::write(root.join("Base.md"),markdown).unwrap();
    let document_id=format!("{project_id}::Base.md");
    let prepared=post(&first,"/api/document-templates/source/prepare",json!({"documentId":document_id,"markdown":markdown}));
    assert_eq!(prepared["resources"].as_array().unwrap().len(),1);
    assert_eq!(prepared["resources"][0]["mimeType"],"image/png");
    assert_eq!(prepared["markdown"].as_str().unwrap().matches("data:image/png;base64,").count(),3);
    assert!(prepared["markdown"].as_str().unwrap().contains("Título"));
    assert!(!owned.path().join("first/document-templates").exists());
    assert_eq!(fs::read(root.join("Base.md")).unwrap(),markdown.as_bytes());
    assert_eq!(fs::read(root.join("assets/logo.png")).unwrap(),image);
    let saved=post(&first,"/api/document-templates",json!({"name":"Marca portable","description":"Texto y marca","markdown":prepared["markdown"]}));
    let second_template=post(&first,"/api/document-templates",json!({"name":"Acta portable","description":"Campos","markdown":"# {{titulo}}\n\n{{asistentes}}"}));
    fs::write(root.join("assets/logo.png"),b"Changed owned image after snapshot").unwrap();
    let selected=json!({"entries":[{"id":saved["id"],"revision":saved["revision"]},{"id":second_template["id"],"revision":second_template["revision"]}]});
    let file=post(&first,"/api/document-templates/transfer/catalog/export",selected.clone());
    let content=file["content"].as_str().unwrap();
    let portable:Value=serde_json::from_str(content).unwrap();
    assert_eq!(portable.as_object().unwrap().len(),3);
    for entry in portable["templates"].as_array().unwrap(){assert_eq!(entry.as_object().unwrap().len(),5);assert!(entry.get("id").is_none());assert!(entry.get("createdAt").is_none());}
    assert_eq!(portable["templates"][0]["markdown"],prepared["markdown"]);
    let output=owned.path().join("Catalogo.json");
    first.write_document_template_transfer(content,&output).unwrap();
    assert_eq!(read_transfer_file(&output).unwrap()["content"],content);
    assert!(first.write_document_template_transfer(content,&output).is_err());
    assert_eq!(fs::read_to_string(&output).unwrap(),content);
    let staged=first.stage_document_template_transfer(&file,&owned.path().join("cache")).unwrap();
    assert_eq!(staged.filename,"Catálogo KnowNext.json");
    let reviewed=post(&second,"/api/document-templates/transfer/inspect",json!({"content":content}));
    assert_eq!(reviewed["catalog"].as_array().unwrap().len(),2);
    let original=post(&second,"/api/document-templates",json!({"name":"Marca portable","description":"Keep","markdown":"# Different existing content"}));
    let mut input=json!({"content":content,"digest":reviewed["digest"],"entries":[{"index":0,"name":"Marca portable"},{"index":1,"name":"Acta portable"}]});
    let check=post(&second,"/api/document-templates/transfer/catalog/review",input.clone());
    assert_eq!(check["outcomes"][0]["status"],"conflict");assert_eq!(check["outcomes"][1]["status"],"new");
    let applied=post(&second,"/api/document-templates/transfer/catalog/import",input.clone());
    assert_eq!(applied["outcomes"][0]["status"],"conflict");assert_eq!(applied["outcomes"][1]["status"],"imported");
    assert_eq!(request(&second,"GET",&format!("/api/document-templates/{}",original["id"].as_str().unwrap()),Value::Null),original);
    input["entries"][0]["name"]=json!("Marca recibida");
    let imported=post(&second,"/api/document-templates/transfer/catalog/import",input.clone());
    assert_eq!(imported["outcomes"][0]["status"],"imported");assert_eq!(imported["outcomes"][1]["status"],"existing");
    let observed=post(&second,"/api/document-templates/transfer/catalog/review",input.clone());
    assert!(observed["outcomes"].as_array().unwrap().iter().all(|entry|entry["status"]=="existing"));
    assert_eq!(observed["outcomes"][0]["template"]["id"],imported["outcomes"][0]["template"]["id"]);
    assert_eq!(post(&second,"/api/document-templates/transfer/catalog/import",input.clone())["outcomes"],observed["outcomes"]);
    let received=&imported["outcomes"][0]["template"];
    let destination=post(&second,"/api/projects",json!({"name":"Independent documents","versioningMode":"none","syncMode":"none"}));
    let mut create=json!({"projectId":destination["id"],"name":"Acta.md","revision":received["revision"],"values":{}});
    let preview=post(&second,&format!("/api/document-templates/{}/preview",received["id"].as_str().unwrap()),create.clone());
    create["projectRootHash"]=preview["projectRootHash"].clone();
    post(&second,&format!("/api/document-templates/{}/create",received["id"].as_str().unwrap()),create);
    let document=fs::read_to_string(PathBuf::from(destination["folderPath"].as_str().unwrap()).join("Acta.md")).unwrap();
    assert!(document.contains("data:image/png;base64,"));assert!(!document.contains("assets/logo.png"));
    let mut changed=selected;changed["entries"][0]["revision"]=json!("obsolete");
    assert!(first.handle("POST","/api/document-templates/transfer/catalog/export",changed,vec![]).is_err());
    let mut future=portable.clone();future["schemaVersion"]=json!(99);
    assert!(second.inspect_document_template_transfer(&future.to_string()).is_err());
    future=portable;future["templates"][0]["credentials"]=json!({"doNotImport":"owned fixture"});
    assert!(second.inspect_document_template_transfer(&future.to_string()).is_err());
    let mut changed=input.clone();changed["content"]=json!(format!("{content} "));
    assert!(second.handle("POST","/api/document-templates/transfer/catalog/import",changed,vec![]).is_err());
    // An unsupported local entry blocks extension without replacing it or the known entries.
    let unknown=owned.path().join("second/document-templates/owned-future.json");
    let future_bytes=b"{\"schemaVersion\":99,\"privateFixture\":\"preserve\"}";
    fs::write(&unknown,future_bytes).unwrap();
    assert!(second.handle("POST","/api/document-templates/transfer/catalog/import",input,vec![]).is_err());
    assert_eq!(fs::read(&unknown).unwrap(),future_bytes);
}

#[test]
fn image_preparation_rejects_unavailable_external_unsafe_and_excessive_resources_without_writes(){
    let owned=tempfile::tempdir().unwrap();let api=LocalApi::new(owned.path().join("state"),"qa".into(),"test".into());
    let project=post(&api,"/api/projects",json!({"name":"Owned limits","versioningMode":"none","syncMode":"none"}));
    let root=PathBuf::from(project["folderPath"].as_str().unwrap());let id=format!("{}::Base.md",project["id"].as_str().unwrap());
    fs::write(root.join("Base.md"),b"Original unchanged").unwrap();fs::create_dir(root.join("assets")).unwrap();
    image::RgbaImage::new(2,2).save(root.join("assets/logo.png")).unwrap();fs::write(root.join("assets/invalid.png"),b"Not a raster image").unwrap();
    let mut truncated=fs::read(root.join("assets/logo.png")).unwrap();truncated.truncate(33);fs::write(root.join("assets/truncated.png"),truncated).unwrap();
    for markdown in ["![Remote](https://example.invalid/image.png)".to_owned(),"![Missing](missing.png)".into(),"![Escape](../../outside.png)".into(),"![Hidden](.env)".into(),"![Invalid](assets/invalid.png)".into(),"![Truncated](assets/truncated.png)".into(),"[Attachment](assets/logo.png)".into(),"![Repeat](assets/logo.png)\n".repeat(10_000)]{
        assert!(api.handle("POST","/api/document-templates/source/prepare",json!({"documentId":id,"markdown":markdown}),vec![]).is_err());
    }
    assert_eq!(fs::read(root.join("Base.md")).unwrap(),b"Original unchanged");assert!(!owned.path().join("state/document-templates").exists());
}
