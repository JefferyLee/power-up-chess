#!/bin/bash
# Slice the canonical Power Up Castle logo (candidate 4 — heraldic
# gold rook with shield + lightning, on navy) into the icon sizes
# Firebase Hosting + the PWA manifest + iOS expect.
#
# Input:  tools/brand/source.png  (high-res, square, transparent OK)
# Output: apps/web/public/icons/*.png  + the existing apps/web/public/favicon.svg
#
# Uses ffmpeg's `scale` filter with Lanczos sampling — better quality
# than convert's default for downscaling, and we don't need ImageMagick.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="${ROOT}/tools/brand/source.png"
DEST="${ROOT}/apps/web/public/icons"

if [[ ! -f "$SRC" ]]; then
  echo "❌ Missing source: $SRC"
  echo "   Put the high-resolution Power Up Castle logo PNG there first."
  exit 1
fi

mkdir -p "$DEST"

# Sizes we ship:
#   180×180 — apple-touch-icon.png   (iOS home-screen)
#   192×192 — icon-192.png           (PWA manifest, Android)
#   512×512 — icon-512.png           (PWA manifest splash, app stores)
#    32×32  — favicon-32.png         (Firefox/Chrome tab high-DPI)
#    16×16  — favicon-16.png         (legacy tab)
sizes=(
  "apple-touch-icon.png 180"
  "icon-192.png 192"
  "icon-512.png 512"
  "favicon-32.png 32"
  "favicon-16.png 16"
)

for entry in "${sizes[@]}"; do
  name=${entry%% *}
  px=${entry##* }
  out="${DEST}/${name}"
  echo "→ ${name} (${px}×${px})"
  ffmpeg -y -loglevel error -i "$SRC" -vf "scale=${px}:${px}:flags=lanczos" "$out"
done

echo "✓ Done. Icons written under apps/web/public/icons/"
