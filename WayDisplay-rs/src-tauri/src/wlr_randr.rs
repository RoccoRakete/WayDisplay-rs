use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::process::Command;

// We define structs to represent the wlr-randr JSON structure
// This makes the communication between Rust and TS much safer
#[derive(Debug, Serialize, Deserialize)]
pub struct DisplayMode {
    width: i32,
    height: i32,
    refresh: f32,
    preferred: bool,
    current: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct PhysicalSize {
    width: i32,
    height: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DisplayPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Display {
    name: String,
    make: String,
    model: String,
    serial: Option<String>,
    enabled: bool,
    adaptive_sync: bool,
    scale: f32,
    modes: Vec<DisplayMode>,
    physical_size: PhysicalSize,
    #[serde(skip_serializing_if = "Option::is_none")]
    position: Option<DisplayPosition>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DisplaySettings {
    pub display_name: String,
    pub width: i32,
    pub height: i32,
    pub refresh: f32,
    pub adaptive_sync: bool,
    pub enabled: bool,
    pub scaling: f32,
    pub position_relative_to: Option<String>, // Name des Referenz-Monitors
    pub position_direction: Option<String>,   // "left-of", "right-of", "above", "below"
}

#[tauri::command]
pub fn check_wlr_randr(program: &str) -> bool {
    if let Ok(path) = env::var("PATH") {
        return path
            .split(':')
            .any(|p| fs::metadata(format!("{p}/{program}")).is_ok());
    }
    false
}

#[tauri::command]
pub async fn get_display_info() -> Result<Vec<Display>, String> {
    // Execute wlr-randr
    let output = Command::new("wlr-randr")
        .arg("--json")
        .output()
        .map_err(|e| format!("Failed to execute wlr-randr: {}", e))?;

    if output.status.success() {
        let json_str = String::from_utf8_lossy(&output.stdout);
        // Parse the JSON string into our Rust Vec<Display>
        let mut displays: Vec<Display> =
            serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // Setze initiale Positionen, falls nicht vorhanden
        for (index, display) in displays.iter_mut().enumerate() {
            if display.position.is_none() {
                display.position = Some(DisplayPosition {
                    x: (index as i32) * 1920, // Standard-Offset
                    y: 0,
                });
            }
        }

        Ok(displays)
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("wlr-randr error: {}", err_msg))
    }
}

#[tauri::command]
pub async fn apply_settings(settings: DisplaySettings) -> Result<String, String> {
    let mode_str = format!(
        "{}x{}@{}",
        settings.width, settings.height, settings.refresh
    );
    let mut cmd = Command::new("wlr-randr");
    cmd.arg("--output")
        .arg(&settings.display_name)
        .arg("--mode")
        .arg(&mode_str)
        .arg("--scale")
        .arg(settings.scaling.to_string());

    // NEU: Relative Position statt absolute Koordinaten
    if let (Some(ref_monitor), Some(direction)) =
        (settings.position_relative_to, settings.position_direction)
    {
        let arg = match direction.as_str() {
            "left-of" => "--left-of",
            "right-of" => "--right-of",
            "above" => "--above",
            "below" => "--below",
            _ => {
                return Err(format!("Invalid position direction: {}", direction));
            }
        };
        cmd.arg(arg).arg(&ref_monitor);
    }

    if settings.adaptive_sync {
        cmd.arg("--adaptive-sync").arg("enabled");
    } else {
        cmd.arg("--adaptive-sync").arg("disabled");
    }

    if settings.enabled {
        cmd.arg("--on");
    } else {
        cmd.arg("--off");
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(format!("Applied settings to {}", settings.display_name))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}
