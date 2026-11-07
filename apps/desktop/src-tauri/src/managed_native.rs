//! Typed native delivery intents share admission, observation and effective queued cancellation.
use crate::{operations, runtime_dispatch::LocalApiRequest};
use knownext_core::operations::{Lane, Operations};
use serde_json::Value;
use tauri::Manager;

#[derive(serde::Deserialize)]
#[serde(
    tag = "command",
    content = "arguments",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub(crate) enum NativeRequest {
    ExportDocumentBatch{id:String,revision:String},
    ExportIncompleteMixed {
        project_id: String,
        plan_id: String,
        revision: String,
        key: String,
        acknowledge_unverified: bool,
    },
    RetireMixedPayloads {
        project_id: String,
        plan_id: String,
        revision: String,
        acknowledge: bool,
    },
    ExportMixedBackup {
        project_id: String,
        plan_id: String,
        revision: String,
    },
    VerifyMixedBackup {
        project_id: String,
        plan_id: String,
        revision: String,
    },
    ExportConflictPackage {
        id: String,
        revision: String,
    },
    ExportRecoveryContent {
        key: String,
        revision: String,
        acknowledge_unverified: bool,
    },
    RetireRecoveryUnit { family:String, key:String, revision:String, acknowledge:bool },
    ExportRecoveryUnit { family:String, key:String, revision:String, archived:bool },
    ExportSystemRecovery {
        id: String,
        fingerprint: String,
    },
    ExportConflictPayloadBackup {
        id: String,
        revision: String,
    },
    RetireConflictPayloads {
        id: String,
        revision: String,
        acknowledge: bool,
    },
    OpenaiModelAccess {
        model: String,
    },
    PickDocumentTemplate,
    ExportDocumentTemplate {
        id: String,
        revision: String,
    },
    ExportDocumentTemplateCatalog {
        entries: Value,
    },
    PickProjectPackage {
        id: String,
    },
    ExportProjectPackage {
        id: String,
        archive_sha256: String,
    },
    RefreshAiExchangeRate,
    ImportPortableRecording {
        project_id: String,
        entry_id: String,
        revision: String,
        acknowledge: bool,
    },
    ExportDocumentMobile {
        request: LocalApiRequest,
    },
    OpenMobileExport {
        export_id: String,
    },
}
#[tauri::command]
pub(crate) async fn managed_native_request(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: NativeRequest,
    operation_id: String,
) -> Result<Value, String> {
    crate::require_workspace_window(&window)?;
    let lane = if matches!(
        &request,
        NativeRequest::RefreshAiExchangeRate | NativeRequest::OpenaiModelAccess { .. }
    ) {
        Lane::Ai
    } else {
        Lane::Transfer
    };
    let admission=app.clone();
    let running=tauri::async_runtime::spawn_blocking(move||{
        {let _restart=crate::restart::admission(&admission)?;admission.state::<Operations>().submit(&operation_id,lane,2).map_err(str::to_string)?;}
        operations::start(&admission,&operation_id)
    }).await.map_err(|_|"No se pudo preparar la operación")??;
    let result = match request {
        NativeRequest::ExportDocumentBatch{id,revision}=>crate::project_transfer::export_document_batch(app.clone(),window.clone(),id,revision).await,
        NativeRequest::ExportIncompleteMixed {
            project_id,
            plan_id,
            revision,
            key,
            acknowledge_unverified,
        } => {
            crate::recovery::export_incomplete_mixed(
                app.clone(),
                window.clone(),
                project_id,
                plan_id,
                revision,
                key,
                acknowledge_unverified,
            )
            .await
        }
        NativeRequest::RetireMixedPayloads {
            project_id,
            plan_id,
            revision,
            acknowledge,
        } => {
            crate::recovery::retire_mixed_payloads(
                app.clone(),
                window.clone(),
                project_id,
                plan_id,
                revision,
                acknowledge,
            )
            .await
        }
        NativeRequest::ExportMixedBackup {
            project_id,
            plan_id,
            revision,
        } => {
            crate::recovery::export_mixed_backup(
                app.clone(),
                window.clone(),
                project_id,
                plan_id,
                revision,
            )
            .await
        }
        NativeRequest::VerifyMixedBackup {
            project_id,
            plan_id,
            revision,
        } => {
            crate::recovery::verify_mixed_backup(
                app.clone(),
                window.clone(),
                project_id,
                plan_id,
                revision,
            )
            .await
        }
        NativeRequest::ExportConflictPackage { id, revision } => {
            crate::recovery::export_conflict_package(app.clone(), window.clone(), id, revision)
                .await
        }
        NativeRequest::ExportRecoveryContent {
            key,
            revision,
            acknowledge_unverified,
        } => {
            crate::recovery::export_recovery_content(
                app.clone(),
                window.clone(),
                key,
                revision,
                acknowledge_unverified,
            )
            .await
        }
        NativeRequest::RetireRecoveryUnit{family,key,revision,acknowledge} => crate::recovery::retire_recovery_unit(app.clone(),window.clone(),family,key,revision,acknowledge).await,
        NativeRequest::ExportRecoveryUnit{family,key,revision,archived} => crate::recovery::export_recovery_unit(app.clone(),window.clone(),family,key,revision,archived).await,
        NativeRequest::ExportSystemRecovery { id, fingerprint } => {
            crate::recovery::export_system_recovery(app.clone(), window.clone(), id, fingerprint)
                .await
        }
        NativeRequest::ExportConflictPayloadBackup { id, revision } => {
            crate::recovery::export_conflict_payload_backup(
                app.clone(),
                window.clone(),
                id,
                revision,
            )
            .await
        }
        NativeRequest::RetireConflictPayloads {
            id,
            revision,
            acknowledge,
        } => {
            crate::recovery::retire_conflict_payloads(
                app.clone(),
                window.clone(),
                id,
                revision,
                acknowledge,
            )
            .await
        }
        NativeRequest::OpenaiModelAccess { model } => {
            crate::recording::openai_model_access(app.clone(), window.clone(), model).await
        }
        NativeRequest::PickDocumentTemplate => {
            crate::template_transfer::pick_document_template(app.clone(), window.clone()).await
        }
        NativeRequest::ExportDocumentTemplate { id, revision } => {
            crate::template_transfer::export_document_template(
                app.clone(),
                window.clone(),
                id,
                revision,
            )
            .await
        }
        NativeRequest::ExportDocumentTemplateCatalog { entries } => {
            crate::template_transfer::export_document_template_catalog(
                app.clone(),
                window.clone(),
                entries,
            )
            .await
        }
        NativeRequest::PickProjectPackage { id } => {
            crate::project_transfer::pick_project_package(app.clone(), window.clone(), id).await
        }
        NativeRequest::ExportProjectPackage { id, archive_sha256 } => {
            crate::project_transfer::export_project_package(
                app.clone(),
                window.clone(),
                id,
                archive_sha256,
            )
            .await
        }
        NativeRequest::RefreshAiExchangeRate => {
            crate::ai_usage::refresh_ai_exchange_rate(app.clone(), window.clone()).await
        }
        NativeRequest::ImportPortableRecording {
            project_id,
            entry_id,
            revision,
            acknowledge,
        } => {
            crate::recording::import_portable_recording(
                app.clone(),
                window.clone(),
                project_id,
                entry_id,
                revision,
                acknowledge,
            )
            .await
        }
        NativeRequest::ExportDocumentMobile { request } => {
            crate::export_document_mobile(app.clone(), window.clone(), request).await
        }
        NativeRequest::OpenMobileExport { export_id } => {
            crate::open_mobile_export(app.clone(), window.clone(), export_id).await
        }
    };
    operations::finish(running, result.as_ref().ok().map(|_| true));
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_operations_reject_unknown_commands_fields_and_untyped_payloads() {
        for value in [
            serde_json::json!({"command":"execute_shell","arguments":null}),
            serde_json::json!({"command":"pick_document_template","arguments":null,"window":"main"}),
            serde_json::json!({"command":"retire_conflict_payloads","arguments":{"id":"a","revision":"r","acknowledge":"true"}}),
        ] {
            assert!(serde_json::from_value::<NativeRequest>(value).is_err());
        }
        assert!(serde_json::from_value::<NativeRequest>(
            serde_json::json!({"command":"pick_document_template","arguments":null})
        )
        .is_ok());
        assert!(serde_json::from_value::<NativeRequest>(serde_json::json!({"command":"retire_conflict_payloads","arguments":{"id":"a","revision":"r","acknowledge":true}})).is_ok());
    }
}
