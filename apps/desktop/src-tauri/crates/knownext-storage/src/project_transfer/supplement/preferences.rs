use super::*;

pub(super) fn append(api: &LocalApi, builder: &mut Builder<'_>) -> Result<(), String> {
    // Read through the strict state reader; future or damaged config never becomes portable defaults.
    let config = api.read_config_checked()?;
    let mut appearance = serde_json::Map::new();
    for (key, choices) in [
        ("language", &["es", "en", "eu"][..]),
        ("themeMode", &["system", "light", "dark"][..]),
        ("primaryColor", &["orange","amber","yellow","lime","olive","green","cyan","blue","indigo","wine","rose","red"][..]),
    ] {
        if let Some(value) = config["appearance"][key].as_str() {
            if choices.contains(&value) {
                appearance.insert(key.into(), json!(value));
            }
        }
    }
    if let Some(value) = config["appearance"]["zoomPercent"]
        .as_u64()
        .filter(|v| (50..=200).contains(v))
    {
        appearance.insert("zoomPercent".into(), json!(value));
    }
    if let Some(value) = config["appearance"]["markdownExtendedUnderlineEnabled"].as_bool() {
        appearance.insert("markdownExtendedUnderlineEnabled".into(), json!(value));
    }
    let mut layout = serde_json::Map::new();
    for key in ["sidebarWidth", "historyWidth"] {
        if let Some(value) = config["layout"][key]
            .as_u64()
            .filter(|v| (160..=1000).contains(v))
        {
            layout.insert(key.into(), json!(value));
        }
    }
    for key in ["navigationVisible","contextPinned"]{if let Some(value)=config["layout"][key].as_bool(){layout.insert(key.into(),json!(value));}}
    if let Some(value)=config["layout"]["contextKind"].as_str().filter(|s|matches!(*s,"assistant"|"document"|"properties"|"references")){layout.insert("contextKind".into(),json!(value));}
    let selected = json!({"format":"knownext.portable-preferences","schemaVersion":2,"appearance":appearance,"layout":layout,"applyAutomatically":false});
    builder.json("Preferencias.json", &selected)?;
    builder.items.push(json!({"kind":"preferences","path":"Preferencias.json","active":false,"scope":"appearance-and-panel-widths"}));
    // Observe only the selected projection again; credentials and unrelated writes do not enter the archive.
    let after = api.read_config_checked()?;
    if after["appearance"] != config["appearance"] || after["layout"] != config["layout"] {
        return Err("Las preferencias visuales cambiaron durante la preparación".into());
    }
    Ok(())
}
