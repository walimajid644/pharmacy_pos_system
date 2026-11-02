//! DI sandbox validation spike. Never posts an invoice or contacts production.
use crate::database_api::{current_actor, SessionState};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;
use tauri::State;
use tauri_plugin_sql::DbInstances;
const SANDBOX: &str = "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SandboxRequest {
    confirmed_di_route: bool,
    synthetic_data: bool,
    token: String,
    payload: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxResult {
    status: String,
    message: String,
    response: String,
}
fn required<'a>(v: &'a Value, field: &str) -> Result<&'a str, String> {
    v.get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.len() <= 2000)
        .ok_or_else(|| format!("Required text field: {field}"))
}
fn tax_id(value: &str) -> bool {
    [7, 13].contains(&value.len()) && value.bytes().all(|b| b.is_ascii_digit())
}
fn prepare(r: &SandboxRequest) -> Result<Value, String> {
    if !r.confirmed_di_route || !r.synthetic_data {
        return Err(
            "Confirm the portal uses DI sandbox and the payload contains synthetic sandbox data"
                .into(),
        );
    }
    if !(20..=4096).contains(&r.token.len()) || !r.token.bytes().all(|b| b.is_ascii_graphic()) {
        return Err("Enter a sandbox token without spaces or control characters".into());
    }
    if r.payload.len() > 256000 {
        return Err("Sandbox JSON exceeds 256 KB".into());
    }
    let p: Value = serde_json::from_str(&r.payload)
        .map_err(|_| "Enter valid invoice JSON copied from your assigned sandbox scenario")?;
    for name in [
        "invoiceType",
        "invoiceDate",
        "sellerNTNCNIC",
        "sellerBusinessName",
        "sellerProvince",
        "sellerAddress",
        "buyerBusinessName",
        "buyerProvince",
        "buyerAddress",
        "buyerRegistrationType",
        "scenarioId",
    ] {
        required(&p, name)?;
    }
    if !["Sale Invoice", "Debit Note"].contains(&required(&p, "invoiceType")?) {
        return Err("Unsupported invoiceType for this DI spike".into());
    }
    let date = required(&p, "invoiceDate")?;
    let parsed = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|_| "Use YYYY-MM-DD invoiceDate")?;
    if parsed.format("%Y-%m-%d").to_string() != date {
        return Err("Use YYYY-MM-DD invoiceDate".into());
    }
    if !tax_id(required(&p, "sellerNTNCNIC")?) {
        return Err("sellerNTNCNIC must be 7 or 13 digits from the assigned sandbox data".into());
    }
    let registration = required(&p, "buyerRegistrationType")?;
    if !["Registered", "Unregistered"].contains(&registration) {
        return Err("Choose Registered or Unregistered buyerRegistrationType".into());
    }
    if registration == "Registered"
        && !p
            .get("buyerNTNCNIC")
            .and_then(Value::as_str)
            .is_some_and(tax_id)
    {
        return Err("Registered buyer requires a 7/13 digit buyerNTNCNIC".into());
    }
    if required(&p, "invoiceType")? == "Debit Note" {
        required(&p, "invoiceRefNo")?;
    }
    let scenario = required(&p, "scenarioId")?;
    if scenario.len() != 5
        || !scenario.starts_with("SN")
        || !scenario.as_bytes()[2..].iter().all(u8::is_ascii_digit)
    {
        return Err("Use the SNnnn scenario assigned by your FBR portal".into());
    }
    let lines = p
        .get("items")
        .and_then(Value::as_array)
        .filter(|v| !v.is_empty() && v.len() <= 100)
        .ok_or("Use 1–100 sandbox items")?;
    for (i, line) in lines.iter().enumerate() {
        for name in ["hsCode", "productDescription", "rate", "uoM", "saleType"] {
            required(line, name).map_err(|e| format!("Item {}: {e}", i + 1))?;
        }
        for name in [
            "quantity",
            "totalValues",
            "valueSalesExcludingST",
            "fixedNotifiedValueOrRetailPrice",
            "salesTaxApplicable",
            "salesTaxWithheldAtSource",
        ] {
            let n = line
                .get(name)
                .and_then(Value::as_f64)
                .filter(|n| n.is_finite() && *n >= 0.0 && *n <= 1_000_000_000.0)
                .ok_or_else(|| {
                    format!("Item {}: {name} must be a nonnegative JSON number", i + 1)
                })?;
            if name == "quantity" && n == 0.0 {
                return Err("Item quantity must be positive".into());
            }
        }
    }
    Ok(p)
}
fn interpret(bytes: &[u8], expected: usize, token: &str) -> Result<SandboxResult, String> {
    let p: Value = serde_json::from_slice(bytes)
        .map_err(|_| "FBR sandbox returned a non-JSON response; no invoice was submitted")?;
    let header = p
        .get("validationResponse")
        .ok_or("Sandbox response has no validationResponse; review the portal")?;
    let valid = header.get("statusCode").and_then(Value::as_str) == Some("00")
        && header
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|s| s.eq_ignore_ascii_case("Valid"));
    let lines = header.get("invoiceStatuses").and_then(Value::as_array);
    let lines_valid = lines.is_some_and(|lines| {
        lines.len() == expected
            && lines.iter().all(|r| {
                r.get("statusCode").and_then(Value::as_str) == Some("00")
                    && r.get("status")
                        .and_then(Value::as_str)
                        .is_some_and(|s| s.eq_ignore_ascii_case("Valid"))
            })
    });
    let status = if valid && lines_valid {
        "valid"
    } else if !valid
        || lines.is_some_and(|lines| {
            lines
                .iter()
                .any(|r| r.get("statusCode").and_then(Value::as_str) != Some("00"))
        })
    {
        "invalid"
    } else {
        "review"
    };
    let response = serde_json::to_string_pretty(&p)
        .map_err(|_| "Could not format sandbox response")?
        .replace(token, "[redacted]");
    Ok(SandboxResult{status:status.into(),message:match status{"valid"=>"Sandbox validation accepted every item. No invoice was issued or reported to production.","invalid"=>"Sandbox validation rejected the payload or one of its items. Review the returned errors.",_=>"Response is incomplete for per-item confirmation. Review it in the assigned sandbox portal."}.into(),response})
}
#[tauri::command]
pub async fn validate_fbr_sandbox(
    instances: State<'_, DbInstances>,
    session: State<'_, SessionState>,
    request: SandboxRequest,
) -> Result<SandboxResult, String> {
    let pool = crate::database_api::pool(&instances).await?;
    crate::credit::require_role(
        &pool,
        &current_actor(&session).await?,
        &["admin", "manager"],
    )
    .await?;
    let p = prepare(&request)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Could not initialize secure sandbox client")?;
    let mut response=client.post(SANDBOX).bearer_auth(&request.token).json(&p).send().await.map_err(|_|"Sandbox connection failed or timed out. Check connectivity and portal onboarding; no invoice was submitted.")?;
    if !response.status().is_success() {
        return Err(format!("FBR sandbox HTTP {}. Check the token/onboarding in the portal. No production request was made.",response.status().as_u16()));
    }
    if response.content_length().is_some_and(|n| n > 128000) {
        return Err("Sandbox response is too large".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Sandbox response interrupted")?
    {
        if bytes.len() + chunk.len() > 128000 {
            return Err("Sandbox response exceeds 128 KB".into());
        }
        bytes.extend_from_slice(&chunk)
    }
    interpret(&bytes, p["items"].as_array().unwrap().len(), &request.token)
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn sandbox_mixed_header_and_item_statuses_never_claim_success() {
        let p = json!({"validationResponse":{"statusCode":"00","status":"Invalid","invoiceStatuses":[{"statusCode":"01","status":"Invalid","error":"Provide rate"}]}});
        assert_eq!(
            interpret(p.to_string().as_bytes(), 1, "secret")
                .unwrap()
                .status,
            "invalid"
        );
        let p = json!({"validationResponse":{"statusCode":"00","status":"Valid","invoiceStatuses":[{"statusCode":"00","status":"Valid"}]}});
        assert_eq!(
            interpret(p.to_string().as_bytes(), 1, "secret")
                .unwrap()
                .status,
            "valid"
        );
        assert_eq!(
            interpret(p.to_string().as_bytes(), 2, "secret")
                .unwrap()
                .status,
            "review"
        );
        assert!(interpret(b"<html>gateway</html>", 1, "secret").is_err());
    }
    #[test]
    fn sandbox_requires_route_confirmation_synthetic_data_and_scenario() {
        let r = SandboxRequest {
            confirmed_di_route: false,
            synthetic_data: true,
            token: "synthetic-token-for-unit-test".into(),
            payload: "{}".into(),
        };
        assert!(prepare(&r).unwrap_err().contains("Confirm"));
        let r = SandboxRequest {
            confirmed_di_route: true,
            ..r
        };
        assert!(prepare(&r).unwrap_err().contains("invoiceType"));
    }
    #[test]
    fn sandbox_payload_is_validated_without_network_and_token_is_redacted() {
        let payload = json!({"invoiceType":"Sale Invoice","invoiceDate":"2026-11-01","sellerNTNCNIC":"0000000","sellerBusinessName":"Synthetic seller","sellerProvince":"Sindh","sellerAddress":"Synthetic address","buyerBusinessName":"Synthetic buyer","buyerProvince":"Sindh","buyerAddress":"Synthetic address","buyerRegistrationType":"Unregistered","scenarioId":"SN001","items":[{"hsCode":"0000.0000","productDescription":"Synthetic scenario item","rate":"0%","uoM":"Numbers, pieces, units","saleType":"Assigned sandbox type","quantity":1,"totalValues":1,"valueSalesExcludingST":1,"fixedNotifiedValueOrRetailPrice":0,"salesTaxApplicable":0,"salesTaxWithheldAtSource":0}]});
        let mut r = SandboxRequest {
            confirmed_di_route: true,
            synthetic_data: true,
            token: "synthetic-token-for-unit-test".into(),
            payload: payload.to_string(),
        };
        assert!(prepare(&r).is_ok());
        assert_eq!(
            SANDBOX,
            "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb"
        );
        let mut bad = payload.clone();
        bad["scenarioId"] = json!("");
        r.payload = bad.to_string();
        assert!(prepare(&r).is_err());
        let mut bad = payload;
        bad["items"][0]["quantity"] = json!(-1);
        r.payload = bad.to_string();
        assert!(prepare(&r).is_err());
        let response = json!({"validationResponse":{"statusCode":"01","status":"Invalid","error":"synthetic-token-for-unit-test"}});
        assert!(!interpret(response.to_string().as_bytes(), 1, &r.token)
            .unwrap()
            .response
            .contains(&r.token));
    }
}
