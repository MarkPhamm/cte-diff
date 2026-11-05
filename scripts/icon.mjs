// Draws media/icon.png (128x128): two result grids side by side, one row changed. Run: node scripts/icon.mjs
import * as fs from "node:fs";
import * as zlib from "node:zlib";

const S = 128;
const px = Buffer.alloc(S * S * 4); // RGBA, transparent

function rect(x0, y0, w, h, [r, g, b], radius = 0) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + radius - x - 0.5, x + 0.5 - (x0 + w - radius), 0);
      const dy = Math.max(y0 + radius - y - 0.5, y + 0.5 - (y0 + h - radius), 0);
      const a = Math.min(1, Math.max(0, radius + 0.5 - Math.hypot(dx, dy))); // anti-aliased corner
      if (a <= 0) continue;
      const i = (y * S + x) * 4;
      const under = px[i + 3] / 255;
      const out = a + under * (1 - a);
      px[i] = (r * a + px[i] * under * (1 - a)) / out;
      px[i + 1] = (g * a + px[i + 1] * under * (1 - a)) / out;
      px[i + 2] = (b * a + px[i + 2] * under * (1 - a)) / out;
      px[i + 3] = out * 255;
    }
  }
}

const bg = [24, 33, 52];
const pane = [39, 52, 79];
const row = [96, 118, 160];
const red = [232, 92, 92];
const green = [64, 196, 140];
rect(0, 0, S, S, bg, 24);
for (const [x, changed] of [[14, red], [68, green]]) {
  rect(x, 18, 46, 92, pane, 8);
  rect(x + 6, 26, 34, 8, [150, 170, 210], 3); // header
  for (let k = 0; k < 5; k++) rect(x + 6, 42 + k * 13, 34, 7, k === 2 ? changed : row, 3);
}

const crc = (buf) => {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
const raw = Buffer.concat(Array.from({ length: S }, (_, y) => Buffer.concat([Buffer.from([0]), px.subarray(y * S * 4, (y + 1) * S * 4)])));
fs.mkdirSync("media", { recursive: true });
fs.writeFileSync(
  "media/icon.png",
  Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]),
);
