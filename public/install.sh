#!/bin/sh
# Installs Present for Mac, ready to open:
#
#   curl -fsSL https://present.waspid.com/install.sh | sh
#
# Downloads made with curl aren't quarantined, so macOS opens the app without
# the "Apple could not verify…" warning. Installs to /Applications (or
# ~/Applications when that isn't writable) and replaces an older version.
set -eu

BASE="${PRESENT_BASE:-https://present.waspid.com}"
URL="$BASE/downloads/Present-macOS-arm64.zip"
APP="Present.app"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Present for Mac needs macOS. Use the web app instead: $BASE/app" >&2
  exit 1
fi
if [ "$(uname -m)" != "arm64" ]; then
  echo "Present for Mac needs Apple Silicon (M1 or later). Use the web app instead: $BASE/app" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading Present…"
curl -fL --progress-bar "$URL" -o "$TMP/present.zip"
ditto -x -k "$TMP/present.zip" "$TMP/unzipped"
if [ ! -d "$TMP/unzipped/$APP" ]; then
  echo "The download didn't contain $APP. Try again in a minute." >&2
  exit 1
fi

DEST="${PRESENT_INSTALL_DIR:-/Applications}"
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
fi
mkdir -p "$DEST"

# Quit a running copy so it can be replaced.
if pgrep -x reflex-presenter >/dev/null 2>&1; then
  osascript -e 'tell application id "com.reflexpresenter.app" to quit' >/dev/null 2>&1 || true
  sleep 1
fi
rm -rf "${DEST:?}/$APP"
ditto "$TMP/unzipped/$APP" "$DEST/$APP"
xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true

echo "Installed $DEST/$APP"
open "$DEST/$APP"
