use serde_json::Value;
use std::sync::OnceLock;
pub fn catalog() -> &'static Value {
    static CATALOG: OnceLock<Value> = OnceLock::new();
    CATALOG.get_or_init(|| {
        serde_json::from_str(include_str!("../../../../shared/openai-models.json"))
            .expect("valid bundled model catalog")
    })
}
pub fn model(id: &str) -> Option<&'static Value> {
    catalog()["models"]
        .as_array()?
        .iter()
        .find(|m| m["id"] == id)
}
pub fn validate(id: &str, capability: &str) -> Result<&'static Value, String> {
    let m = model(id)
        .ok_or_else(|| format!("Modelo desconocido: {id}. Selecciona un modelo del catálogo."))?;
    let today = crate::now_iso();
    if m["status"] == "retired"
        || m["shutdown"]
            .as_str()
            .is_some_and(|date| date <= &today[..10])
    {
        return Err(format!(
            "El modelo {id} está retirado. Selecciona otro modelo."
        ));
    }
    if !m["capabilities"]
        .as_array()
        .is_some_and(|a| a.iter().any(|v| v == capability))
    {
        return Err(format!("{id} no admite {capability}"));
    }
    Ok(m)
}
pub fn text_usd(id: &str, input: u64, cached: u64, output: u64) -> Option<f64> {
    let p = &model(id)?["pricing"];
    if p["unit"] != "millionTokens" {
        return None;
    }
    let long = p["longContextThreshold"]
        .as_u64()
        .is_some_and(|t| input > t);
    Some(
        ((input.saturating_sub(cached)) as f64 * p["input"].as_f64()?
            + cached.min(input) as f64 * p["cachedInput"].as_f64()?)
            * if long { 2.0 } else { 1.0 }
            / 1e6
            + output as f64 * p["output"].as_f64()? * if long { 1.5 } else { 1.0 } / 1e6,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn compatibility_and_actual_cached_rates() {
        assert!(validate("gpt-6.1-sol", "text").is_ok());
        assert!(validate("gpt-image-1", "image").is_err());
        assert!(validate("unknown", "text").is_err());
        assert!(validate("gpt-transcribe", "text").is_err());
        assert_eq!(text_usd("gpt-6.1-sol", 1000, 1000, 0), Some(0.0001));
    }
}
