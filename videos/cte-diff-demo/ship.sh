#!/bin/sh
# The web copy of the demo, and the poster the README links to. Run from anywhere; needs the delivery render,
# ffmpeg, and playwright-core installed at the repo root (npm install).
set -eu
cd "$(dirname "$0")"
root=$(cd ../.. && pwd)
out="$root/docs/assets/video/cte-diff-demo.mp4"
poster="$root/docs/assets/img/demo-poster.jpg"
mkdir -p "$(dirname "$out")" "$(dirname "$poster")"

ffmpeg -y -loglevel error -i renders/cte-diff-demo.mp4 -an -c:v libx264 -preset veryslow -crf 25 \
  -tune stillimage -pix_fmt yuv420p -profile:v high -movflags +faststart "$out"
bytes=$(wc -c < "$out" | tr -d ' ')
if [ "$bytes" -gt 6291456 ]; then
  echo "web mp4 is $bytes bytes, over 6 MB" >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# 8.6s: the 12-row HEAD preview, title up, camera on the table. That is the shot the other extension cannot make.
ffmpeg -y -loglevel error -ss 8.6 -i renders/cte-diff-demo.mp4 -frames:v 1 "$work/frame.png"
cat > "$work/poster.html" << EOF
<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: "Geist"; src: url("file://$root/videos/cte-diff-demo/assets/fonts/Geist.woff2") format("woff2"); font-weight: 600; }
  html, body { margin: 0; width: 1920px; height: 1080px; background: #f7f9f8; }
  img { width: 1920px; height: 1080px; display: block; }
  .btn { position: absolute; right: 72px; bottom: 64px; background: #19211e; color: #f7f9f8;
    font: 600 36px/1 "Geist", sans-serif; letter-spacing: -0.02em; padding: 22px 32px; border-radius: 14px; }
  .btn b { color: #8fd9cc; font-weight: 600; }
</style>
<body>
  <img src="frame.png" alt="">
  <div class="btn">Watch the <b>28-second</b> demo</div>
</body>
EOF

NODE_PATH="$root/node_modules" node << EOF
const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto("file://$work/poster.html");
  await page.screenshot({ path: "$work/poster.png" });
  await browser.close();
})();
EOF
ffmpeg -y -loglevel error -i "$work/poster.png" -q:v 3 "$poster"
echo "web mp4 $bytes bytes"
echo "poster $poster"
"$(dirname "$0")/gifs.sh" "$out"
