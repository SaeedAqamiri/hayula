#!/usr/bin/env bash
#
# Optional setup for the four reference systems.
#
# This script is NOT required to start the course. The chapters in course/
# stand on their own; references add grounded implementation detail only when
# the reader wants it (typically: engineer-shaped questions, repeated
# implementation drilling, or explicit "how does X handle Y" asks).
#
# Run this script when:
#   - You want to clone all four references at once for offline study, OR
#   - Your AI pair has just offered to clone one and you want to do them all.
#
# Otherwise, ignore it. The course works without it.

set -euo pipefail

# --- Configuration ---------------------------------------------------------
# Override any of these via environment variables to point at forks, mirrors,
# or commit-pinned snapshots. Examples:
#   OPENCODE_REPO=https://github.com/your-fork/opencode.git ./setup.sh
#   HERMES_REPO=git@github.com:your-org/hermes-agent.git ./setup.sh

OPENCODE_REPO="${OPENCODE_REPO:-https://github.com/anomalyco/opencode}"
HERMES_REPO="${HERMES_REPO:-https://github.com/nousresearch/hermes-agent}"
OPENCLAW_REPO="${OPENCLAW_REPO:-https://github.com/openclaw/openclaw}"
PAPERCLIP_REPO="${PAPERCLIP_REPO:-https://github.com/paperclipai/paperclip}"

REFERENCES_DIR="${REFERENCES_DIR:-references}"
CLONE_DEPTH="${CLONE_DEPTH:-1}"    # shallow clone by default; set to 0 for full history

# --- Helpers ---------------------------------------------------------------

clone_if_missing() {
  local name=$1
  local url=$2
  local target="$REFERENCES_DIR/$name"

  if [ -d "$target/.git" ]; then
    echo "[skip] $name — already cloned at $target"
    return 0
  fi

  if [ -d "$target" ] && [ -n "$(ls -A "$target" 2>/dev/null)" ]; then
    echo "[skip] $name — $target exists and is not empty (not a git checkout); leaving alone"
    return 0
  fi

  echo "[clone] $name <- $url"
  if [ "$CLONE_DEPTH" -gt 0 ] 2>/dev/null; then
    git clone --depth="$CLONE_DEPTH" "$url" "$target"
  else
    git clone "$url" "$target"
  fi
}

# --- Main ------------------------------------------------------------------

mkdir -p "$REFERENCES_DIR"

echo "=== Cloning reference systems to $REFERENCES_DIR/ ==="
echo ""

clone_if_missing "opencode"     "$OPENCODE_REPO"
clone_if_missing "hermes-agent" "$HERMES_REPO"
clone_if_missing "openclaw"     "$OPENCLAW_REPO"
clone_if_missing "paperclip"    "$PAPERCLIP_REPO"

echo ""
echo "=== Done ==="
echo ""

# Report state
present=()
for name in opencode hermes-agent openclaw paperclip; do
  if [ -d "$REFERENCES_DIR/$name/.git" ]; then
    present+=("$name")
  fi
done

if [ ${#present[@]} -gt 0 ]; then
  echo "Reference systems available at $REFERENCES_DIR/:"
  for name in "${present[@]}"; do
    echo "  - $name"
  done
  echo ""
  echo "Your AI pair can now cite source files when you ask implementation questions."
else
  echo "No reference systems were cloned. Check the URLs in setup.sh, or override"
  echo "via env vars (OPENCODE_REPO, HERMES_REPO, OPENCLAW_REPO, PAPERCLIP_REPO)."
fi
