//! Common portable filename components; callers keep their own reserved roots.
use unicase::UniCase;
use unicode_normalization::UnicodeNormalization;

pub(crate) fn key(name: &str) -> UniCase<String> {
    UniCase::new(name.nfc().collect())
}

pub(crate) fn component(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 240
        || name.starts_with('.')
        || name.ends_with(['.', ' '])
        || name.chars().any(|c| {
            c.is_control() || matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*')
        })
    {
        return Err(
            "Nombre no portable; usa un nombre de archivo sin rutas ni caracteres reservados"
                .into(),
        );
    }
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || stem
        .strip_prefix("COM")
        .or_else(|| stem.strip_prefix("LPT"))
        .is_some_and(|s| {
            matches!(
                s,
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
            )
        })
    {
        return Err("El nombre de archivo está reservado".into());
    }
    Ok(())
}
