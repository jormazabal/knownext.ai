//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn read_notes(&self)->Result<Value,String>{ancillary_state::read(&self.app_data_dir,&self.notes_path(),ancillary_state::Store::Notes,None,json!({"markdown":"","updatedAt":knownext_core::now_iso()}))}

    pub(super) fn write_notes(&self, markdown: String) -> Result<Value, String> {
        let notes = json!({ "markdown": markdown, "updatedAt": knownext_core::now_iso() });
        self.write_json(&self.notes_path(), &notes)?;
        Ok(notes)
    }
}
