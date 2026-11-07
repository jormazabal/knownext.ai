use super::*;
use unicase::UniCase;

pub(super) fn key(path: &str) -> UniCase<String> {
    portable_paths::key(path)
}

pub(super) fn validate(path: &str) -> Result<(), String> {
    if path.is_empty() || path.len() > 4096 || path.contains('\\') {
        return Err("Ruta de paquete no portable".into());
    }
    for (index, part) in path.split('/').enumerate() {
        if coordination(part) {
            return Err("Archivo de coordinación excluido del paquete".into());
        }
        portable_paths::component(part)?;
        if index == 0 && key(part) == key(MANIFEST) {
            return Err("Un nombre del paquete está reservado; no se crea ningún archivo".into());
        }
    }
    Ok(())
}

pub(super) fn kind(path: &str) -> Option<FileKind> {
    match path.rsplit('.').next()?.to_ascii_lowercase().as_str() {
        "md" | "markdown" => Some(FileKind::Markdown),
        "knote" => Some(FileKind::Handwritten),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" => Some(FileKind::Image),
        "pdf" | "docx" | "xlsx" | "pptx" | "txt" | "csv" => Some(FileKind::Attachment),
        "woff" | "woff2" | "ttf" | "otf" => Some(FileKind::Asset),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_cross_platform_aliases_and_keeps_unicode_paths() {
        for p in [
            "owner.lock",
            "sub/runtime-owner.lock",
            "capture.lock",
            "../outside.md",
            "/root.md",
            "C:/root.md",
            "docs\\a.md",
            "a//b.md",
            ".git/config",
            "docs/.knownext-trash/a.md",
            "file.md:stream",
            "AUX.md",
            "com1.txt",
            "LPT².pdf",
            "a./b.md",
            "a /b.md",
            "knownext-project.json/a.md",
        ] {
            assert!(validate(p).is_err(), "accepted {p}");
        }
        assert!(validate("Decisiones/Reunión y entrega.md").is_ok());
        assert_eq!(key("Reunión.md"), key("REUNIO\u{301}N.MD"));
        assert_eq!(key("Straße.md"), key("STRASSE.md"));
    }
}

pub(super) fn coordination(name: &str) -> bool {
    matches!(
        name.trim_end_matches(['.', ' '])
            .to_ascii_lowercase()
            .as_str(),
        "owner.lock" | "runtime-owner.lock" | "capture.lock"
    )
}
pub(super) fn backup_exclusion(path: &str) -> bool {
    path.split('/').any(|part| {
        part.starts_with('.')
            || coordination(part)
            || matches!(
                part.to_ascii_lowercase().as_str(),
                "node_modules" | "target" | "dist"
            )
    })
}
