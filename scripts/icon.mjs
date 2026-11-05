// Draws every cte-diff icon from one geometry: a CTE's parentheses, as ( ... ), around three code lines (one kept,
// one removed, one added). Writes the SVGs, then renders the PNGs with headless Chrome (set CHROME to its path if it
// isn't in the usual place). Run: node scripts/icon.mjs
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// The site's palette (docs/stylesheets/extra.css): ink parentheses, so the removed red and added teal carry the colour.
const INK = "#19211e";
const RED = "#d23415";
const TEAL = "#028574";

// On a 24-unit grid, like qdbd's icon. `small` is the cut for 16-32px: thicker parentheses, taller lines, wider gaps.
const GEOMETRY = {
  full: { parens: "M6.6 3Q2.4 12 6.6 21M17.4 3Q21.6 12 17.4 21", stroke: 2.4, x: 8.2, h: 2.8, gap: 1.6, rx: 1.1, widths: [7.6, 5.2, 6.6] },
  small: { parens: "M6.4 2.4Q1.6 12 6.4 21.6M17.6 2.4Q22.4 12 17.6 21.6", stroke: 2.8, x: 8.3, h: 3.4, gap: 1.8, rx: 1.3, widths: [7.4, 4.8, 6.2] },
};

/** The mark's elements. `colors`: [parentheses, kept line, removed line, added line], plus the kept line's opacity. */
function mark(g, [paren, kept, removed, added], keptOpacity = 0.22) {
  const top = 12 - (3 * g.h + 2 * g.gap) / 2;
  const fills = [kept, removed, added];
  const lines = g.widths.map((w, i) => {
    const opacity = i === 0 ? ` fill-opacity="${keptOpacity}"` : "";
    return `<rect x="${g.x}" y="${+(top + i * (g.h + g.gap)).toFixed(2)}" width="${w}" height="${g.h}" rx="${g.rx}" fill="${fills[i]}"${opacity}/>`;
  });
  return `<path d="${g.parens}" fill="none" stroke="${paren}" stroke-width="${g.stroke}" stroke-linecap="round"/>${lines.join("")}`;
}

const svg = (body, size = 24) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${body}</svg>\n`;
// A solid ink tile, for the Marketplace, the publisher logo and the favicon: one flat colour, no edge, like qdbd's
// icon, so it holds on light and dark pages. The mark sits at 78%, in white with brightened red and teal.
const tile = (body) => `<rect width="24" height="24" rx="5.4" fill="${INK}"/><g transform="translate(2.64 2.64) scale(.78)">${body}</g>`;

const colour = [INK, INK, RED, TEAL];
const onInk = ["#ffffff", "#ffffff", "#ff7a5c", "#3fd1b4"];
const files = {
  "media/logo/cte-diff.svg": svg(mark(GEOMETRY.full, colour), 256),
  "media/logo/cte-diff-small.svg": svg(mark(GEOMETRY.small, colour), 32),
  "media/logo/cte-diff-mono.svg": svg(mark(GEOMETRY.full, Array(4).fill(INK), 0.4), 256),
  "media/icon.svg": svg(tile(mark(GEOMETRY.full, onInk, 0.4)), 256),
  // The Activity Bar draws its icon in one colour from the SVG's shapes, so it gets currentColor and the small cut.
  "media/activity.svg": svg(mark(GEOMETRY.small, Array(4).fill("currentColor"), 0.45)),
  "docs/assets/img/icon.svg": svg(mark(GEOMETRY.small, colour), 32),
  "docs/assets/img/favicon.svg": svg(tile(mark(GEOMETRY.small, onInk, 0.4)), 64),
  "overrides/partials/icon.html": svg(mark(GEOMETRY.small, colour)).replace("<svg ", '<svg aria-hidden="true" '),
};
for (const [file, text] of Object.entries(files)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const chrome =
  process.env.CHROME ??
  ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
if (!chrome) throw new Error("Chrome not found: set CHROME to render the PNGs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cte-diff-icon-"));
for (const [svgFile, png, size] of [
  ["media/icon.svg", "media/icon.png", 256],
  ["media/icon.svg", "media/logo/publisher-128.png", 128],
  ["docs/assets/img/favicon.svg", "docs/assets/img/icon.png", 64],
]) {
  const page = path.join(tmp, "page.html");
  const src = `data:image/svg+xml;base64,${fs.readFileSync(svgFile).toString("base64")}`;
  fs.writeFileSync(page, `<html><body style="margin:0"><img src="${src}" width="${size}" height="${size}" style="display:block"></body></html>`);
  execFileSync(chrome, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--default-background-color=00000000",
    `--window-size=${size},${size}`,
    `--screenshot=${path.resolve(png)}`,
    `file://${page}`,
  ], { stdio: "ignore" });
}
fs.rmSync(tmp, { recursive: true });
console.log(Object.keys(files).concat("media/icon.png", "media/logo/publisher-128.png", "docs/assets/img/icon.png").join("\n"));
