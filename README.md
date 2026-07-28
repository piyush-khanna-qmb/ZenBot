# ZenBot 🔵

**A Jarvis-style AI that makes you take breaks — and looks after your eyes.**

Every so often (you decide when), a neon-blue AI core takes over your screen, reminds
you to stand up and drink water, counts down, and — if you want — walks you through a
one-minute guided **eye-care** routine before asking how you're doing. That's it.
That's the app.

The interface is a live **WebGL glass orb**: a translucent sphere with plasma swirling
inside it, a fresnel rim, a moving specular highlight and soft pulsing waves — rendered
in real time, no model files, no heavyweight 3D engine.

- 🪶 **Lightweight** Tauri app: ~10–15 MB installer, ~40 MB RAM, near-zero CPU while idle
- 🔒 **Super safe**: no network access *at all* (there is no HTTP capability compiled in),
  no accounts, no analytics. Settings and mood logs live only on your device.
- 👁️ **Guided eye-care**: an optional, editable stack of swipeable exercise cards
  (20-20-20, palming, blinking, figure-8, near/far focus, eye rolls)
- 🎨 **Customizable**: interval or fixed daily times, break length, the reminders it
  shows, the assistant's name, sound, hard mode, launch at login
- 🖥️ **Cross-platform**: macOS (`.dmg`) and Windows (`.exe`), primary display
- 🧡 **Open source**, MIT

## How a break works

1. At your chosen time, the **ZenBot core** powers up and dims your screen.
2. The screen is held for 30 s (configurable) with a hydrate/stretch reminder while a
   countdown ring ticks down and the orb pulses.
3. If **eye-care** is enabled, ZenBot then asks: *"Shall we run a one-minute eye-care
   routine?"*
   - **Begin** → a stack of glass cards appears, one exercise each. Every card holds
     for 10 s and auto-advances; **swipe left/right** (or press <kbd>←</kbd>/<kbd>→</kbd>)
     to skip. Six cards ≈ a one-minute break.
   - **Not now** → straight to the next step.
4. ZenBot asks **"Are you happy?"** — **Yes** or **Not really**. Your answer is stored in
   a local mood log (visible in the Control Panel; it never leaves your machine).

**Emergency escape:** hold <kbd>ESC</kbd> for 3 seconds to skip a break (in a meeting,
on a call…). You can disable this in the Control Panel for hard mode. ZenBot deliberately
does not fight OS-level force-quit — it's a break reminder, not a jail.

## Install

### macOS — Homebrew (recommended)

Homebrew strips the download quarantine for you, so it opens without the Gatekeeper
"damaged" warning:

```sh
brew install --cask piyush-khanna-qmb/tap/zenbot
```

That one command taps the repo and installs the app. To update later:

```sh
brew upgrade --cask zenbot
```

### macOS / Windows — download directly

Grab the latest from **[Releases](../../releases/latest)**:

| Platform | File |
|---|---|
| macOS (Intel + Apple Silicon) | `ZenBot_x.y.z_universal.dmg` |
| Windows | `ZenBot_x.y.z_x64-setup.exe` |

The downloads are **not signed with a paid developer certificate**, so the OS shows a
warning on first launch. This is expected, not a virus.

#### macOS says *"ZenBot is damaged and can't be opened"*

This is macOS Gatekeeper reacting to the download quarantine on an unsigned app, not
actual damage. Any one of these fixes it:

- **Best:** install via Homebrew (above): it never happens.
- Or, after dragging ZenBot to Applications, run once in Terminal:
  ```sh
  xattr -cr /Applications/ZenBot.app
  ```
  then open it normally.
- Or: System Settings → Privacy & Security → scroll down → **Open Anyway**.

#### Windows says *"Windows protected your PC"*

Click **More info → Run anyway**.

ZenBot lives in your menu bar / system tray: take a break now, pause for an hour, open
the Control Panel, or quit.

## Customize

Open the **Control Panel** from the tray icon:

| Setting | Default | Meaning |
|---|---|---|
| Break every | 45 min | Interval between breaks |
| Fixed times | (none) | e.g. `10:30`, `15:00`; when set, these replace the interval |
| Break length | 30 s | The countdown |
| Reminders | 3 built-ins | One per line; ZenBot rotates through them |
| Sound | on | Soft synthesized chime + power-up (no audio files) |
| Emergency escape | on | Hold ESC to skip; turn off for hard mode |
| Assistant name | ZenBot | The name shown on the HUD |
| **Eye-care** | on | Offer a guided eye-exercise break after each reminder |
| Seconds per card | 10 s | How long each exercise card holds before auto-advancing |
| Exercises | 6 built-ins | `Title \| instruction` per line; each becomes a swipeable card |
| Launch at login | off | Start ZenBot with your computer |

Settings are plain JSON at:

- macOS: `~/Library/Application Support/com.piyush-khanna-qmb.zenbot/settings.json`
- Windows: `%APPDATA%\com.piyush-khanna-qmb.zenbot\settings.json`

## Make the `.dmg` installer yourself

The end product is an ordinary macOS `.dmg`: open it and **drag ZenBot into
Applications** — no terminal, no Node, nothing technical for the person installing it.
You just need to produce that `.dmg` once. Pick whichever is easiest:

### Easiest: build in the cloud (no tools on your Mac at all)

1. Push this project to a GitHub repo.
2. Create a release/tag like `v0.2.6` (GitHub → **Releases → Draft a new release →**
   choose a new tag → **Publish**).
3. The included workflow (`.github/workflows/release.yml`) compiles it on GitHub's Macs
   and attaches `ZenBot_x.y.z_universal.dmg` to a **draft release**. Download it there.

You never install Rust or Node locally — GitHub does the building.

### Or: build locally with one double-click (Rust only, no Node)

On the Mac where you want to build:

- **Double-click `build-dmg.command`** in Finder, **or** run `./scripts/build-macos-dmg.sh`.

The script installs what it needs the first time (Xcode Command Line Tools + Rust — it
walks you through it), compiles a universal Intel/Apple-Silicon build, and pops the
finished `.dmg` open in Finder. ZenBot's interface is plain static HTML/CSS/JS, so the
Tauri CLI is installed through Cargo and **Node is never involved**.

> First build takes several minutes (Rust compiles everything once); later builds are
> fast. The `.dmg` lands in
> `src-tauri/target/universal-apple-darwin/release/bundle/dmg/`.

### Advanced: the Node toolchain (optional)

If you already use Node and want live-reload dev mode:

```sh
npm install
npm run dev     # run in dev mode with hot reload
npm run build   # produce the installer for your OS
```

## Publish the tap

To let anyone `brew install --cask piyush-khanna-qmb/tap/zenbot`:

1. Create a public GitHub repo named **`homebrew-tap`** (the `homebrew-` prefix is what
   makes `piyush-khanna-qmb/tap` resolve).
2. Copy [`Casks/zenbot.rb`](Casks/zenbot.rb) from this repo into `Casks/zenbot.rb` in the
   tap repo, and replace `piyush-khanna-qmb` with the real GitHub username.
3. On each release, bump `version` in the cask to match the git tag (without the leading
   `v`) and paste the DMG's real digest into `sha256`:
   ```sh
   shasum -a 256 ZenBot_<version>_universal.dmg
   ```
4. Users install with `brew install --cask piyush-khanna-qmb/tap/zenbot` and update with
   `brew upgrade --cask zenbot`.

## The orb

The AI core (`ui/orb.js`) is a single WebGL fragment shader: a ray is cast per pixel,
intersected with a sphere, refracted inward and marched through animated 3D simplex-noise
plasma, then shaded with a fresnel rim, a moving specular highlight and procedural
reflections. Its hue, energy and glow shift with each phase of the break. No `three.js`,
no assets — every knob (size, color, turbulence, refraction) is a one-liner near the top
of the file.

## License

MIT, see [LICENSE](LICENSE).
