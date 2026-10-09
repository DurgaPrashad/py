#!/usr/bin/env bash
# Builds the macOS desktop app, ad-hoc signs it, and zips it into
# public/downloads so the website's "Download for Mac" button serves it.
set -euo pipefail
cd "$(dirname "$0")/.."

npx tauri build --bundles app
APP="src-tauri/target/release/bundle/macos/Reflex Presenter.app"
codesign --verify --deep --strict "$APP"

ARCH="$(uname -m)"
VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
OUT="public/downloads/Reflex-Presenter-macOS-${ARCH}.zip"
mkdir -p public/downloads
rm -f "$OUT"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT"

BYTES="$(stat -f%z "$OUT")"
cat > public/downloads/latest.json <<JSON
{
  "version": "${VERSION}",
  "file": "Reflex-Presenter-macOS-${ARCH}.zip",
  "arch": "${ARCH}",
  "bytes": ${BYTES},
  "built": "$(date -u +%Y-%m-%d)"
}
JSON
echo "Packaged $OUT ($((BYTES / 1024 / 1024)) MB)"
