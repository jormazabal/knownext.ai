use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    path::Path,
    time::Duration,
};
const SOURCE: &str = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
pub fn read(root: &Path) -> Value {
    std::fs::read(root.join("eur-usd.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(Value::Null)
}
pub fn valid(rate: &Value) -> bool {
    let Some(date) = rate["date"].as_str().and_then(|s| {
        time::Date::parse(
            s,
            &time::format_description::parse("[year]-[month]-[day]").ok()?,
        )
        .ok()
    }) else {
        return false;
    };
    let age = (time::OffsetDateTime::now_utc().date() - date).whole_days();
    (0..=7).contains(&age)
        && rate["usdPerEur"]
            .as_f64()
            .is_some_and(|n| n.is_finite() && n > 0.0)
}
pub fn convert(usd: f64, rate: &Value) -> Option<f64> {
    let n = rate["usdPerEur"].as_f64()?;
    if n > 0.0 && n.is_finite() && usd.is_finite() {
        Some(usd / n)
    } else {
        None
    }
}
pub fn refresh(root: &Path) -> Result<Value, String> {
    let mut previous = read(root);
    let today = knownext_core::now_iso()[..10].to_string();
    if previous["checkedAt"] == today {
        return Ok(previous);
    }
    if !previous.is_object() {
        previous = json!({});
    }
    previous["checkedAt"] = json!(today);
    // Persist the attempt too: retries must not query the ECB more than daily.
    write(root, &previous)?;
    let mut response = knownext_core::http_client_builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?
        .get(SOURCE)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?;
    let mut xml = String::new();
    response
        .by_ref()
        .take(64 * 1024)
        .read_to_string(&mut xml)
        .map_err(|e| e.to_string())?;
    let (date, rate) = parse(&xml)?;
    let value = json!({"date":date,"usdPerEur":rate,"source":SOURCE,"checkedAt":today});
    write(root, &value)?;
    Ok(value)
}
fn write(root: &Path, value: &Value) -> Result<(), String> {
    let mut f = tempfile::NamedTempFile::new_in(root).map_err(|e| e.to_string())?;
    f.write_all(
        serde_json::to_string(value)
            .map_err(|e| e.to_string())?
            .as_bytes(),
    )
    .map_err(|e| e.to_string())?;
    f.as_file().sync_all().map_err(|e| e.to_string())?;
    f.persist(root.join("eur-usd.json"))
        .map_err(|e| e.to_string())?;
    Ok(())
}
pub fn parse(xml: &str) -> Result<(String, f64), String> {
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut date = None;
    let mut rate = None;
    loop {
        match reader.read_event() {
            Ok(quick_xml::events::Event::Start(e)) | Ok(quick_xml::events::Event::Empty(e)) => {
                let mut currency = None;
                let mut amount = None;
                for a in e.attributes() {
                    let a = a.map_err(|e| e.to_string())?;
                    let value = a
                        .decode_and_unescape_value(reader.decoder())
                        .map_err(|e| e.to_string())?
                        .into_owned();
                    match a.key.as_ref() {
                        b"time" => date = Some(value),
                        b"currency" => currency = Some(value),
                        b"rate" => amount = value.parse::<f64>().ok(),
                        _ => {}
                    }
                }
                if currency.as_deref() == Some("USD") {
                    rate = amount;
                }
            }
            Ok(quick_xml::events::Event::Eof) => break,
            Err(e) => return Err(e.to_string()),
            _ => {}
        }
    }
    let date = date.ok_or("BCE: fecha ausente")?;
    let rate = rate
        .filter(|r| r.is_finite() && *r > 0.0)
        .ok_or("BCE: referencia USD inválida")?;
    Ok((date, rate))
}
pub fn price_entry(entry: &mut Value, rate: &Value) {
    if entry["costSchemaVersion"] == 2 {
        return;
    }
    let model = entry["model"].as_str().unwrap_or("");
    let catalog = knownext_core::model_catalog::model(model);
    let usd = if entry["capability"] == "image_generation" || model.starts_with("gpt-image") {
        let usage = &entry["providerUsage"];
        let p = catalog.map(|c| &c["pricing"]);
        p.and_then(|p| {
            let text = usage["input_tokens_details"]["text_tokens"].as_f64()?;
            let image = usage["input_tokens_details"]["image_tokens"].as_f64()?;
            let cached = usage["input_tokens_details"]["cached_tokens"]
                .as_f64()
                .unwrap_or(0.0);
            let details = &usage["input_tokens_details"]["cached_tokens_details"];
            // Unknown cache modality cannot be priced accurately: keep USD unavailable.
            let (ct, ci) = if cached > 0.0 {
                (
                    details["text_tokens"].as_f64()?,
                    details["image_tokens"].as_f64()?,
                )
            } else {
                (0.0, 0.0)
            };
            Some(
                ((text - ct).max(0.0) * p["input"].as_f64()?
                    + ct * p["cachedInput"].as_f64()?
                    + (image - ci).max(0.0) * p["imageInput"].as_f64()?
                    + ci * p["cachedImageInput"].as_f64()?
                    + usage["output_tokens"].as_f64()? * p["output"].as_f64()?)
                    / 1e6,
            )
        })
    } else if entry["capability"] == "audio" {
        catalog.and_then(|c| {
            Some(entry["durationSeconds"].as_f64()? / 60.0 * c["pricing"]["input"].as_f64()?)
        })
    } else {
        knownext_core::model_catalog::text_usd(
            model,
            entry["inputTokens"].as_u64().unwrap_or(0),
            entry["cachedInputTokens"].as_u64().unwrap_or(0),
            entry["outputTokens"].as_u64().unwrap_or(0),
        )
    };
    let tariff = catalog.map(|c| c["pricing"].clone());
    entry["costSchemaVersion"] = json!(2);
    entry["estimatedCostUsd"] = json!(usd);
    entry["estimatedCost"] = json!(usd.and_then(|u| convert(u, rate)));
    entry["estimatedCostEur"] = entry["estimatedCost"].clone();
    entry["currency"] = json!("EUR");
    entry["exchangeRate"] = rate.clone();
    entry["tariff"] = json!(tariff);
    entry["estimate"] = json!(true);
    entry["rateStale"] = json!(!valid(rate));
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_and_missing_rates_cannot_authorize_euro_budgets() {
        assert!(!valid(&Value::Null));
        assert!(!valid(&json!({"date":"2000-01-01","usdPerEur":1.25})));
        assert!(valid(
            &json!({"date":knownext_core::now_iso()[..10],"usdPerEur":1.25})
        ));
        let mut entry = json!({"model":"gpt-6.1-sol","inputTokens":1000});
        price_entry(&mut entry, &Value::Null);
        assert!(entry["estimatedCostEur"].is_null());
        assert_eq!(entry["estimatedCostUsd"], 0.002);
    }
    #[test]
    fn parses_ecb_and_converts_direction() {
        let (date, rate) =
            parse("<Cube><Cube time='2026-10-30'><Cube currency='USD' rate='1.25'/></Cube></Cube>")
                .unwrap();
        assert_eq!(date, "2026-10-30");
        assert_eq!(convert(10.0, &json!({"usdPerEur":rate})), Some(8.0));
        assert_eq!(convert(10.0, &Value::Null), None);
    }
    #[test]
    fn pricing_does_not_assume_uniform_cache_discount() {
        let mut e = json!({"model":"gpt-6.1-sol","inputTokens":1000,"cachedInputTokens":1000,"outputTokens":0});
        price_entry(&mut e, &json!({"usdPerEur":1.25}));
        assert_eq!(e["estimatedCostUsd"], 0.0001);
        assert_eq!(e["estimatedCostEur"], 0.00008);
    }
}
