#!/usr/bin/env bash
# Regenerates every NiX brand export from the master SVGs in assets/brand/master
# (the mark drawn in the app, src/components/brand/DrawnLogo.tsx, is the source of truth).
# Never edit a PNG by hand: change a master and run `npm run brand:generate`. macOS only.
set -euo pipefail
cd "$(dirname "$0")/../.."
render() { swift scripts/brand/render-svg.swift "$@"; }
M=assets/brand/master
B=assets/brand
APPICON=ios/NiX/Images.xcassets/AppIcon.appiconset
SPLASH=ios/NiX/Images.xcassets/SplashScreenLogo.imageset
WIDGET=ios/ExpoWidgetsTarget/Assets.xcassets/NixWidgetLogo.imageset

# App icon: opaque tile (App Store rejects alpha), dark (glow on transparent), tinted (mark only).
render $M/nix-icon.svg $B/app/ios-light.png 1024 --opaque
cp $B/app/ios-light.png $B/app/app-store-1024.png
render $M/nix-icon-dark.svg $B/app/ios-dark.png 1024
render $M/nix-mark.svg $B/app/ios-tinted.png 1024
cp $B/app/ios-light.png "$APPICON/App-Icon-1024x1024@1x.png"
cp $B/app/ios-dark.png "$APPICON/App-Icon-dark-1024x1024@1x.png"
cp $B/app/ios-tinted.png "$APPICON/App-Icon-tinted-1024x1024@1x.png"

# Launch screen: the white mark on the indigo launch background.
render $M/nix-mark.svg $B/splash/splash-mark.png 1024
for scale in 1 2 3; do
  suffix=$([ $scale = 1 ] && echo "" || echo "@${scale}x")
  render $M/nix-mark.svg "$SPLASH/image${suffix}.png" $((160 * scale))
done

# Widget header logo (34 pt) and favicons: the icon tile.
for scale in 1 2 3; do
  suffix=$([ $scale = 1 ] && echo "" || echo "@${scale}x")
  render $M/nix-icon.svg "$B/widget/NixWidgetLogo${suffix}.png" $((34 * scale)) --opaque
  cp "$B/widget/NixWidgetLogo${suffix}.png" "$WIDGET/NixWidgetLogo${suffix}.png"
done
for px in 16 32 48; do render $M/nix-icon.svg $B/web/favicon-$px.png $px --opaque; done
python3 - "$B/web" <<'PY'
import struct, sys, os
d = sys.argv[1]
pngs = [open(os.path.join(d, f"favicon-{s}.png"), "rb").read() for s in (16, 32, 48)]
head = struct.pack("<HHH", 0, 1, len(pngs))
offset = 6 + 16 * len(pngs)
entries = b""
for size, data in zip((16, 32, 48), pngs):
    entries += struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
open(os.path.join(d, "favicon.ico"), "wb").write(head + entries + b"".join(pngs))
PY
echo "Brand exports regenerated."
