#!/bin/bash
# Exports the onboarding photos from their full-quality masters (assets/onboarding/source/) into the
# light copies the app bundles (assets/onboarding/) and the website serves (web/site/img/).
# The app copies are sized for how large each photo is ever drawn, so OTA updates stay small.
# macOS only (sips), like the other brand scripts. Run: npm run brand:onboarding
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=assets/onboarding/source
APP=assets/onboarding
WEB=web/site/img
mkdir -p "$WEB"

export_jpg() { # source, target, longest side, quality
  sips -s format jpeg -s formatOptions "$4" -Z "$3" "$SRC/$1.jpg" --out "$2" >/dev/null
}

# Full-screen scenes (welcome tour cards and phone screens, login backdrop, website phones).
for name in welcome capture ephemeral chat memories; do
  export_jpg "$name" "$APP/$name.jpg" 1600 72
done
# The website shows Ola only as a face (chat-face.jpg below), not the full portrait.
for name in welcome capture ephemeral memories; do
  export_jpg "$name" "$WEB/$name.jpg" 1200 70
done
# Memories grid tiles: drawn as small squares (the app's centre tile zooms, so it uses memories.jpg).
for name in memory-coffee memory-dog memory-skate memory-cake memory-city memory-hike; do
  export_jpg "$name" "$APP/$name.jpg" 800 68
  export_jpg "$name" "$WEB/$name.jpg" 900 68
done
# Ola's face as a square (chat avatar and Memories tile): a centre crop of the portrait would cut her head off.
FACE="$(mktemp -t nix-face).jpg"
sips -s format jpeg --cropToHeightWidth 1050 1050 --cropOffset 330 65 "$SRC/chat.jpg" --out "$FACE" >/dev/null
sips -s format jpeg -s formatOptions 74 -Z 600 "$FACE" --out "$APP/chat-face.jpg" >/dev/null
sips -s format jpeg -s formatOptions 74 -Z 600 "$FACE" --out "$WEB/chat-face.jpg" >/dev/null
rm -f "$FACE"
# Friend avatars in the camera scene: 34–40 pt circles.
for name in avatar-o avatar-k avatar-m; do
  export_jpg "$name" "$APP/$name.jpg" 192 78
  export_jpg "$name" "$WEB/$name.jpg" 192 78
done
du -ch "$APP"/*.jpg | tail -1 | sed 's/total/app total/'
du -ch "$WEB"/*.jpg | tail -1 | sed 's/total/web total/'
