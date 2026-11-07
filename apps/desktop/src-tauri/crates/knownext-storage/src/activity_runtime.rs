//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn project_activity(&self, project_id: &str) -> Result<Value,String> {
        let path = self
            .app_data_dir
            .join("activity")
            .join(format!("{}.json", safe_name(project_id)));
        ancillary_state::read(&self.app_data_dir,&path,ancillary_state::Store::Activity,Some(project_id),json!({ "projectId": project_id, "events": [] }))
    }
    pub(super) fn record_activity(&self, project_id: &str, body: Value) -> Result<Value,String> {
        let event = json!({
            "id": knownext_core::compact_id("activity"),
            "projectId": project_id,
            "type": body.get("type").and_then(Value::as_str).unwrap_or("activity"),
            "scope": body.get("scope").and_then(Value::as_str).unwrap_or("project"),
            "title": body.get("title").and_then(Value::as_str).unwrap_or("Actividad"),
            "message": body.get("message").and_then(Value::as_str).unwrap_or(""),
            "tone": body.get("tone").and_then(Value::as_str).unwrap_or("info"),
            "createdAt": knownext_core::now_iso(),
            "documentPath": body.get("documentPath").cloned().unwrap_or(Value::Null),
            "repository": body.get("repository").cloned().unwrap_or(Value::Null)
        });
        let path = self
            .app_data_dir
            .join("activity")
            .join(format!("{}.json", safe_name(project_id)));
        let mut list = self.project_activity(project_id)?;
        list["events"]
            .as_array_mut()
            .unwrap()
            .insert(0, event.clone());
        self.write_json(&path, &list)?;
        Ok(event)
    }

}
