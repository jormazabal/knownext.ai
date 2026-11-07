use super::*;
const TEXT: usize = 192 * 1024 * 1024;
pub fn validate_runtime_input(body: &Value, files: &[LocalApiFile]) -> Result<(), String> {
    let mut pending = vec![(body, 0usize)];
    let (mut nodes, mut bytes) = (0usize, 0usize);
    while let Some((value, depth)) = pending.pop() {
        nodes += 1;
        if nodes > 250_000 || depth > 64 {
            return Err(
                "La solicitud supera el límite de estructura; divídela antes de repetir".into(),
            );
        }
        match value {
            Value::String(s) => bytes = bytes.saturating_add(s.len()),
            Value::Array(a) => {
                if a.len() > 100_000
                    || pending.len().saturating_add(a.len()).saturating_add(nodes) > 250_000
                {
                    return Err("Demasiados elementos en la solicitud".into());
                }
                pending.extend(a.iter().map(|v| (v, depth + 1)));
            }
            Value::Object(o) => {
                if pending.len().saturating_add(o.len()).saturating_add(nodes) > 250_000 {
                    return Err("La solicitud supera el límite de estructura".into());
                }
                for (k, v) in o {
                    bytes = bytes.saturating_add(k.len());
                    pending.push((v, depth + 1));
                }
            }
            _ => (),
        };
        if bytes > TEXT {
            return Err("La solicitud supera192MiB de texto; no se ha aplicado".into());
        }
    }
    if files.len() > 64 {
        return Err("Selecciona como máximo64 archivos por envío".into());
    }
    let mut total = 0usize;
    for file in files {
        if file.name.is_empty()
            || file.name.len() > 1024
            || file.name.chars().any(char::is_control)
            || file.field_name.len() > 128
            || file.mime_type.as_ref().is_some_and(|s| s.len() > 256)
        {
            return Err("Metadatos de archivo no válidos".into());
        }
        let encoded = file.data_base64.len();
        let b = file.data_base64.as_bytes();
        let padding = b.iter().rev().take_while(|c| **c == b'=').count();
        if encoded % 4 != 0
            || padding > 2
            || b[..encoded.saturating_sub(padding)]
                .iter()
                .any(|c| !c.is_ascii_alphanumeric() && *c != b'+' && *c != b'/')
        {
            return Err("El adjunto no contiene base64 estándar válido; no se ha aplicado".into());
        }
        total = total.saturating_add(encoded);
        if encoded > 180 * 1024 * 1024 || total > 352 * 1024 * 1024 {
            return Err("Los adjuntos superan el límite del envío; divídelos".into());
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn security_block_frame_limits_precede_decoding_and_do_not_mutate() {
        let mut value = json!("leaf");
        for _ in 0..66 {
            value = json!([value]);
        }
        assert!(validate_runtime_input(&value, &[]).is_err());
        let files = vec![LocalApiFile {
            field_name: "file".into(),
            name: "bad\nname".into(),
            mime_type: None,
            data_base64: "not-base64".into(),
        }];
        assert!(validate_runtime_input(&Value::Null, &files).is_err());
        assert!(validate_runtime_input(&json!({"markdown":"# document"}), &[]).is_ok());
    }
}
