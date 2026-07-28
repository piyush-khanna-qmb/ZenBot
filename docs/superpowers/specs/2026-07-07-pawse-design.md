# Pawse, design spec (2026-07-07)

## What

A lightweight, open-source, cross-platform break enforcer. At a custom interval (or fixed
daily times), a 3D golden retriever takes over every monitor, tells the user to take a walk
and drink water, counts down 30 seconds, asks "are you happy?", reacts, and leaves.

## Decisions (user-approved)

- **Stack:** Tauri v2 (Rust core + system webview). ~10–15 MB installers, ~40 MB idle RAM.
- **Forced-ness:** blocks all monitors and swallows input for the break, but holding **ESC
  for 3 s** is an emergency escape. The escape hatch can be disabled in settings (hard mode).
  Not kiosk-grade: OS-level quit (Cmd+Q / Task Manager) is intentionally not fought.
- **Dog:** procedural low-poly golden retriever built in three.js from primitives, no asset
  files, no license risk, fully animatable and color-customizable. Rendered on an opaque
  near-black backdrop (no photo background), HD (antialias, soft light, shadow).
- **Happiness answer:** logged locally to JSONL (never leaves the machine) + dog reaction
  (zoomies when happy, sympathetic head-tilt otherwise).

## Architecture

```
src-tauri/ (Rust)                     ui/ (vanilla JS + three.js, no framework)
├── scheduler thread (1 s tick)      ├── break.html/js: takeover screen, countdown,
│    interval OR fixed daily times   │                    ESC-hold skip, happiness question
├── tray/menubar                     ├── dog.js: procedural retriever + animations
│    break now · pause 1h · settings ├── settings.html/js, all options + mood history
├── settings JSON  (config dir)      └── vendor/three.module.min.js
├── mood log JSONL (config dir)
├── break windows: one per monitor, always-on-top,
│    undecorated; macOS: NSScreenSaverWindowLevel via objc2
└── plugins: single-instance, autostart
```

- **No network capability at all**: no HTTP plugin, strict CSP, all data local.
- Frontend served straight from `ui/` (`frontendDist`), `withGlobalTauri`, no bundler.
- UI talks to Rust only via app commands (`get_break_info`, `finish_break`, `skip_break`,
  `get_settings`, `save_settings`, `get_status`, `get_mood_log`, `take_break_now`).

## Break flow

1. Scheduler fires → Rust creates one break window per monitor (primary gets the dog + UI,
   secondaries get dim screen + message).
2. Dog walks in and sits (~2.5 s), typewriter message ("Time for a walk 🐾 grab some
   water…"), 30 s countdown ring. Cursor hidden, keys/clicks swallowed.
3. Countdown ends → "Are you happy?", Yes / Not really (mouse + Y/N keys).
4. Dog reacts ~3 s, windows fade and close, mood appended to log, next break scheduled.
5. Any time: hold ESC 3 s → skip (logged as skipped), unless disabled in settings.

## Settings (JSON, all customizable)

interval_minutes (45) · fixed_times [] (overrides interval when set) · break_seconds (30) ·
messages [rotating list] · allow_escape (true) · escape_hold_seconds (3) · sound (true,
WebAudio chime, no asset) · dog_name ("Biscuit") · coat ("golden" | hex) · autostart (false)

## Packaging & safety

- `tauri build` → DMG (macOS, built/verified locally) + NSIS `.exe` (Windows, via GitHub
  Actions release workflow on tag push).
- MIT license, open source. README documents: unsigned-build Gatekeeper/SmartScreen steps,
  the no-network guarantee, and exactly what the escape hatch does.

## v0.2: real-dog video engine (user-requested follow-up)

The default dog is now real retriever footage, not the procedural 3D model:

- **Format**: packed-alpha H.264 (color left, alpha matte right, one file),
  recomposited by a WebGL shader (`ui/videodog.js`), the only transparent-video
  approach that behaves identically in WKWebView and WebView2.
- **Clips**: `idle.mp4` (ping-pong seamless loop), `happy.mp4`, `sad.mp4`, bundled as
  Tauri resources and served via the asset protocol (scope: `$RESOURCE/clips/**` and
  `$APPCONFIG/dogclips/**`). User clips in `<config>/dogclips/` override bundled ones.
- **Source**: CC-BY YouTube footage (CurioWorld), studio segment, matted with rembg
  (ISNet), full pipeline in `scripts/matte.py` + `scripts/pack-clips.sh`; attribution
  in ASSETS.md.
- **Setting**: `dog_style` = "auto" (video when clips exist) | "video" | "3d". The
  procedural 3D dog remains as fallback and option.

## Testing

- Rust unit tests for the next-break-time math (interval + fixed-times + pause).
- `cargo build` + local `tauri build` DMG as CI-equivalent verification; brief launch QA.
