#!/bin/sh
# The README's and docs' GIFs. 10 fps, 800 px, 256 colours, no dithering, so UI text stays sharp.
# demo.gif is cut from this film (the web mp4 ship.sh writes): Preview on HEAD, Preview on the working tree,
# then Compare sides on the two files. The section loops (demo-diff, demo-marks, demo-preview, demo-compare,
# demo-final) show features this film does not, so they come from the previous 38-second film, read from git.
set -eu
cd "$(dirname "$0")"
root=$(cd ../.. && pwd)
src="${1:-$root/docs/assets/video/cte-diff-demo.mp4}"
out="$root/docs/assets/img"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
old="$work/old.mp4"
git -C "$root" show 60f0755:docs/assets/video/cte-diff-demo.mp4 > "$old"

LOOK="fps=10,scale=800:-1:flags=lanczos,split[s][p];[p]palettegen=max_colors=256:stats_mode=diff[pal];[s][pal]paletteuse=dither=none:diff_mode=rectangle"

# name, source, then start:end pairs in that film's seconds, joined with hard cuts.
gif() {
  name=$1
  from=$2
  shift 2
  graph=""
  ins=""
  n=0
  for span in "$@"; do
    graph="$graph[0:v]trim=${span%%:*}:${span##*:},setpts=PTS-STARTPTS[c$n];"
    ins="$ins[c$n]"
    n=$((n + 1))
  done
  ffmpeg -y -loglevel error -i "$from" -filter_complex "$graph${ins}concat=n=$n:v=1:a=0,$LOOK" -loop 0 "$out/$name.gif"
  echo "$name.gif $(wc -c < "$out/$name.gif" | tr -d ' ') bytes"
}

# Each span starts once its title has landed and ends before the camera leaves for the next scene.
gif demo "$src" 6.3:9.2 10.0:13.95 18.0:22.6
gif demo-diff "$old" 2.4:5.85
gif demo-marks "$old" 6.85:11.1
gif demo-preview "$old" 12.3:16.6
gif demo-compare "$old" 18.3:24.35
gif demo-final "$old" 25.6:31.95
