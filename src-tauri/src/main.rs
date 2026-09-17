#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod devnotes;
mod fog;
mod journal;
mod schedule;

use std::{
    fs,
    io::Write as _,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration as StdDuration,
};

use chrono::{DateTime, Duration, Local};
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
struct Settings {
    interval_minutes: u64,
    /// "HH:MM" entries; when non-empty they replace the interval.
    fixed_times: Vec<String>,
    break_seconds: u64,
    messages: Vec<String>,
    allow_escape: bool,
    sound: bool,
    /// The assistant's display name (Jarvis-style AI). Was `dog_name`.
    assistant_name: String,
    /// When on, each break offers a 1-minute guided eye-exercise session.
    eye_exercises_enabled: bool,
    /// One exercise per entry, "Title | instruction". Rotated through on the cards.
    eye_exercises: Vec<String>,
    /// Seconds each exercise card stays before auto-advancing.
    eye_seconds_per_card: u64,
    autostart: bool,
    #[serde(default)]
    fog: fog::FogSettings,
    #[serde(default)]
    journal: journal::JournalSettings,
    #[serde(default)]
    devnotes: devnotes::DevNotesSettings,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            interval_minutes: 45,
            fixed_times: Vec::new(),
            break_seconds: 30,
            messages: default_messages(),
            allow_escape: true,
            sound: true,
            assistant_name: "ZenBot".into(),
            eye_exercises_enabled: true,
            eye_exercises: default_eye_exercises(),
            eye_seconds_per_card: 10,
            autostart: false,
            fog: fog::FogSettings::default(),
            journal: journal::JournalSettings::default(),
            devnotes: devnotes::DevNotesSettings::default(),
        }
    }
}

fn default_messages() -> Vec<String> {
    vec![
        "Systems check: hydrate, stand, and unclench that jaw. 💧".into(),
        "Break protocol engaged. Stretch those legs and take a short walk.".into(),
        "You've been running hot. Grab some water while you're up. 💧".into(),
    ]
}

fn default_eye_exercises() -> Vec<String> {
    vec![
        "Distance gaze | Look at something ~20 feet away and hold a soft, easy focus.".into(),
        "Palming | Rub your palms warm, cup them over closed eyes, and breathe slowly.".into(),
        "Slow blinking | Blink slowly and fully ten times to re-coat and refresh your eyes.".into(),
        "Figure eight | Trace a slow, lazy sideways figure-8 with your eyes.".into(),
        "Near & far focus | Focus on your thumb up close, then a far point. Alternate slowly."
            .into(),
        "Eye rolls | Roll your eyes slowly clockwise, then counter-clockwise.".into(),
    ]
}

impl Settings {
    fn sanitized(mut self) -> Self {
        self.interval_minutes = self.interval_minutes.clamp(1, 720);
        self.break_seconds = self.break_seconds.clamp(5, 600);
        self.eye_seconds_per_card = self.eye_seconds_per_card.clamp(3, 120);
        self.messages.retain(|m| !m.trim().is_empty());
        if self.messages.is_empty() {
            self.messages = default_messages();
        }
        self.eye_exercises.retain(|m| !m.trim().is_empty());
        if self.eye_exercises.is_empty() {
            self.eye_exercises = default_eye_exercises();
        }
        self.fixed_times.retain(|t| !t.trim().is_empty());
        self.assistant_name = self.assistant_name.trim().to_string();
        if self.assistant_name.is_empty() {
            self.assistant_name = "ZenBot".into();
        }
        self.fog = self.fog.sanitized();
        self.journal = self.journal.sanitized();
        self
    }
}

struct AppState {
    settings: Mutex<Settings>,
    next_break: Mutex<Option<DateTime<Local>>>,
    paused_until: Mutex<Option<DateTime<Local>>>,
    in_break: AtomicBool,
    msg_index: Mutex<usize>,
    current_message: Mutex<String>,
    fog_suggestion_index: Mutex<usize>,
}

fn config_dir(app: &AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_config_dir()
        .expect("no app config directory");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn settings_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("settings.json")
}

fn moods_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("moods.jsonl")
}

fn fog_log_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("fog_logs.jsonl")
}

fn journal_log_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("journal_logs.jsonl")
}

fn load_settings(app: &AppHandle) -> Settings {
    fs::read_to_string(settings_path(app))
        .ok()
        .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
        .map(Settings::sanitized)
        .unwrap_or_default()
}

fn persist_settings(app: &AppHandle, settings: &Settings) {
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(settings_path(app), json);
    }
}

fn append_mood(app: &AppHandle, mood: &str) {
    let entry = serde_json::json!({ "ts": Local::now().to_rfc3339(), "mood": mood });
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(moods_path(app))
    {
        let _ = writeln!(f, "{entry}");
    }
}

fn append_fog_log(app: &AppHandle, entry: &fog::FogLogEntry) {
    if let Ok(json) = serde_json::to_string(entry) {
        if let Ok(mut f) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(fog_log_path(app))
        {
            let _ = writeln!(f, "{json}");
        }
    }
}

fn append_journal_log(app: &AppHandle, entry: &journal::JournalEntry) {
    if let Ok(json) = serde_json::to_string(entry) {
        if let Ok(mut f) = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(journal_log_path(app))
        {
            let _ = writeln!(f, "{json}");
        }
    }
}

fn reschedule(app: &AppHandle) {
    let state = app.state::<AppState>();
    let s = state.settings.lock().unwrap().clone();
    *state.next_break.lock().unwrap() = Some(schedule::compute_next(
        s.interval_minutes,
        &s.fixed_times,
        Local::now(),
    ));
}

#[cfg(target_os = "macos")]
fn raise_above_everything(win: &tauri::WebviewWindow) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    if let Ok(ptr) = win.ns_window() {
        let ns = ptr as *mut AnyObject;
        if !ns.is_null() {
            unsafe {
                // kCGScreenSaverWindowLevel: above the menu bar and the Dock.
                let _: () = msg_send![ns, setLevel: 1000isize];
                // fullScreenAuxiliary (1 << 8) only: cover fullscreen apps too, but
                // WITHOUT canJoinAllSpaces, which was pulling every break window onto
                // the active display instead of leaving one per monitor.
                let _: () = msg_send![ns, setCollectionBehavior: 256usize];
            }
        }
    }
}

/// Take over every monitor with a break window. Idempotent while a break runs.
fn start_break(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.in_break.swap(true, Ordering::SeqCst) {
        return;
    }

    let settings = state.settings.lock().unwrap().clone();
    {
        let mut idx = state.msg_index.lock().unwrap();
        let msg = settings.messages[*idx % settings.messages.len()].clone();
        *idx = (*idx + 1) % settings.messages.len();
        *state.current_message.lock().unwrap() = msg;
    }

    // Tuck the Control Panel away so it does not show through the translucent break.
    if let Some(cp) = app.get_webview_window("settings") {
        let _ = cp.hide();
    }

    let primary_monitor = app.primary_monitor().ok().flatten();
    let primary_bounds = primary_monitor
        .as_ref()
        .map(|monitor| (*monitor.position(), *monitor.size()));
    let mut monitors = app.available_monitors().unwrap_or_default();
    if monitors.is_empty() {
        if let Some(primary) = primary_monitor {
            monitors.push(primary);
        }
    }
    monitors.sort_by_key(|monitor| {
        let bounds = (*monitor.position(), *monitor.size());
        if Some(bounds) == primary_bounds {
            0
        } else {
            1
        }
    });

    // Windows must be hidden while their physical bounds are assigned. Letting the OS
    // place a visible undecorated window first makes its initial monitor depend on the
    // cursor, and moving it afterward can leave the webview viewport at that old origin.
    let mut created = Vec::new();
    for monitor in &monitors {
        // The first window that is successfully created owns the interactive UI.
        let index = created.len();
        let label = format!("break-{index}");
        let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("break.html".into()))
            .title("ZenBot")
            .decorations(false)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .transparent(true)
            .focused(index == 0)
            .visible(false)
            .build();
        match built {
            Ok(win) => {
                let _ = win.set_size(tauri::Size::Physical(*monitor.size()));
                let _ = win.set_position(tauri::Position::Physical(*monitor.position()));
                #[cfg(target_os = "macos")]
                raise_above_everything(&win);
                created.push(win);
            }
            Err(e) => eprintln!("zenbot: failed to create {label}: {e}"),
        }
    }

    if created.is_empty() {
        state.in_break.store(false, Ordering::SeqCst);
        return;
    }
    for win in &created {
        let _ = win.show();
    }
    if let Some(primary) = created.first() {
        let _ = primary.set_focus();
    }
}

/// Close break windows, log the outcome, schedule the next break.
fn end_break(app: &AppHandle, mood: &str) {
    let state = app.state::<AppState>();
    if !state.in_break.swap(false, Ordering::SeqCst) {
        return;
    }
    append_mood(app, mood);
    for (label, win) in app.webview_windows() {
        if label.starts_with("break-") {
            let _ = win.destroy();
        }
    }
    // Bring the Control Panel back if it was open before the break.
    if let Some(cp) = app.get_webview_window("settings") {
        let _ = cp.show();
    }
    reschedule(app);
}

fn open_settings(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings.html".into()))
        .title("ZenBot Control Panel")
        .inner_size(860.0, 720.0)
        .min_inner_size(640.0, 560.0)
        .build();
}

fn open_mood_quicklog(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("mood-quicklog") {
        let _ = win.show();
        let _ = win.set_focus();
        let _ = win.emit("mood-quicklog-reset", ());
        return;
    }
    let built = WebviewWindowBuilder::new(app, "mood-quicklog", WebviewUrl::App("mood-quicklog.html".into()))
        .title("Mood Check-in")
        .inner_size(440.0, 700.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .focused(true)
        .build();
    match built {
        Ok(win) => {
            let _ = win.show();
            let _ = win.set_focus();
        }
        Err(e) => eprintln!("zenbot: failed to create mood-quicklog window: {e}"),
    }
}

fn spawn_scheduler(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(StdDuration::from_secs(1));
        let state = app.state::<AppState>();
        if state.in_break.load(Ordering::SeqCst) {
            continue;
        }
        let now = Local::now();
        let settings = state.settings.lock().unwrap().clone();

        {
            let mut paused = state.paused_until.lock().unwrap();
            if let Some(until) = *paused {
                if now < until {
                    continue;
                }
                *paused = None;
                *state.next_break.lock().unwrap() = Some(schedule::compute_next(
                    settings.interval_minutes,
                    &settings.fixed_times,
                    now,
                ));
                continue;
            }
        }

        let due = {
            let mut next = state.next_break.lock().unwrap();
            match *next {
                None => {
                    *next = Some(schedule::compute_next(
                        settings.interval_minutes,
                        &settings.fixed_times,
                        now,
                    ));
                    false
                }
                Some(t) => now >= t,
            }
        };

        if due {
            let handle = app.clone();
            let _ = app.run_on_main_thread(move || start_break(&handle));
        }
    });
}

// ---------------------------------------------------------------------------
// Commands (the only bridge the UI has to the system)
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Settings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(app: AppHandle, state: tauri::State<'_, AppState>, settings: Settings) {
    let mut clean = settings.sanitized();
    // devnotes has its own dedicated persist commands (verify/set password, save notes),
    // called independently of this one. Never let a general Settings save overwrite it
    // with whatever possibly-stale copy the frontend's cache happened to hold.
    clean.devnotes = state.settings.lock().unwrap().devnotes.clone();
    persist_settings(&app, &clean);
    let autolaunch = app.autolaunch();
    let _ = if clean.autostart {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };

    let previous_shortcut = state.settings.lock().unwrap().fog.shortcut.clone();
    if previous_shortcut != clean.fog.shortcut {
        if let Ok(old) = previous_shortcut.parse::<Shortcut>() {
            let _ = app.global_shortcut().unregister(old);
        }
        match clean.fog.shortcut.parse::<Shortcut>() {
            Ok(new_shortcut) => {
                if let Err(e) = app.global_shortcut().register(new_shortcut) {
                    eprintln!(
                        "zenbot: failed to register fog shortcut '{}': {e}",
                        clean.fog.shortcut
                    );
                }
            }
            Err(e) => eprintln!(
                "zenbot: could not parse fog shortcut '{}': {e}",
                clean.fog.shortcut
            ),
        }
    }

    *state.settings.lock().unwrap() = clean;
    if !state.in_break.load(Ordering::SeqCst) && state.paused_until.lock().unwrap().is_none() {
        reschedule(&app);
    }
}

#[tauri::command]
fn get_status(state: tauri::State<AppState>) -> serde_json::Value {
    serde_json::json!({
        "next_break_ms": state.next_break.lock().unwrap().map(|t| t.timestamp_millis()),
        "paused_until_ms": state.paused_until.lock().unwrap().map(|t| t.timestamp_millis()),
        "in_break": state.in_break.load(Ordering::SeqCst),
    })
}

#[tauri::command]
fn get_break_info(
    window: tauri::WebviewWindow,
    state: tauri::State<AppState>,
) -> serde_json::Value {
    serde_json::json!({
        "settings": state.settings.lock().unwrap().clone(),
        "message": state.current_message.lock().unwrap().clone(),
        "primary": window.label() == "break-0",
    })
}

#[tauri::command]
fn finish_break(app: AppHandle, mood: String) {
    let mood = if mood == "happy" { "happy" } else { "meh" };
    end_break(&app, mood);
}

#[tauri::command]
fn skip_break(app: AppHandle) {
    end_break(&app, "skipped");
}

#[tauri::command]
fn take_break_now(app: AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || start_break(&handle));
}

#[tauri::command]
fn pause_breaks(state: tauri::State<AppState>, minutes: u64) {
    *state.paused_until.lock().unwrap() = Some(Local::now() + Duration::minutes(minutes as i64));
}

#[tauri::command]
fn resume_breaks(app: AppHandle, state: tauri::State<'_, AppState>) {
    *state.paused_until.lock().unwrap() = None;
    reschedule(&app);
}

#[tauri::command]
fn get_mood_log(app: AppHandle) -> Vec<serde_json::Value> {
    fs::read_to_string(moods_path(&app))
        .map(|content| {
            let entries: Vec<serde_json::Value> = content
                .lines()
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            let skip = entries.len().saturating_sub(90);
            entries.into_iter().skip(skip).collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn submit_fog_log(
    app: AppHandle,
    state: tauri::State<AppState>,
    entry: fog::FogLogEntry,
) -> serde_json::Value {
    let mut entry = entry;
    entry.ts = Local::now().to_rfc3339();
    append_fog_log(&app, &entry);

    let settings = state.settings.lock().unwrap().clone();
    let reminders = fog::active_reminders(&settings.fog.things_to_try);
    let suggestion = {
        let mut idx = state.fog_suggestion_index.lock().unwrap();
        let pick = fog::pick_suggestion(&settings.fog.things_to_try, *idx);
        *idx = idx.wrapping_add(1);
        pick
    };
    serde_json::json!({ "suggestion": suggestion, "reminders": reminders })
}

#[tauri::command]
fn get_fog_log(app: AppHandle) -> Vec<serde_json::Value> {
    fs::read_to_string(fog_log_path(&app))
        .map(|content| {
            let entries: Vec<serde_json::Value> = content
                .lines()
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            let skip = entries.len().saturating_sub(1000);
            entries.into_iter().skip(skip).collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn dismiss_mood_quicklog(app: AppHandle) {
    if let Some(win) = app.get_webview_window("mood-quicklog") {
        let _ = win.hide();
    }
}

#[tauri::command]
fn open_mood_log_now(app: AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || open_mood_quicklog(&handle));
}

#[tauri::command]
async fn parse_journal_draft(
    state: tauri::State<'_, AppState>,
    text: String,
) -> Result<journal::ParsedDraft, ()> {
    let settings = state.settings.lock().unwrap().journal.clone();
    Ok(journal::parse_draft(&settings, &text).await)
}

#[tauri::command]
fn submit_journal_entry(app: AppHandle, state: tauri::State<AppState>, entry: journal::JournalEntry) -> serde_json::Value {
    let mut entry = entry;
    entry.ts = Local::now().to_rfc3339();
    append_journal_log(&app, &entry);

    if entry.fog_confirmed {
        append_fog_log(&app, &entry.to_fog_log());
    }

    // Lets any open window (Control Panel's Journal/Patterns tabs) refresh live
    // instead of only picking up new entries on next open.
    let _ = app.emit("journal-updated", ());

    if entry.fog_confirmed || entry.mood == "low" || entry.mood == "foggy" {
        let settings = state.settings.lock().unwrap().clone();
        let reminders = fog::active_reminders(&settings.fog.things_to_try);
        let suggestion = {
            let mut idx = state.fog_suggestion_index.lock().unwrap();
            let pick = fog::pick_suggestion(&settings.fog.things_to_try, *idx);
            *idx = idx.wrapping_add(1);
            pick
        };
        serde_json::json!({ "suggestion": suggestion, "reminders": reminders })
    } else {
        serde_json::json!({ "suggestion": null, "reminders": [] })
    }
}

#[tauri::command]
fn get_journal_log(app: AppHandle) -> Vec<serde_json::Value> {
    fs::read_to_string(journal_log_path(&app))
        .map(|content| {
            let entries: Vec<serde_json::Value> = content
                .lines()
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            let skip = entries.len().saturating_sub(1000);
            entries.into_iter().skip(skip).collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn verify_devnotes_password(state: tauri::State<AppState>, password: String) -> bool {
    let hash = state.settings.lock().unwrap().devnotes.password_hash.clone();
    devnotes::verify_password(&password, &hash)
}

#[tauri::command]
fn devnotes_password_is_set(state: tauri::State<AppState>) -> bool {
    !state.settings.lock().unwrap().devnotes.password_hash.is_empty()
}

#[tauri::command]
fn set_devnotes_password(app: AppHandle, state: tauri::State<AppState>, password: String) {
    let mut settings = state.settings.lock().unwrap().clone();
    settings.devnotes.password_hash = devnotes::hash_password(&password);
    persist_settings(&app, &settings);
    *state.settings.lock().unwrap() = settings;
}

#[tauri::command]
fn save_dev_notes(app: AppHandle, state: tauri::State<AppState>, notes: String) {
    let mut settings = state.settings.lock().unwrap().clone();
    settings.devnotes.notes = notes;
    persist_settings(&app, &settings);
    *state.settings.lock().unwrap() = settings;
}

#[tauri::command]
fn get_dev_sessions() -> Vec<devnotes::DevSession> {
    devnotes::dev_sessions()
}

// ---------------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            open_settings(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || open_mood_quicklog(&handle));
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            get_status,
            get_break_info,
            finish_break,
            skip_break,
            take_break_now,
            pause_breaks,
            resume_breaks,
            get_mood_log,
            submit_fog_log,
            get_fog_log,
            dismiss_mood_quicklog,
            open_mood_log_now,
            parse_journal_draft,
            submit_journal_entry,
            get_journal_log,
            verify_devnotes_password,
            devnotes_password_is_set,
            set_devnotes_password,
            save_dev_notes,
            get_dev_sessions,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            let first_run = !settings_path(&handle).exists();
            let settings = load_settings(&handle);
            if first_run {
                persist_settings(&handle, &settings);
            }
            if let Ok(shortcut) = settings.fog.shortcut.parse::<Shortcut>() {
                if let Err(e) = app.global_shortcut().register(shortcut) {
                    eprintln!(
                        "zenbot: failed to register fog shortcut '{}': {e}",
                        settings.fog.shortcut
                    );
                }
            } else {
                eprintln!(
                    "zenbot: could not parse fog shortcut '{}'",
                    settings.fog.shortcut
                );
            }

            app.manage(AppState {
                settings: Mutex::new(settings),
                next_break: Mutex::new(None),
                paused_until: Mutex::new(None),
                in_break: AtomicBool::new(false),
                msg_index: Mutex::new(0),
                current_message: Mutex::new(String::new()),
                fog_suggestion_index: Mutex::new(0),
            });

            let menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "break_now", "Take a break now", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "pause_1h", "Pause for 1 hour", true, None::<&str>)?,
                    &MenuItem::with_id(app, "resume", "Resume breaks", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "log_mood", "Log Mood", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "settings", "Open Control Panel", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "Quit ZenBot", true, None::<&str>)?,
                ],
            )?;
            TrayIconBuilder::with_id("main")
                // A monochrome "Z" template glyph so macOS tints it like the other
                // menu-bar icons (white on a dark bar, black on a light one) instead of a
                // colored blob or a white box. The Dock/app icon stays the full-color orb.
                .icon(tauri::include_image!("icons/menubar.png"))
                .icon_as_template(true)
                .tooltip("ZenBot, your break assistant")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "break_now" => {
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || start_break(&handle));
                    }
                    "pause_1h" => {
                        let state = app.state::<AppState>();
                        *state.paused_until.lock().unwrap() =
                            Some(Local::now() + Duration::minutes(60));
                    }
                    "log_mood" => {
                        let handle = app.clone();
                        let _ = app.run_on_main_thread(move || open_mood_quicklog(&handle));
                    }
                    "resume" => {
                        let state = app.state::<AppState>();
                        *state.paused_until.lock().unwrap() = None;
                        reschedule(app);
                    }
                    "settings" => open_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            reschedule(&handle);
            spawn_scheduler(handle.clone());
            // Show the Control Panel on launch so it is always reachable; the app
            // otherwise lives only in the menu bar and feels like it has no window.
            let _ = first_run;
            open_settings(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building ZenBot")
        .run(|_app, event| {
            // Keep running from the tray when the last window closes; only an
            // explicit app.exit() (tray Quit) carries an exit code.
            if let tauri::RunEvent::ExitRequested { code, api, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
