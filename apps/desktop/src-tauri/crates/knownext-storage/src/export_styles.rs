//! Runtime facade extracted without changing method bodies or public contracts.
use super::*;

impl LocalApi {
    pub(super) fn read_export_template_checked(&self) -> Result<Value, String> {
        local_state::read(&self.app_data_dir, local_state::Store::Export)
    }
    pub(super) fn update_export_template(&self, patch: Value) -> Result<Value, String> {
        if !patch.is_object() { return Err("La actualización de plantilla debe ser un objeto".into()); }
        let mut template = self.read_export_template_checked()?;
        merge(&mut template, &patch);
        template["updatedAt"] = Value::from(knownext_core::now_iso());
        self.write_json(&self.export_template_path(), &template)?;
        Ok(template)
    }
    pub(super) fn reset_export_template(&self) -> Result<Value, String> {
        let template = default_export_template();
        self.write_json(&self.export_template_path(), &template)?;
        Ok(template)
    }
}
