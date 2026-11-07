//! Native cloud capabilities and bounded provider reads.
//! No credential is accepted from a frontend DTO. These adapters are intentionally
//! not advertised as working sync before OAuth, durable account storage and the
//! transfer/receipt loop have been integrated and accepted.
use serde_json::{json, Value};

mod transport;
#[allow(unused_imports)]
pub(super) use transport::{CloudReadClient, ProviderError, ProviderKind, RemotePage};

fn configured(name: &str) -> bool {
    std::env::var_os(name).is_some_and(|value| !value.to_string_lossy().trim().is_empty())
}

pub(super) fn capabilities() -> Value {
    capabilities_for(
        configured("KNOWNEXT_ONEDRIVE_CLIENT_ID"),
        configured(if cfg!(target_os = "android") {
            "KNOWNEXT_GOOGLE_DRIVE_ANDROID_CLIENT_ID"
        } else {
            "KNOWNEXT_GOOGLE_DRIVE_CLIENT_ID"
        }),
    )
}

fn capabilities_for(microsoft_configured: bool, google_configured: bool) -> Value {
    let provider = |id: &str, label: &str, registered: bool| {
        json!({
            "id":id,"label":label,"available":false,
            "status":if registered {"integration-pending"} else {"not-configured"},
            "reason":if registered {
                "La aplicación está registrada; falta completar la conexión segura de cuenta y la transferencia verificada."
            } else {
                "La conexión de cuenta todavía no está configurada en esta instalación. El proyecto sigue disponible localmente."
            },
            "platforms":["windows","android"],"configurationPresent":registered,
            "canAuthenticate":false,"canSync":false,"confirmationLevel":"none"
        })
    };
    json!({
        "schemaVersion":1,
        "providers":[
            {"id":"none","label":"Sólo en este dispositivo","available":true,"status":"available","reason":null,"platforms":["windows","android"],"canAuthenticate":false,"canSync":false,"confirmationLevel":"local"},
            provider("onedrive","OneDrive",microsoft_configured),
            provider("google-drive","Google Drive",google_configured),
            {"id":"proton-drive","label":"Proton Drive","available":super::proton_direct::native_available(),"status":if super::proton_direct::native_available(){"requires-account"}else{"integration-pending"},"reason":if super::proton_direct::native_available(){"Conecta tu cuenta para sincronizar directamente. La conexión se recuerda en este dispositivo."}else{"El SDK directo de Proton no está disponible en esta instalación. El proyecto sigue disponible localmente."},"platforms":["windows","android"],"canAuthenticate":super::proton_direct::native_available(),"canSync":super::proton_direct::native_available(),"transport":"official-sdk","confirmationLevel":"remote-revision"}

        ],
        "localFirst":true,"supportsCloudOnly":false,
        "checkedAt":knownext_core::now_iso()
    })
}

pub(super) fn capability(provider: &str) -> Option<Value> {
    capabilities()["providers"].as_array()?.iter().find(|p| p["id"] == provider).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn registration_never_claims_authenticated_or_synced() {
        for configured in [false,true] {
            let result=capabilities_for(configured,configured);
            let entries=result["providers"].as_array().unwrap();
            for id in ["onedrive","google-drive"] {
                let provider=entries.iter().find(|p|p["id"]==id).unwrap();
                assert_eq!(provider["available"],false);
                assert_eq!(provider["canSync"],false);
                assert_eq!(provider["canAuthenticate"],false);
            }
            assert_eq!(entries[0]["available"],true);
            let proton=entries.iter().find(|p|p["id"]=="proton-drive").unwrap();
            assert_eq!(proton["available"],false);
            assert_eq!(proton["confirmationLevel"],"remote-revision");
            assert_eq!(proton["canAuthenticate"],false);
            assert_eq!(result["supportsCloudOnly"],false);
        }
    }
}
