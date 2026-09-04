#!/usr/bin/env bash
# Local iOS audioBitrate smoke (no EAS). Metadata-only evidence; deletes media.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EVID="${NIX_OPS_EVID:-$HOME/.nix-ops/p0-3-c3b-audit-fixes}"
mkdir -p "$EVID"
SHORT="$(git -C "$ROOT" rev-parse --short HEAD)"
FULL="$(git -C "$ROOT" rev-parse HEAD)"
TMP="$(mktemp -d /tmp/nix-audio-bitrate.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

IN="$TMP/synth-in.mp4"
OUT="$TMP/synth-out.mp4"
META="$EVID/ffprobe-meta-audioBitrate-${SHORT}.json"
REPORT="$EVID/IOS-AUDIO-BITRATE-${SHORT}.md"

echo "== generate synthetic clip (AAC 256k) =="
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "testsrc=size=1280x720:rate=30" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100" \
  -t 8 -c:v libx264 -pix_fmt yuv420p -b:v 2M \
  -c:a aac -b:a 256k -ac 2 \
  "$IN"

echo "== smoke re-encode with AVEncoderBitRateKey=96000 (patch mirror) =="
swift "$ROOT/scripts/ios-audio-bitrate-smoke.swift" "$IN" "$OUT" 96000

echo "== ffprobe input/output audio =="
probe() {
  local file="$1"
  ffprobe -v error -select_streams a:0 \
    -show_entries stream=codec_name,bit_rate,sample_rate,channels,duration \
    -of json "$file"
}

IN_JSON="$(probe "$IN")"
OUT_JSON="$(probe "$OUT")"
OUT_BR="$(printf '%s' "$OUT_JSON" | python3 -c 'import json,sys; s=json.load(sys.stdin)["streams"][0]; print(int(s.get("bit_rate") or 0))')"

# AAC often lands near target; accept 72k–120k around 96k.
if [[ "$OUT_BR" -lt 72000 || "$OUT_BR" -gt 120000 ]]; then
  echo "FAIL: output audio bit_rate=${OUT_BR} not near 96000" >&2
  exit 1
fi

python3 - "$META" "$FULL" "$SHORT" "$IN_JSON" "$OUT_JSON" "$OUT_BR" <<'PY'
import json, sys
path, full, short, in_json, out_json, out_br = sys.argv[1:7]
doc = {
  "git_sha": full,
  "short": short,
  "target_audio_bitrate": 96000,
  "measured_output_audio_bitrate": int(out_br),
  "tolerance_hz": [72000, 120000],
  "input_audio": json.loads(in_json)["streams"][0],
  "output_audio": json.loads(out_json)["streams"][0],
  "note": "Media files deleted; metadata only. Smoke mirrors patched VideoMain AVEncoderBitRateKey.",
}
with open(path, "w", encoding="utf-8") as f:
  json.dump(doc, f, indent=2)
  f.write("\n")
print(path)
PY

{
  echo "# iOS audioBitrate verification — ${SHORT}"
  echo ""
  echo "- git_sha: \`${FULL}\`"
  echo "- eas: **not used**"
  echo "- synthetic_clip: 3s 1280x720 + AAC 256k (temp, deleted)"
  echo "- smoke: \`scripts/ios-audio-bitrate-smoke.swift\` with audioBitRate=96000 (same keys as patched VideoMain.swift)"
  echo "- measured_output_audio_bitrate: **${OUT_BR}** (accept 72k–120k)"
  echo "- metadata: \`ffprobe-meta-audioBitrate-${SHORT}.json\`"
  echo "- medium: **deleted**"
} > "$REPORT"

echo "PASS bit_rate=${OUT_BR} report=$REPORT"
