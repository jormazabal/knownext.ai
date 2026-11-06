use jni::{
    objects::{GlobalRef, JByteArray, JClass, JObject, JValue},
    sys::jboolean,
    JNIEnv, JavaVM,
};
use std::sync::OnceLock;

// A class global reference avoids class-loader lookup from Rust worker threads.
static VAULT: OnceLock<(JavaVM, GlobalRef)> = OnceLock::new();

#[no_mangle]
pub extern "system" fn Java_ai_knownext_mobile_CredentialVault_nativeInstall(
    env: JNIEnv,
    class: JClass,
) -> jboolean {
    if VAULT.get().is_none() {
        let Ok(vm) = env.get_java_vm() else {
            return 0;
        };
        let Ok(class) = env.new_global_ref(class) else {
            return 0;
        };
        let _ = VAULT.set((vm, class));
    }
    knownext_storage::initialize_android_credential_protector(transform);
    1
}

fn transform(bytes: &[u8], protect: bool) -> Result<Vec<u8>, String> {
    let (vm, class) = VAULT
        .get()
        .ok_or("El almacén nativo de Android no está inicializado")?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|_| "No se puede acceder al almacén nativo de Android")?;
    let result = env.with_local_frame(16, |env| -> jni::errors::Result<Vec<u8>> {
        let input: JObject = env.byte_array_from_slice(bytes)?.into();
        let class: &JClass = class.as_obj().into();
        let output = env
            .call_static_method(
                class,
                "transform",
                "([BZ)[B",
                &[JValue::Object(&input), JValue::Bool(protect as u8)],
            )?
            .l()?;
        env.convert_byte_array(JByteArray::from(output))
    });
    if result.is_err() {
        // Clear a Java exception without logging its arguments or credential bytes.
        let _ = env.exception_clear();
    }
    result.map_err(|_| "No se puede proteger o abrir el almacén de Android. Se conserva sin cambios; comprueba este dispositivo.".into())
}
