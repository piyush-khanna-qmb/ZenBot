#!/usr/bin/env bash
# Build ZenBot.app and package it as a drag-to-Applications .dmg.
#
# Rust only — NO Node required. (The Tauri CLI is installed through Cargo, and the
# ZenBot front-end is plain static HTML/CSS/JS, so there is no JavaScript build step.)
#
# Run it either way:
#   • double-click  build-dmg.command  in Finder, or
#   • ./scripts/build-macos-dmg.sh     in a terminal
set -euo pipefail

cd "$(dirname "$0")/.."   # repo root
echo "▶ Building ZenBot for macOS…"
echo ""

# 1. Xcode Command Line Tools (C compiler + git that Rust needs)
if ! xcode-select -p >/dev/null 2>&1; then
  echo "• Installing Xcode Command Line Tools — accept the system dialog that pops up."
  xcode-select --install || true
  echo "  When that finishes, run this again."
  exit 1
fi

# 2. Rust toolchain (via rustup)
if ! command -v cargo >/dev/null 2>&1; then
  echo "• Installing Rust (rustup)…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
fi
# make cargo available in THIS shell session
# shellcheck disable=SC1091
source "$HOME/.cargo/env" 2>/dev/null || export PATH="$HOME/.cargo/bin:$PATH"

# 3. Universal (Intel + Apple Silicon) build targets
echo "• Ensuring universal build targets…"
rustup target add aarch64-apple-darwin x86_64-apple-darwin >/dev/null

# 4. Tauri CLI — installed through Cargo, so Node is never involved
if ! cargo tauri --version >/dev/null 2>&1; then
  echo "• Installing the Tauri CLI (one-time, a few minutes)…"
  cargo install tauri-cli --version '^2.0' --locked
fi

# 5. Compile + package the universal DMG
echo "• Compiling and packaging — the first build takes several minutes. ☕"
echo ""
cargo tauri build --target universal-apple-darwin --bundles dmg

DMG=$(ls -t src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg 2>/dev/null | head -1 || true)
echo ""
if [ -n "${DMG:-}" ]; then
  echo "✅ Done! Your installer is ready:"
  echo "   $DMG"
  echo ""
  echo "   Opening it in Finder now — drag ZenBot into Applications to install."
  open -R "$DMG"
else
  echo "⚠ Build finished but no .dmg was found under"
  echo "  src-tauri/target/universal-apple-darwin/release/bundle/dmg/"
  exit 1
fi
