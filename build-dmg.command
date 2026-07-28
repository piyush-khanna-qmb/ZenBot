#!/usr/bin/env bash
# Double-click this file in Finder to build the ZenBot .dmg installer.
# (It just runs scripts/build-macos-dmg.sh from the project folder.)
cd "$(dirname "$0")"
exec bash scripts/build-macos-dmg.sh
