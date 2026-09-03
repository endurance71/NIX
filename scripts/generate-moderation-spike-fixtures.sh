#!/usr/bin/env bash
# Generate controlled synthetic fixtures under ~/.nix-ops/p0-3-fixtures (never Git).
# Safe JPEG/MP4 are solid-color. High-risk clips require SPIKE_JPEG_REJECT path.
set -euo pipefail

FIX="${HOME}/.nix-ops/p0-3-fixtures"
mkdir -p "$FIX/safe" "$FIX/reject" "$FIX/highrisk"
chmod 700 "${HOME}/.nix-ops" "$FIX" 2>/dev/null || true

echo "Generating safe fixtures in $FIX"

# Safe JPEG (~640x360)
ffmpeg -y -f lavfi -i "color=c=#4a90d9:s=640x360:d=1" -frames:v 1 "$FIX/safe/safe.jpg" >/dev/null 2>&1

# Bucket-safe durations: 14.9 / 59.9 / 179.9 → uniform 12/24/60
ffmpeg -y -f lavfi -i "color=c=#2f2f2f:s=640x360:d=14.9" -pix_fmt yuv420p -c:v libx264 -tune stillimage -crf 28 "$FIX/safe/safe-14p9.mp4" >/dev/null 2>&1
ffmpeg -y -f lavfi -i "color=c=#2f2f2f:s=640x360:d=59.9" -pix_fmt yuv420p -c:v libx264 -tune stillimage -crf 28 "$FIX/safe/safe-59p9.mp4" >/dev/null 2>&1
ffmpeg -y -f lavfi -i "color=c=#2f2f2f:s=640x360:d=179.9" -pix_fmt yuv420p -c:v libx264 -tune stillimage -crf 28 "$FIX/safe/safe-179p9.mp4" >/dev/null 2>&1

REJECT_JPEG="${SPIKE_JPEG_REJECT:-$FIX/reject/reject.jpg}"
if [[ -f "$REJECT_JPEG" ]]; then
  echo "Building high-risk overlay clips from reject JPEG"
  # Still frame from reject JPEG (1s), then concat with safe gray for target durations.
  ffmpeg -y -loop 1 -i "$REJECT_JPEG" -t 1 -pix_fmt yuv420p -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2" -c:v libx264 -tune stillimage "$FIX/reject/reject-1s.mp4" >/dev/null 2>&1

  build_hr() {
    local dur="$1"
    local place="$2" # start|mid|end|scene
    local out="$FIX/highrisk/hr-${dur/./p}-${place}.mp4"
    local pad
    pad="$(python3 - <<PY
dur=float("$dur"); place="$place"
risk=1.0
rest=max(0.0, dur-risk)
if place=="start":
  print(f"0 {rest}")
elif place=="end":
  print(f"{rest} 0")
elif place=="scene":
  a=min(rest, dur*0.37); b=rest-a; print(f"{a} {b}")
else:
  a=rest/2; b=rest-a; print(f"{a} {b}")
PY
)"
    local before="${pad%% *}"
    local after="${pad##* }"
    local list="$FIX/highrisk/_concat-${dur}-${place}.txt"
    : > "$list"
    if awk "BEGIN{exit !($before>0.05)}"; then
      ffmpeg -y -f lavfi -i "color=c=#2f2f2f:s=640x360:d=${before}" -pix_fmt yuv420p -c:v libx264 -tune stillimage "$FIX/highrisk/_before.mp4" >/dev/null 2>&1
      echo "file '$FIX/highrisk/_before.mp4'" >> "$list"
    fi
    echo "file '$FIX/reject/reject-1s.mp4'" >> "$list"
    if awk "BEGIN{exit !($after>0.05)}"; then
      ffmpeg -y -f lavfi -i "color=c=#2f2f2f:s=640x360:d=${after}" -pix_fmt yuv420p -c:v libx264 -tune stillimage "$FIX/highrisk/_after.mp4" >/dev/null 2>&1
      echo "file '$FIX/highrisk/_after.mp4'" >> "$list"
    fi
    ffmpeg -y -f concat -safe 0 -i "$list" -c copy "$out" >/dev/null 2>&1
    echo "  wrote $out"
  }

  for dur in 14.9 59.9 179.9; do
    for place in start mid end scene; do
      build_hr "$dur" "$place"
    done
  done
else
  echo "SPIKE_JPEG_REJECT not found at $REJECT_JPEG — skipped high-risk video generation."
  echo "Provide a pre-validated reject JPEG (outside Git), then re-run this script."
fi

echo "Durations:"
for f in "$FIX/safe"/*.mp4; do
  printf '  %s ' "$(basename "$f")"
  ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f"
done

echo "Done. Media stay in $FIX — never copy into ~/.nix-ops/p0-3-spike/."
