//! Domain methods moved verbatim; contracts, preconditions and effects remain unchanged.
use super::*;
impl LocalApi {
    pub(super) fn preview_text(&self, project_id: &str, preview_id: &str) -> Result<Value, String> {
        let preview = self.get_preview(project_id, preview_id)?;
        let path =
            self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
        if path.extension().and_then(|value|value.to_str()).is_some_and(|ext|ext.eq_ignore_ascii_case("pdf")){
            return match knownext_docs::read_pdf_text_bounded(&path,2*1024*1024){
                Ok(text)=>Ok(json!({"previewId":preview_id,"searchable":!text.trim().is_empty(),"warnings":if text.trim().is_empty(){vec!["PDF sin texto extraíble; no se ha ejecutado OCR"]}else{vec![]},"text":text})),
                Err(warning)=>Ok(json!({"previewId":preview_id,"text":"","searchable":false,"warnings":[warning]}))
            };
        }
        Ok(json!({ "previewId": preview_id, "text": knownext_docs::extract_plain_text(&path), "searchable": true, "warnings": [] }))
    }
    pub(super) fn preview_sheets(&self, project_id: &str, preview_id: &str) -> Result<Value, String> {
        let preview = self.get_preview(project_id, preview_id)?;
        if preview["format"].as_str() != Some("xlsx") {
            return Ok(json!({ "previewId": preview_id, "sheets": [] }));
        }
        let path =
            self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
        Ok(json!({ "previewId": preview_id, "sheets": knownext_docs::xlsx_sheet_summaries(&path) }))
    }
    pub(super) fn preview_sheet(
        &self,
        project_id: &str,
        preview_id: &str,
        sheet_id: &str,
    ) -> Result<Value, String> {
        let preview = self.get_preview(project_id, preview_id)?;
        if preview["format"].as_str() != Some("xlsx") {
            return Err("La vista no es una hoja de cálculo".to_string());
        }
        let path =
            self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
        let mut sheet = knownext_docs::xlsx_sheet(&path, sheet_id)
            .ok_or_else(|| "Hoja no encontrada".to_string())?;
        sheet["previewId"] = Value::from(preview_id);
        Ok(sheet)
    }
    pub(super) fn open_preview_external(&self, project_id: &str, preview_id: &str) -> Result<Value, String> {
        let preview = self.get_preview(project_id, preview_id)?;
        let path =
            self.resolve_project_relative(project_id, preview["path"].as_str().unwrap_or(""))?;
        match open_path_external(&path) {
            Ok(()) => Ok(
                json!({ "opened": true, "filePath": path.to_string_lossy(), "message": "Documento abierto con la aplicación predeterminada del sistema." }),
            ),
            Err(message) => Ok(
                json!({ "opened": false, "filePath": path.to_string_lossy(), "message": message }),
            ),
        }
    }

}
