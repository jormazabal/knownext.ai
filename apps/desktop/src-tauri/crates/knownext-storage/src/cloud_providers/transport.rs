//! Provider-specific authenticated reads. All URLs are built internally; redirects
//! are rejected so a bearer credential cannot follow a provider-supplied URL.
//! Call only from runtime workers, outside editor/storage locks.
#![allow(dead_code)]
use reqwest::{blocking::{Client,Response},redirect::Policy,Url};
use serde_json::Value;
use std::{io::Read,time::Duration};
use sha2::{Digest,Sha256};

const MAX_JSON_BYTES:u64=2*1024*1024;
const MAX_ENTRIES:usize=1000;
const MAX_OBJECT_BYTES:u64=8*1024*1024;
const GOOGLE_FIELDS:&str="nextPageToken,incompleteSearch,files(id,name,mimeType,size,version,md5Checksum,parents,trashed)";

#[derive(Clone,Copy,PartialEq,Eq)]
pub(crate) enum ProviderKind { OneDrive, GoogleDrive }

#[derive(Debug,Clone,PartialEq,Eq)]
pub(crate) struct ProviderError {
    pub code:&'static str,
    pub retry_after_seconds:Option<u64>,
}
impl ProviderError {
    fn new(code:&'static str)->Self { Self{code,retry_after_seconds:None} }
}

pub(crate) struct RemotePage {
    pub items:Vec<Value>,
    /// Private runtime cursor; never a completion acknowledgement.
    pub next_cursor:Option<String>,
}

/// Persist this before performing a Google create; retry with the same remote ID.
pub(crate) struct ImmutableObjectPlan {
    pub parent_id:String,
    pub remote_id:Option<String>,
    pub sha256:String,
    pub bytes:u64,
}
#[derive(Debug,Clone,PartialEq,Eq)]
pub(crate) struct VerifiedObjectReceipt {
    pub remote_id:String,
    pub sha256:String,
    pub bytes:u64,
    pub verified_at:String,
}

fn content_hash(bytes:&[u8])->String {format!("{:x}",Sha256::digest(bytes))}
fn valid_hash(value:&str)->Result<(),ProviderError> {
    if value.len()!=64 || !value.bytes().all(|v|v.is_ascii_digit() || (b'a'..=b'f').contains(&v)) {
        return Err(ProviderError::new("invalid-content-hash"));
    }
    Ok(())
}
fn multipart_boundary(hash:&str,bytes:&[u8])->Result<String,ProviderError> {
    let boundary=format!("knownext-object-{hash}");
    if bytes.windows(boundary.len()).any(|part|part==boundary.as_bytes()) {
        return Err(ProviderError::new("multipart-boundary-collision"));
    }
    Ok(boundary)
}

pub(crate) struct CloudReadClient {
    provider:ProviderKind,
    client:Client,
    // No Debug/Serialize implementation: the credential stays in native memory.
    token:String,
}
impl CloudReadClient {
    pub fn new(provider:ProviderKind,token:String)->Result<Self,ProviderError> {
        if token.is_empty() || token.len()>16*1024 || token.chars().any(|c|c.is_control()) {
            return Err(ProviderError::new("invalid-credential"));
        }
        let client=Client::builder().redirect(Policy::none())
            .connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(30))
            .user_agent("KnowNext.ai-cloud/1").build()
            .map_err(|_|ProviderError::new("transport-unavailable"))?;
        Ok(Self{provider,client,token})
    }

    /// Graph AppFolder is discovered through the provider, never from a local path.
    pub fn onedrive_app_folder(&self)->Result<Value,ProviderError> {
        if self.provider!=ProviderKind::OneDrive {return Err(ProviderError::new("wrong-provider"));}
        self.read_json(Url::parse("https://graph.microsoft.com/v1.0/me/drive/special/approot")
            .map_err(|_|ProviderError::new("invalid-endpoint"))?)
    }

    /// Enumerate one page. A missing cursor does not turn a partial/error listing
    /// into deletions; the sync engine must explicitly finish its whole inventory.
    pub fn list_children(&self,parent_id:&str,cursor:Option<&str>)->Result<RemotePage,ProviderError> {
        valid_id(parent_id)?;
        let url=match self.provider {
            ProviderKind::OneDrive => match cursor {
                Some(cursor)=>graph_cursor(cursor)?,
                None=>{
                    let mut u=Url::parse("https://graph.microsoft.com/v1.0/me/drive/items/")
                        .map_err(|_|ProviderError::new("invalid-endpoint"))?;
                    u.path_segments_mut().map_err(|_|ProviderError::new("invalid-endpoint"))?
                        .pop_if_empty().push(parent_id).push("children");
                    u.query_pairs_mut().append_pair("$top","200")
                        .append_pair("$select","id,name,size,eTag,cTag,folder,file,parentReference,deleted");
                    u
                }
            },
            ProviderKind::GoogleDrive=>{
                let mut u=Url::parse("https://www.googleapis.com/drive/v3/files")
                    .map_err(|_|ProviderError::new("invalid-endpoint"))?;
                u.query_pairs_mut().append_pair("q",&format!("'{parent_id}' in parents and trashed = false"))
                    .append_pair("spaces","drive").append_pair("pageSize","200")
                    .append_pair("fields",GOOGLE_FIELDS);
                if let Some(cursor)=cursor {
                    valid_cursor(cursor)?;
                    u.query_pairs_mut().append_pair("pageToken",cursor);
                }
                u
            }
        };
        let data=self.read_json(url)?;
        decode_page(self.provider,data)
    }

    /// Allocate once, then persist the resulting plan before starting upload.
    /// This does not create a document and is not a publication receipt.
    pub fn plan_object(&self,parent_id:&str,bytes:&[u8])->Result<ImmutableObjectPlan,ProviderError> {
        valid_id(parent_id)?;
        if bytes.len() as u64>MAX_OBJECT_BYTES {return Err(ProviderError::new("object-too-large"));}
        let remote_id=if self.provider==ProviderKind::GoogleDrive {
            let value=self.read_json(Url::parse("https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files")
                .map_err(|_|ProviderError::new("invalid-endpoint"))?)?;
            let id=value["ids"].as_array().and_then(|ids|if ids.len()==1 {ids[0].as_str()}else{None})
                .ok_or_else(||ProviderError::new("invalid-response"))?;
            valid_id(id)?;
            Some(id.to_owned())
        } else {None};
        Ok(ImmutableObjectPlan{parent_id:parent_id.to_owned(),remote_id,sha256:content_hash(bytes),bytes:bytes.len() as u64})
    }

    pub fn download_verified(&self,remote_id:&str,hash:&str,expected_bytes:u64)->Result<Vec<u8>,ProviderError> {
        valid_id(remote_id)?;
        valid_hash(hash)?;
        if expected_bytes>MAX_OBJECT_BYTES {return Err(ProviderError::new("object-too-large"));}
        let url=match self.provider {
            ProviderKind::OneDrive=>format!("https://graph.microsoft.com/v1.0/me/drive/items/{remote_id}/content"),
            ProviderKind::GoogleDrive=>format!("https://www.googleapis.com/drive/v3/files/{remote_id}?alt=media"),
        };
        let url=Url::parse(&url).map_err(|_|ProviderError::new("invalid-endpoint"))?;
        if !allowed_endpoint(self.provider,&url) {return Err(ProviderError::new("untrusted-endpoint"));}
        let mut response=self.client.get(url).bearer_auth(&self.token).send()
            .map_err(|_|ProviderError::new("transport-failed"))?;
        if self.provider==ProviderKind::OneDrive && matches!(response.status().as_u16(),302|303|307) {
            let target=response.headers().get("location").and_then(|v|v.to_str().ok())
                .ok_or_else(||ProviderError::new("invalid-download-redirect"))?;
            let target=Url::parse(target).map_err(|_|ProviderError::new("invalid-download-redirect"))?;
            if !allowed_download(&target) {return Err(ProviderError::new("untrusted-download"));}
            // Preauthenticated transfer URL: deliberately send NO bearer header.
            response=self.client.get(target).send().map_err(|_|ProviderError::new("transport-failed"))?;
        }
        if !response.status().is_success() {return Err(classify_status(response.status().as_u16(),None));}
        let bytes=read_bounded(response,MAX_OBJECT_BYTES)?;
        if bytes.len() as u64!=expected_bytes || content_hash(&bytes)!=hash {
            return Err(ProviderError::new("content-verification-failed"));
        }
        Ok(bytes)
    }

    /// Create-only publication. A remote collision is inspected and verified;
    /// never replace an arbitrary ID or acknowledge a name without its bytes.
    pub fn publish_object(&self,plan:&ImmutableObjectPlan,bytes:&[u8])->Result<VerifiedObjectReceipt,ProviderError> {
        valid_id(&plan.parent_id)?;
        valid_hash(&plan.sha256)?;
        if plan.bytes>MAX_OBJECT_BYTES || plan.bytes!=bytes.len() as u64 || content_hash(bytes)!=plan.sha256 {
            return Err(ProviderError::new("source-changed"));
        }
        let name=format!("{}.blob",plan.sha256);
        let (metadata_url,create_url)=match self.provider {
            ProviderKind::OneDrive=>{
                let metadata=format!("https://graph.microsoft.com/v1.0/me/drive/items/{}:/{name}",plan.parent_id);
                (metadata.clone(),format!("{metadata}:/content?@microsoft.graph.conflictBehavior=fail"))
            },
            ProviderKind::GoogleDrive=>{
                let id=plan.remote_id.as_deref().ok_or_else(||ProviderError::new("missing-durable-remote-id"))?;
                valid_id(id)?;
                (format!("https://www.googleapis.com/drive/v3/files/{id}?fields=id,name,size,parents"),
                    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,parents".to_owned())
            }
        };
        let metadata_url=Url::parse(&metadata_url).map_err(|_|ProviderError::new("invalid-endpoint"))?;
        let existing=self.read_json(metadata_url.clone());
        let metadata=match existing {
            Ok(value)=>value,
            Err(error) if error.code=="remote-unavailable"=>{
                let response=match self.provider {
                    ProviderKind::OneDrive=>self.client.put(create_url).bearer_auth(&self.token)
                        .header("If-None-Match","*").header("Content-Type","application/octet-stream")
                        .body(bytes.to_vec()).send(),
                    ProviderKind::GoogleDrive=>{
                        let boundary=multipart_boundary(&plan.sha256,bytes)?;
                        let meta=serde_json::json!({"id":plan.remote_id,"name":name,"parents":[plan.parent_id],"mimeType":"application/octet-stream"});
                        let mut body=format!("--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n").into_bytes();
                        body.extend_from_slice(bytes);
                        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
                        self.client.post(create_url).bearer_auth(&self.token)
                            .header("Content-Type",format!("multipart/related; boundary={boundary}"))
                            .body(body).send()
                    }
                }.map_err(|_|ProviderError::new("publication-uncertain"))?;
                if matches!(response.status().as_u16(),409|412) {
                    self.read_json(metadata_url)?
                } else {
                    decode_response(response).map_err(|error|if error.code=="provider-unavailable" {
                        ProviderError::new("publication-uncertain")
                    } else {error})?
                }
            }
            Err(error)=>return Err(error),
        };
        let id=metadata["id"].as_str().ok_or_else(||ProviderError::new("invalid-response"))?;
        valid_id(id)?;
        if metadata["name"].as_str()!=Some(name.as_str()) {return Err(ProviderError::new("remote-identity-mismatch"));}
        if self.provider==ProviderKind::GoogleDrive && plan.remote_id.as_deref()!=Some(id) {
            return Err(ProviderError::new("remote-identity-mismatch"));
        }
        if self.provider==ProviderKind::GoogleDrive && !metadata["parents"].as_array()
            .is_some_and(|parents|parents.len()==1 && parents[0].as_str()==Some(plan.parent_id.as_str())) {
            return Err(ProviderError::new("remote-parent-mismatch"));
        }
        if self.provider==ProviderKind::OneDrive && metadata["parentReference"]["id"].as_str()!=Some(plan.parent_id.as_str()) {
            return Err(ProviderError::new("remote-parent-mismatch"));
        }
        self.download_verified(id,&plan.sha256,plan.bytes)?;
        Ok(VerifiedObjectReceipt{remote_id:id.to_owned(),sha256:plan.sha256.clone(),bytes:plan.bytes,verified_at:knownext_core::now_iso()})
    }

    fn read_json(&self,url:Url)->Result<Value,ProviderError> {
        if !allowed_endpoint(self.provider,&url) {return Err(ProviderError::new("untrusted-endpoint"));}
        let response=self.client.get(url).bearer_auth(&self.token).send()
            .map_err(|_|ProviderError::new("transport-failed"))?;
        decode_response(response)
    }
}

fn valid_id(id:&str)->Result<(),ProviderError> {
    if id.is_empty() || id.len()>1024 || !id.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-!".contains(&c)) {
        return Err(ProviderError::new("invalid-remote-id"));
    }
    Ok(())
}
fn valid_cursor(cursor:&str)->Result<(),ProviderError> {
    if cursor.is_empty() || cursor.len()>16*1024 || cursor.chars().any(|c|c.is_control()) {
        return Err(ProviderError::new("invalid-cursor"));
    }
    Ok(())
}
fn allowed_endpoint(provider:ProviderKind,url:&Url)->bool {
    if url.scheme()!="https" || !url.username().is_empty() || url.password().is_some()
        || url.port().is_some_and(|port|port!=443) || url.fragment().is_some() {return false;}
    match provider {
        ProviderKind::OneDrive=>url.host_str()==Some("graph.microsoft.com")
            && url.path().starts_with("/v1.0/me/drive/"),
        ProviderKind::GoogleDrive=>url.host_str()==Some("www.googleapis.com")
            && (url.path()=="/drive/v3/files" || url.path().starts_with("/drive/v3/files/")),
    }
}
fn allowed_download(url:&Url)->bool {
    let host=url.host_str().unwrap_or("");
    url.scheme()=="https" && url.username().is_empty() && url.password().is_none()
        && url.port().is_none_or(|p|p==443) && url.fragment().is_none()
        && [".1drv.com",".sharepoint.com",".sharepoint-df.com",".onedrive.com"].iter().any(|suffix|host.ends_with(suffix))
}
fn graph_cursor(cursor:&str)->Result<Url,ProviderError> {
    valid_cursor(cursor)?;
    let url=Url::parse(cursor).map_err(|_|ProviderError::new("invalid-cursor"))?;
    if !allowed_endpoint(ProviderKind::OneDrive,&url) {
        return Err(ProviderError::new("untrusted-cursor"));
    }
    Ok(url)
}
fn classify_status(status:u16,retry:Option<u64>)->ProviderError {
    let code=match status {
        401=>"reauthentication-required",403=>"permission-denied",404=>"remote-unavailable",
        409|412=>"remote-changed",410=>"inventory-reset-required",429=>"rate-limited",
        507=>"remote-quota-exceeded",300..=399=>"redirect-not-allowed",500..=599=>"provider-unavailable",
        _=>"provider-request-failed",
    };
    ProviderError{code,retry_after_seconds:retry.map(|n|n.min(3600))}
}
fn decode_response(response:Response)->Result<Value,ProviderError> {
    if !response.status().is_success() {
        let retry=response.headers().get("retry-after").and_then(|v|v.to_str().ok()).and_then(|v|v.parse().ok());
        // Never include response URL, headers or error body: they can contain
        // credential/session material and document/account names.
        return Err(classify_status(response.status().as_u16(),retry));
    }
    let bytes=read_bounded(response,MAX_JSON_BYTES)?;
    serde_json::from_slice(&bytes).map_err(|_|ProviderError::new("invalid-response"))
}
fn read_bounded(response:Response,limit:u64)->Result<Vec<u8>,ProviderError> {
    if response.content_length().is_some_and(|bytes|bytes>limit) {
        return Err(ProviderError::new("response-too-large"));
    }
    let mut bytes=Vec::new();
    response.take(limit+1).read_to_end(&mut bytes)
        .map_err(|_|ProviderError::new("incomplete-response"))?;
    if bytes.len() as u64>limit {return Err(ProviderError::new("response-too-large"));}
    Ok(bytes)
}
fn decode_page(provider:ProviderKind,data:Value)->Result<RemotePage,ProviderError> {
    let (items_key,cursor_key)=match provider {
        ProviderKind::OneDrive=>("value","@odata.nextLink"),
        ProviderKind::GoogleDrive=>("files","nextPageToken"),
    };
    if data.get("incompleteSearch").and_then(Value::as_bool)==Some(true) {
        return Err(ProviderError::new("incomplete-inventory"));
    }
    let items=data[items_key].as_array().ok_or_else(||ProviderError::new("invalid-response"))?;
    if items.len()>MAX_ENTRIES {return Err(ProviderError::new("response-too-large"));}
    let cursor=match data.get(cursor_key) {
        None|Some(Value::Null)=>None,
        Some(Value::String(value))=>{
            valid_cursor(value)?;
            if provider==ProviderKind::OneDrive {graph_cursor(value)?;}
            Some(value.clone())
        }
        _=>return Err(ProviderError::new("invalid-cursor")),
    };
    for item in items {
        let id=item["id"].as_str().ok_or_else(||ProviderError::new("invalid-response"))?;
        valid_id(id)?;
    }
    Ok(RemotePage{items:items.clone(),next_cursor:cursor})
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn credential_redirect_and_cursor_targets_are_rejected() {
        for value in ["http://graph.microsoft.com/v1.0/me/drive/items", "https://graph.microsoft.com.evil.test/v1.0/me/drive/items", "https://user:secret@graph.microsoft.com/v1.0/me/drive/items", "https://graph.microsoft.com:8443/v1.0/me/drive/items", "https://graph.microsoft.com/v1.0/me/drive/items#secret", "https://127.0.0.1/v1.0/me/drive/items"] {
            assert!(graph_cursor(value).is_err());
        }
        assert!(graph_cursor("https://graph.microsoft.com/v1.0/me/drive/items/id/children?$skiptoken=opaque").is_ok());
    }
    #[test]
    fn partial_or_malformed_inventory_is_never_an_empty_success() {
        assert!(decode_page(ProviderKind::GoogleDrive,json!({"files":[],"incompleteSearch":true})).is_err());
        assert!(decode_page(ProviderKind::OneDrive,json!({})).is_err());
        assert!(decode_page(ProviderKind::OneDrive,json!({"value":[],"@odata.nextLink":"https://evil.test/"})).is_err());
        assert!(decode_page(ProviderKind::GoogleDrive,json!({"files":[{"name":"x"}]})).is_err());
        let page=decode_page(ProviderKind::GoogleDrive,json!({"files":[{"id":"id_1","name":"x"}],"nextPageToken":"next"})).unwrap();
        assert_eq!(page.items.len(),1);
        assert_eq!(page.next_cursor.as_deref(),Some("next"));
    }
    #[test]
    fn failures_are_classified_without_copying_remote_error_material() {
        assert_eq!(classify_status(401,None).code,"reauthentication-required");
        assert_eq!(classify_status(412,None).code,"remote-changed");
        assert_eq!(classify_status(429,Some(99999)).retry_after_seconds,Some(3600));
        assert_eq!(classify_status(302,None).code,"redirect-not-allowed");
        assert_eq!(classify_status(410,None).code,"inventory-reset-required");
    }
    #[test]
    fn remote_ids_cannot_inject_query_or_paths() {
        for value in ["", "../other", "a/b", "a' or trashed=true", "a\n"] {assert!(valid_id(value).is_err());}
        assert!(valid_id("01ABC_-!9").is_ok());
    }
    #[test]
    fn binary_receipts_require_exact_sha256_and_download_targets_are_restricted() {
        assert_eq!(content_hash(b"abc"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert!(valid_hash("not-a-hash").is_err());
        assert!(!allowed_download(&Url::parse("https://evil.test/download?secret=x").unwrap()));
        assert!(!allowed_download(&Url::parse("https://localhost/download").unwrap()));
        assert!(allowed_download(&Url::parse("https://tenant.sharepoint.com/download?session=private").unwrap()));
    }
    #[test]
    fn multipart_payload_cannot_supply_its_own_boundary() {
        assert!(multipart_boundary("hash",b"some bytes knownext-object-hash with malicious framing").is_err());
        assert_eq!(multipart_boundary("hash",b"ordinary content").unwrap(),"knownext-object-hash");
    }
}
