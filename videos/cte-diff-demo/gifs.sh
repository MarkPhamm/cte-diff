#!/bin/sh
# The README's opening GIF: three beats of the demo film. 10 fps and 128 colours, near 1 MB.
# The Use it loops (demo-diff, demo-marks, demo-preview, demo-compare, demo-final) are the previous
# film. This script does not recut them. The Power User stills are not in the GIF.
set -eu
cd "$(dirname "$0")"
root=$(cd ../.. && pwd)
src="${1:-$root/docs/assets/video/cte-diff-demo.mp4}"
out="$root/docs/assets/img/demo.gif"

ffmpeg -y -loglevel error -i "$src" -filter_complex "\
[0:v]trim=8.4:9.1,setpts=PTS-STARTPTS[a];\
[0:v]trim=13.1:13.7,setpts=PTS-STARTPTS[b];\
[0:v]trim=20.9:21.8,setpts=PTS-STARTPTS[c];\
[a][b][c]concat=n=3:v=1:a=0,fps=10,scale=880:-1:flags=lanczos,split[s][p];\
[p]palettegen=max_colors=128:stats_mode=diff[pal];\
[s][pal]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$out"
echo "demo.gif $(wc -c < "$out" | tr -d ' ') bytes"
