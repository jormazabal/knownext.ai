//! Reproducible offline corpus for text extraction and page/image inspection.
use knownext_docs::{export_pdf_with_assets_and_template, ExportImageAsset};
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let target = PathBuf::from(
        std::env::args_os()
            .nth(1)
            .ok_or("Pass an output PDF path")?,
    );
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut markdown=String::from("# Documento de contraste\n\nINICIO-CORPUS-15\n\nÁmbito: revisión, documentación y aprobación. Ekintza, egiaztapena eta dokumentazioa.\n\nTexto **en negrita**, *en cursiva*, ***combinado***, <u>subrayado</u>, ~~retirado~~ y `código  con espacios`.\n\n[Referencia de prueba](https://knownext.ai)\n\n![Recurso raster de prueba](qa.png)\n\n## Tabla normal\n\n| Criterio | Resultado |\n| --- | --- |\n| Integridad | Todo el contenido |\n| Contraste | Texto y recursos |\n\n## Tabla amplia\n\n| C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 |\n|---|---|---|---|---|---|---|---|---|---|\n| uno | dos | tres | cuatro | cinco | seis | siete | ocho | NUEVE-CONSERVADO | DIEZ-CONSERVADO |\n\n## Código sin pérdida de espacios\n\n```text\n    entrada = 1\n        resultado = entrada + 2\n```\n\n");
    markdown.push_str(&format!(
        "Cadena larga sin espacios: {}\n\n",
        "ABCDEFGHIJ".repeat(75)
    ));
    for index in 1..=120 {
        markdown.push_str(&format!("### Sección {index}\n\nPárrafo {index}. La exportación conserva todo el documento, incluidos sus acentos y los apartados que necesitan otra página. Ningún resultado abreviado se comunica como completo.\n\n"));
    }
    markdown.push_str("## Último apartado\n\nFIN-CORPUS-15-VERIFICADO\n");
    let asset = ExportImageAsset {
        source: "qa.png".into(),
        alt: Some("Recurso raster de prueba".into()),
        content_type: "image/png".into(),
        bytes: include_bytes!("../../../icons/icon.png").to_vec(),
    };
    let bytes = export_pdf_with_assets_and_template(
        "Corpus de exportación",
        &markdown,
        &[],
        &[asset],
        None,
    )?;
    std::fs::write(&target, &bytes)?;
    std::fs::write(target.with_extension("md"), markdown)?;
    println!("{} bytes -> {}", bytes.len(), target.display());
    Ok(())
}
