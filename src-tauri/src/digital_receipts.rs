use crate::database_api::{current_actor, SessionState};
use tauri::State;

#[tauri::command]
pub async fn open_whatsapp_receipt(session: State<'_, SessionState>, phone: String, message: String) -> Result<(), String> {
    current_actor(&session).await?;
    let digits: String = phone.chars().filter(|c| c.is_ascii_digit()).collect();
    let number = if digits.starts_with("03") && digits.len() == 11 { format!("92{}", &digits[1..]) }
        else if digits.starts_with("923") && digits.len() == 12 { digits }
        else { return Err("Enter a valid Pakistan mobile number for WhatsApp".into()); };
    if message.trim().is_empty() || message.len() > 1800 { return Err("Receipt summary is empty or too long".into()); }
    let encoded: String = message.bytes().map(|b| {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }
    }).collect();
    let url = format!("https://wa.me/{number}?text={encoded}");
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler").arg(url)
            .spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = url; Err("Digital receipt link is available on Windows only".into()) }
}
