use super::conf::AppConfig;
use log::info;
use tauri::{Manager, WindowBuilder, WindowUrl};

#[tauri::command]
pub async fn reopen_main_window(app: tauri::AppHandle) -> Result<(), String> {
    // Check if a window with label "main" already exists
    if let Some(window) = app.get_window("main") {
        // Bring the existing window to focus
        window.set_focus().map_err(|e| e.to_string())?;
        info!("Main window already exists, brought to focus");
        return Ok(());
    }

    // If no window exists, create a new one
    let window = WindowBuilder::new(&app, "main", WindowUrl::App("/".into()))
        .fullscreen(false)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .title("WindowPet")
        .skip_taskbar(true)
        .build()
        .map_err(|e| e.to_string())?;

    // Match the overlay window to the monitor's logical size so the Phaser
    // canvas aligns with OS cursor coordinates (needed for click/drag hit-test).
    if let Ok(Some(monitor)) = window.current_monitor() {
        let scale = monitor.scale_factor();
        let logical = monitor.size().to_logical::<f64>(scale);
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
            width: logical.width,
            height: logical.height,
        }));
        let pos = monitor.position().to_logical::<f64>(scale);
        let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition {
            x: pos.x,
            y: pos.y,
        }));
    }

    // Allow click-through window
    window.set_ignore_cursor_events(true).map_err(|e| e.to_string())?;
    info!("Reopened main window");

    Ok(())
}

pub fn open_setting_window(app: tauri::AppHandle) {
    let settings = AppConfig::new();
    let _window = tauri::WindowBuilder::new(&app, "setting", WindowUrl::App("/setting".into()))
        .title("WindowPet Setting")
        .inner_size(1000.0, 650.0)
        .theme(if settings.get_theme() == "dark" {
            Some(tauri::Theme::Dark)
        } else {
            Some(tauri::Theme::Light)
        })
        .build()
        .unwrap_or_else(|e| {
            log::error!("Failed to create setting window: {}", e);
            panic!("Window creation failed: {}", e);
        });
    info!("open setting window");
}

/// Show (or create + show) the pet-anchored office popover window.
/// `px, py, pw, ph` describe the pet's bounding box in **physical** pixels.
#[tauri::command]
pub fn show_office_popover(
    app: tauri::AppHandle,
    px: f64,
    py: f64,
    pw: f64,
    ph: f64,
) -> Result<(), String> {
    info!("show_office_popover called: px={} py={} pw={} ph={}", px, py, pw, ph);
    const POPOVER_W: f64 = 384.0; // logical px
    const POPOVER_H: f64 = 540.0;
    const ANCHOR_GAP: f64 = 14.0;
    const SCREEN_MARGIN: f64 = 16.0;
    // extra reserved space at the bottom of the screen so the panel never
    // slips behind the macOS Dock / Windows taskbar.
    const BOTTOM_RESERVED: f64 = 80.0;

    let window = match app.get_window("office-popover") {
        Some(w) => w,
        None => {
            let w = WindowBuilder::new(
                &app,
                "office-popover",
                WindowUrl::App("/office-popover".into()),
            )
            .title("WindowPet Office")
            .inner_size(POPOVER_W, POPOVER_H)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?;

            // Native frosted-glass. Best-effort: never block the window on failure.
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
                if let Err(e) = apply_vibrancy(
                    &w,
                    NSVisualEffectMaterial::HudWindow,
                    Some(NSVisualEffectState::Active),
                    Some(22.0),
                ) {
                    log::warn!("apply_vibrancy failed (falling back to css glass): {:?}", e);
                }
            }
            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_acrylic;
                let _ = apply_acrylic(&w, Some((18, 18, 18, 125)));
            }

            w
        }
    };

    // ---- positioning (work in physical pixels) ----
    let scale = window.scale_factor().unwrap_or(1.0);
    let pop_w = POPOVER_W * scale;
    let pop_h = POPOVER_H * scale;
    let gap = ANCHOR_GAP * scale;
    let margin = SCREEN_MARGIN * scale;
    let bottom_reserved = BOTTOM_RESERVED * scale;

    // Pick the monitor that contains the pet anchor (multi-display aware).
    let mon = window
        .available_monitors()
        .ok()
        .and_then(|ms| {
            ms.into_iter().find(|m| {
                let p = m.position();
                let s = m.size();
                px >= p.x as f64
                    && px <= p.x as f64 + s.width as f64
                    && py >= p.y as f64
                    && py <= p.y as f64 + s.height as f64
            })
        })
        .or_else(|| window.current_monitor().ok().flatten());

    let (mon_x, mon_y, mon_w, mon_h) = match mon {
        Some(m) => {
            let p = m.position();
            let s = m.size();
            (p.x as f64, p.y as f64, s.width as f64, s.height as f64)
        }
        None => (0.0, 0.0, 1920.0, 1080.0),
    };

    // Horizontal: prefer the right side of the pet; flip to the left on overflow.
    let mut left = px + pw + gap;
    if left + pop_w > mon_x + mon_w {
        left = px - gap - pop_w;
    }
    left = left
        .max(mon_x + margin)
        .min(mon_x + mon_w - margin - pop_w);

    // Vertical: vertically center the popover on the pet, then clamp on-screen
    // so the whole panel (incl. its bottom) stays visible above the Dock/taskbar.
    let mut top = py + ph / 2.0 - pop_h / 2.0;
    top = top
        .max(mon_y + margin)
        .min(mon_y + mon_h - bottom_reserved - pop_h);

    window
        .set_position(tauri::PhysicalPosition::new(
            left.round() as i32,
            top.round() as i32,
        ))
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}
