#!/bin/sh
# One short loop per step of the demo, for the README and the docs. Cut from the web mp4
# (ship.sh writes it, then runs this). 8 fps and 80 colours, so the five loops stay small enough for the README.
# Compare Files is not in the film, so that shot stays a still.
set -eu
cd "$(dirname "$0")"
root=$(cd ../.. && pwd)
src="${1:-$root/docs/assets/video/cte-diff-demo.mp4}"
out="$root/docs/assets/img"
mkdir -p "$out"

# name, start in the film, length. Each ends on the result, just before the next scene's title.
cut() {
  name=$1
  start=$2
  dur=$3
  dest="$out/$name.gif"
  ffmpeg -y -loglevel error -ss "$start" -t "$dur" -i "$src" \
    -filter_complex "fps=8,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=80:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
    -loop 0 "$dest"
  echo "$name.gif $(wc -c < "$dest" | tr -d ' ') bytes"
}

cut demo-diff    2.20 3.90
cut demo-marks   6.40 4.40
cut demo-preview 12.40 4.60
cut demo-compare 18.60 5.80
cut demo-final   26.20 5.80
