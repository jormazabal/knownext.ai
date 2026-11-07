//! Shared structural budgets for persisted and transferred document data.
use super::*;
use std::io::Read;
pub(crate) const NOTE_BYTES:u64=64*1024*1024;

pub(crate) fn handwritten_source(path:&Path)->Result<Option<(Value,Vec<u8>)>,String>{
    let metadata=match std::fs::symlink_metadata(path){Ok(m)=>m,Err(e) if e.kind()==std::io::ErrorKind::NotFound=>return Ok(None),Err(_)=>return Err("No se puede consultar la nota; el original se conserva".into())};
    if !metadata.is_file()||batch::linked(&metadata)||metadata.len()>NOTE_BYTES{return Err("Nota no regular o mayor de64MiB; se conserva sin sustituir".into())}
    let mut bytes=Vec::new();std::fs::File::open(path).map_err(|_|"No se puede abrir la nota; el original se conserva")?.take(NOTE_BYTES+1).read_to_end(&mut bytes).map_err(|_|"No se pudo completar la lectura de la nota")?;
    if bytes.len() as u64>NOTE_BYTES{return Err("La nota creció fuera del límite; se conserva".into())}
    let value:Value=serde_json::from_slice(&bytes).map_err(|_|"La nota contiene JSON dañado; se conserva sin normalizar")?;handwritten(&value).map_err(|error|format!("{error}. La fuente se conserva sin normalizar"))?;Ok(Some((value,bytes)))
}

pub(crate) fn handwritten_payload(payload:&Value)->Result<Value,String>{
    let content=payload.get("content").ok_or("Faltan los trazos de la nota")?;handwritten(content)?;
    if serde_json::to_vec(content).map_err(|_|"No se pudo preparar la nota")?.len() as u64>NOTE_BYTES{return Err("La nota supera el límite de64MiB; no se ha escrito".into())}Ok(content.clone())
}

pub(crate) fn handwritten(content: &Value) -> Result<(), String> {
    if content["schemaVersion"] != 1 {
        return Err("Versión de nota no compatible".into());
    }
    for key in ["id","title","createdAt","updatedAt"]{if content.get(key).is_some_and(|v|!v.is_string()){return Err("Metadatos de nota no compatibles; se conservan".into())}}
    if content.get("defaultPage").is_some_and(|v|!v.is_object())||content.get("toolPresets").is_some_and(|v|!v.as_array().is_some_and(|items|items.iter().all(Value::is_object))){return Err("Preferencias de nota no compatibles; se conservan".into())}
    if let Some(ocr)=content.get("ocr"){if !ocr.is_object()||ocr.get("textByPage").is_some_and(|v|!v.as_object().is_some_and(|items|items.values().all(Value::is_string))){return Err("Texto reconocido no compatible; se conserva sin sustituir".into())}}
    let pages = content["pages"]
        .as_array()
        .filter(|pages| !pages.is_empty() && pages.len() <= 1000)
        .ok_or("Páginas de nota no válidas")?;
    let mut points = 0usize;
    let mut page_ids=BTreeSet::new();
    for page in pages {
        if !page["id"].as_str().is_some_and(|id|!id.is_empty()&&page_ids.insert(id)) || !page["background"].is_object() ||page["size"].get("unit").is_some_and(|v|v.as_str()!=Some("px")) {
            return Err("Página de nota no válida".into());
        }
        if let Some(elements)=page.get("generatedElements"){if !elements.as_array().is_some_and(|items|items.iter().all(|item|item["id"].is_string()&&item["strokeIds"].as_array().is_some_and(|ids|ids.iter().all(Value::is_string)))){return Err("Elementos generados no compatibles; se conservan".into())}}
        for dimension in ["width", "height"] {
            if !page["size"][dimension]
                .as_f64()
                .is_some_and(|value| value.is_finite() && value > 0. && value <= 20_000.)
            {
                return Err("Tamaño de página no válido".into());
            }
        }
        for stroke in page["strokes"]
            .as_array()
            .filter(|strokes| strokes.len() <= 100_000)
            .ok_or("Trazos no válidos")?
        {
            if stroke.get("tool").is_some_and(|v|!v.as_str().is_some_and(|s|matches!(s,"pen"|"fountain"|"pencil"|"marker"|"highlighter"|"eraser"|"lasso")))||stroke["tool"]=="pencil"&&(stroke.get("textureVersion").is_some_and(|v|v.as_u64()!=Some(1))||stroke.get("textureSeed").is_some_and(|v|!v.is_string())){return Err("Formato de trazo no compatible; se conserva sin normalizar".into())}
            let samples = stroke["points"]
                .as_array()
                .ok_or("Puntos de trazo no válidos")?;
            points = points.saturating_add(samples.len());
            if points > 2_000_000
                || !stroke["color"].is_string()
                || !stroke["width"]
                    .as_f64()
                    .is_some_and(|width| width > 0. && width <= 1000.)
                || !stroke["opacity"]
                    .as_f64()
                    .is_some_and(|opacity| (0. ..=1.).contains(&opacity))
            {
                return Err("Trazo fuera de límites".into());
            }
            for point in samples {
                if !point.as_array().is_some_and(|point| {
                    point.len() >= 2
                        && point.len() <= 6
                        && point.iter().all(|coordinate| {
                            coordinate.as_f64().is_some_and(|number| number.is_finite())
                        })
                }) {
                    return Err("Coordenadas no válidas".into());
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_tilt_samples_are_preserved_and_unknown_coordinate_shapes_are_rejected() {
        let mut note=default_handwritten_note("owned-note","Owned pen QA");
        note["pages"][0]["strokes"]=json!([{"id":"owned-stroke","color":"#111827","width":2,"opacity":1,"points":[[10,20],[20,30,0.5,1],[30,40,0.7,2,35],[40,50,0.8,3,45,-30]]}]);
        let original=note.clone();handwritten(&note).unwrap();assert_eq!(note,original);
        note["pages"][0]["strokes"][0]["points"][3]=json!([40,50,0.8,3,45,-30,99]);
        assert!(handwritten(&note).is_err());
        note["pages"][0]["strokes"][0]["points"][3]=json!([40,50,0.8,3,"invalid",-30]);
        assert!(handwritten(&note).is_err());
    }
}
