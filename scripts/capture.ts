// Screenshots for the README and docs, and footage for the demo video, taken from the packaged extension in a real
// VS Code. It builds a scratch dbt-duckdb project from web/sample.ts (the site's example: jaffle_shop's orders model and
// its made-up tables), commits the model's old version and writes the new one. Then it drives VS Code over the Chrome
// DevTools Protocol, the way the site's hero demo plays: open the change from Source Control, preview payments, compare
// order_payments, compare final from the sidebar. Recorder, Hand and the injected cursor come from qdbd's
// videos/capture/record.py.
// Needs ffmpeg, the duckdb CLI and a dbt with dbt-duckdb: CTE_DIFF_DBT, else examples/duckdb's venv (see its README).
// Run: npm run capture   (stills go to docs/assets/img, footage and its marks to out/capture)
import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } from "@vscode/test-electron";
import { chromium, type CDPSession, type Locator, type Page } from "playwright-core";
import { after, before, tables } from "../web/sample.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out", "capture");
const WS = path.join(OUT, "jaffle_shop");
const IMG = path.join(ROOT, "docs", "assets", "img");
const DBT = process.env.CTE_DIFF_DBT ?? path.join(ROOT, "examples", "duckdb", ".venv", "bin", "dbt");
const VSCODE = "1.145.0"; // pinned, so the stills don't change with each VS Code release
const VIEW = { width: 1440, height: 900 };
const CDP_PORT = 9333;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A clean, quiet window: no tips, AI, minimap or hovers; lenses shown in diffs. */
const SETTINGS = {
  "workbench.colorTheme": "Default Light Modern",
  "window.zoomLevel": 0,
  "editor.fontSize": 15,
  "editor.minimap.enabled": false,
  "editor.stickyScroll.enabled": false,
  "editor.smoothScrolling": true,
  "editor.hover.enabled": false,
  "editor.quickSuggestions": { other: false, comments: false, strings: false },
  "editor.suggestOnTriggerCharacters": false,
  "editor.wordBasedSuggestions": "off",
  "editor.lightbulb.enabled": "off",
  "editor.occurrencesHighlight": "off",
  "editor.selectionHighlight": false,
  "editor.guides.indentation": false,
  "breadcrumbs.enabled": false,
  "diffEditor.codeLens": true,
  "diffEditor.hideUnchangedRegions.enabled": false,
  "diffEditor.useInlineViewWhenSpaceIsLimited": false,
  "scm.showActionButton": false,
  "git.openDiffOnClick": true,
  "workbench.startupEditor": "none",
  "workbench.tips.enabled": false,
  "workbench.secondarySideBar.defaultVisibility": "hidden",
  "workbench.layoutControl.enabled": false,
  "window.commandCenter": false,
  "chat.disableAIFeatures": true,
  "security.workspace.trust.enabled": false,
  "update.mode": "none",
  "telemetry.telemetryLevel": "off",
  "extensions.ignoreRecommendations": true,
  "extensions.autoUpdate": false,
  "workbench.enableExperiments": false,
  "window.restoreWindows": "none",
  "files.exclude": { "**/.git": true, ".vscode": true, target: true, logs: true, "*.duckdb*": true },
};

// A cursor and click ripple drawn in the page: the screencast doesn't show the system cursor. DOM calls, not innerHTML:
// VS Code's workbench enforces Trusted Types.
const INJECT = `(() => {
  const s = document.createElement("style");
  s.textContent = \`.qv-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
      transform: translate(-60px, -60px); }
    .qv-ripple { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
      z-index: 2147483646; border: 2px solid #028574; pointer-events: none; animation: qv-ripple .5s ease-out forwards; }
    @keyframes qv-ripple { from { transform: scale(.2); opacity: 1; } to { transform: scale(1.3); opacity: 0; } }\`;
  document.head.appendChild(s);
  const ns = "http://www.w3.org/2000/svg", c = document.createElement("div"), svg = document.createElementNS(ns, "svg");
  const path = document.createElementNS(ns, "path");
  c.className = "qv-cursor";
  for (const [k, v] of [["width", "34"], ["height", "34"], ["viewBox", "0 0 24 24"]]) svg.setAttribute(k, v);
  for (const [k, v] of [["d", "M4 2l15 11-7 1.2 4 7.3-2.8 1.5-4-7.4L4 20z"], ["fill", "#111"], ["stroke", "#fff"],
    ["stroke-width", "1.6"], ["stroke-linejoin", "round"]]) path.setAttribute(k, v);
  svg.appendChild(path);
  c.appendChild(svg);
  document.body.appendChild(c);
  addEventListener("mousemove", (e) => { c.style.transform = \`translate(\${e.clientX - 4}px, \${e.clientY - 2}px)\`; }, true);
  addEventListener("mousedown", (e) => {
    const r = document.createElement("div");
    r.className = "qv-ripple";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }, true);
})()`;

async function until<T>(f: () => T | false | undefined | Promise<T | false | undefined>, what: string, ms = 60000): Promise<T> {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    const v = await f();
    if (v) return v;
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The scratch dbt project: the site's tables as seeds, and models/orders.sql changed since its last commit. */
function fixture(): void {
  fs.rmSync(OUT, { recursive: true, force: true });
  const files: Record<string, string> = {
    "dbt_project.yml": 'name: jaffle_shop\nversion: "1.0.0"\nprofile: jaffle_shop\n',
    "profiles.yml": "jaffle_shop:\n  target: dev\n  outputs:\n    dev:\n      type: duckdb\n      path: jaffle_shop.duckdb\n      threads: 1\n",
    ".gitignore": "target/\nlogs/\n*.duckdb*\n.user.yml\n.vscode/\n",
    ".vscode/settings.json": JSON.stringify({ "cteDiff.dbtPath": DBT }),
    "models/orders.sql": before,
    "models/orders_v2.sql": after, // a rewrite in a new file, for the Compare Files still
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(WS, file)), { recursive: true });
    fs.writeFileSync(path.join(WS, file), text);
  }
  fs.mkdirSync(path.join(WS, "seeds"));
  const seeds = ["stg_customers", "stg_orders", "stg_payments"].map((t) => `copy ${t} to 'seeds/${t}.csv' (header);`);
  execFileSync("duckdb", ["-c", tables + seeds.join("\n")], { cwd: WS });
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=demo", "-c", "user.email=demo@example.com", ...args], { cwd: WS });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-qm", "orders model");
  fs.writeFileSync(path.join(WS, "models", "orders.sql"), after);
  execFileSync(DBT, ["seed"], { cwd: WS, stdio: "inherit" });
}

/** VS Code with the packaged extension installed in a fresh profile, and its workbench page over CDP. */
async function launch(): Promise<{ page: Page; close: () => Promise<void> }> {
  const code = await downloadAndUnzipVSCode(VSCODE);
  const dirs = [`--user-data-dir=${path.join(OUT, "user-data")}`, `--extensions-dir=${path.join(OUT, "extensions")}`];
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(code, { reuseMachineInstall: true });
  execFileSync(cli, [...cliArgs, ...dirs, "--install-extension", path.join(ROOT, `cte-diff-${version}.vsix`)], { stdio: "inherit" });
  fs.mkdirSync(path.join(OUT, "user-data", "User"), { recursive: true });
  fs.writeFileSync(path.join(OUT, "user-data", "User", "settings.json"), JSON.stringify(SETTINGS, null, 1));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // set inside VS Code's terminals
  const args = [WS, "--new-window", ...dirs, "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes"];
  const proc = spawn(code, [...args, `--remote-debugging-port=${CDP_PORT}`, "--force-device-scale-factor=2"], { env, stdio: "ignore" });
  const url = `http://127.0.0.1:${CDP_PORT}`;
  await until(() => fetch(`${url}/json/version`).then((r) => r.ok, () => false), "VS Code's debugging port");
  const browser = await chromium.connectOverCDP(url);
  const page = await until(() => browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("workbench")), "the workbench");
  await page.locator(".part.activitybar").waitFor({ timeout: 60000 });
  // Electron has no Browser.setWindowBounds: emulate the size instead, at 2x (page.setViewportSize would make it 1x).
  // The override lasts as long as this session, which stays open until close().
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setDeviceMetricsOverride", { ...VIEW, deviceScaleFactor: 2, mobile: false });
  await page.evaluate(INJECT);
  await sleep(3000); // git scans the repo; the extension activates
  return {
    page,
    close: async () => {
      await browser.close();
      proc.kill();
    },
  };
}

/** CDP screencast frames with their timestamps, encoded to a constant-30fps MP4, plus `<name>.marks.json`: when things
 * happen, in clip seconds, for the edit to cut on. Frames that arrive while `paused` are dropped, so a still can hide
 * the cursor without the footage flickering: the frame before holds instead. */
class Recorder {
  page: Page;
  name: string;
  dir: string;
  frames: [number, string][] = [];
  marks: Record<string, number> = {};
  paused = false;
  done = false;
  cdp?: CDPSession;

  constructor(page: Page, name: string) {
    this.page = page;
    this.name = name;
    this.dir = path.join(OUT, "frames", name);
  }

  mark(name: string): void {
    this.marks[name] = Date.now() / 1000;
  }

  async start(): Promise<void> {
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    const cdp = (this.cdp = await this.page.context().newCDPSession(this.page));
    cdp.on("Page.screencastFrame", (p) => {
      cdp.send("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {}); // the page can close first
      if (this.done || this.paused) return;
      const file = path.join(this.dir, `${String(this.frames.length).padStart(5, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(p.data, "base64"));
      this.frames.push([p.metadata.timestamp!, file]);
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1, maxWidth: VIEW.width * 2, maxHeight: VIEW.height * 2 });
  }

  async stop(): Promise<void> {
    const end = Date.now() / 1000;
    this.done = true;
    await this.cdp!.send("Page.stopScreencast");
    if (!this.frames.length) throw new Error(`${this.name}: no frames`);
    const lines = this.frames.flatMap(([ts, file], i) => [`file '${path.basename(file)}'`, `duration ${Math.max((this.frames[i + 1]?.[0] ?? end) - ts, 0.001).toFixed(4)}`]);
    lines.push(`file '${path.basename(this.frames.at(-1)![1])}'`); // the concat demuxer drops the last duration otherwise
    fs.writeFileSync(path.join(this.dir, "list.txt"), lines.join("\n") + "\n");
    const t0 = this.frames[0][0];
    const marks = Object.fromEntries(Object.entries(this.marks).map(([k, v]) => [k, Math.round((v - t0) * 100) / 100]));
    fs.writeFileSync(path.join(OUT, `${this.name}.marks.json`), JSON.stringify(marks, null, 1));
    const out = path.join(OUT, `${this.name}.mp4`);
    const encode = ["-r", "30", "-fps_mode", "cfr", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-movflags", "+faststart"];
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", ...encode, out], { cwd: this.dir });
    console.log(`wrote ${path.relative(ROOT, out)} (${this.frames.length} frames, ${(end - t0).toFixed(1)}s)`);
    fs.rmSync(this.dir, { recursive: true });
  }
}

/** A mouse that glides like a person's, so the injected cursor moves smoothly. */
class Hand {
  page: Page;
  x = VIEW.width - 80;
  y = VIEW.height - 60;

  constructor(page: Page) {
    this.page = page;
  }

  async to(x: number, y: number, ms = 650): Promise<void> {
    const n = Math.max(10, Math.floor(ms / 16));
    const [x0, y0] = [this.x, this.y];
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const e = t * t * (3 - 2 * t);
      await this.page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await sleep(ms / n);
    }
    [this.x, this.y] = [x, y];
  }

  async over(el: Locator, ms = 650): Promise<void> {
    const b = (await el.boundingBox())!;
    await this.to(b.x + b.width / 2, b.y + b.height / 2, ms);
  }

  async click(el: Locator, ms = 650): Promise<void> {
    await this.over(el, ms);
    await this.page.mouse.down();
    await sleep(120);
    await this.page.mouse.up();
  }
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const right = (page: Page) => page.locator(".monaco-diff-editor .editor.modified");

/** The diff's right-side line whose whole text is `text` (Monaco renders spaces as no-break spaces; \s matches them). */
const line = (page: Page, text: string) =>
  right(page).locator(".view-line").filter({ hasText: new RegExp(`^\\s*${text.split(/\s+/).map(escape).join("\\s+")}\\s*$`) }).first();

/** Scrolls the diff (both sides move together) until the right side's line `text` sits in the editor's upper half. */
async function scrollTo(page: Page, hand: Hand, text: string): Promise<void> {
  let ed = (await right(page).boundingBox())!;
  await hand.to(ed.x + ed.width * 0.55, ed.y + ed.height * 0.45, 500);
  for (let i = 0; i < 80; i++) {
    ed = (await right(page).boundingBox())!;
    const b = (await line(page, text).count()) ? await line(page, text).boundingBox() : null;
    if (b && b.y > ed.y + 40 && b.y < ed.y + ed.height * 0.5) return;
    await page.mouse.wheel(0, b ? Math.max(-90, Math.min(90, b.y - (ed.y + 90))) : 90);
    await sleep(140);
  }
  throw new Error(`couldn't scroll to ${text}`);
}

/** The CodeLens button `title` on the right side, in the row just above the line `text`. */
async function lens(page: Page, text: string, title: string): Promise<Locator> {
  const at = (await line(page, text).boundingBox())!;
  const buttons = right(page).locator(".codelens-decoration a", { hasText: title });
  let best = -1;
  for (let i = 0, gap = Infinity; i < (await buttons.count()); i++) {
    const b = await buttons.nth(i).boundingBox();
    if (b && b.y < at.y && at.y - b.y < gap) [best, gap] = [i, at.y - b.y];
  }
  if (best < 0) throw new Error(`no ${title} above ${text}`);
  return buttons.nth(best);
}

/** Waits for the results view (a webview: an iframe in an iframe) to show `heading` with dbt's answer. */
async function result(page: Page, heading: string): Promise<void> {
  const probe = `(() => {
    const h = document.querySelector("h2");
    if (h && h.classList.contains("bad")) return "error: " + document.body.innerText;
    return h && h.textContent === ${JSON.stringify(heading)} && document.querySelector(".stats") && !document.querySelector(".progress") ? "ok" : "";
  })()`;
  const state = await until(async () => {
    for (const f of page.frames()) {
      const s = await f.evaluate(probe).catch(() => "");
      if (s) return String(s);
    }
  }, `the results for ${heading}`);
  if (state !== "ok") throw new Error(state);
}

/** A still for the docs, without the cursor: the window (or `clip`, in CSS pixels) at 2x, at most 1600 px wide. */
async function still(page: Page, rec: Recorder | undefined, name: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void> {
  if (rec) rec.paused = true;
  const cursor = (v: string) => page.evaluate(`document.querySelector(".qv-cursor").style.visibility = "${v}"`);
  await cursor("hidden");
  const raw = path.join(OUT, `${name}.png`);
  const cdp = await page.context().newCDPSession(page); // page.screenshot would capture at 1x
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", ...(clip && { clip: { ...clip, scale: 1 } }) });
  fs.writeFileSync(raw, Buffer.from(data, "base64"));
  await cdp.detach();
  await cursor("visible");
  if (rec) rec.paused = false;
  fs.mkdirSync(IMG, { recursive: true });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-vf", "scale='min(1600,iw)':-2:flags=lanczos", path.join(IMG, `${name}.png`)]);
  console.log(`wrote docs/assets/img/${name}.png`);
}

const activity = (page: Page, name: string) => page.locator(`.part.activitybar a[aria-label^="${name}"]`).first();
const pane = (page: Page, title: string) => page.locator(".pane", { has: page.locator(".pane-header", { hasText: title }) });
const box = async (el: Locator) => (await el.boundingBox())!;

/** Across the editor, from `top` (the lens clicked, or the panel) down to the end of the results' table, or to the
 * last whole row the panel shows. */
async function results(page: Page, top: Locator, pad = 8) {
  const [e, p, t] = [await box(page.locator(".part.editor")), await box(page.locator(".part.panel")), await box(top)];
  // The table is in the results webview, an iframe in an iframe: ask each frame.
  const [frame, scroll] = await until(async () => {
    for (const f of page.frames()) {
      const b = await f.locator(".scroll").first().boundingBox({ timeout: 300 }).catch(() => null);
      if (b) return [f, b] as const;
    }
  }, "the results' table");
  // The table scrolls inside its frame: past the frame's end, cut below the last whole row.
  const table = await box(frame.locator("table").first());
  const visible = Math.min(scroll.y + scroll.height, p.y + p.height);
  let bottom = table.y + table.height + 14;
  if (table.y + table.height > visible) {
    bottom = t.y;
    for (const row of await frame.locator("tr").all()) {
      const b = await row.boundingBox();
      if (b && b.y + b.height <= visible) bottom = Math.max(bottom, b.y + b.height + 1);
    }
  }
  const y = t.y - pad;
  return { x: e.x, y, width: e.width, height: bottom - y };
}

/** The activity bar and the sidebar, from the sidebar's top down to `last`. */
async function sidebarTo(page: Page, last: Locator) {
  const [s, l] = [await box(page.locator(".part.sidebar")), await box(last)];
  return { x: 0, y: s.y, width: s.x + s.width, height: l.y + l.height + 10 - s.y };
}

/** Off camera: opens the bottom panel, drags it `by` px taller and closes it. VS Code reopens it at that height. */
async function growPanel(page: Page, by: number): Promise<void> {
  await page.keyboard.press("Meta+J");
  await sleep(800);
  const top = (await box(page.locator(".part.panel"))).y - 2; // the middle of the 4 px sash on the panel's top edge
  await page.mouse.move(VIEW.width * 0.6, top);
  await page.mouse.down();
  await page.mouse.move(VIEW.width * 0.6, top - by, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
  await page.keyboard.press("Meta+J");
}

async function flow(page: Page): Promise<void> {
  const hand = new Hand(page);
  // Off camera: a taller results panel, the CTE Diff sidebar's Compare Files view folded, back to the Explorer.
  await growPanel(page, 120);
  await activity(page, "CTE Diff").click();
  await pane(page, "Compare Files").locator(".pane-header").click();
  await activity(page, "Explorer").click();
  await sleep(800);

  const rec = new Recorder(page, "review");
  await rec.start();
  await sleep(800);
  // The change, from Source Control.
  await hand.click(activity(page, "Source Control"));
  rec.mark("scm");
  const change = page.locator(".scm-view .monaco-list-row", { hasText: "orders.sql" }).first();
  await change.waitFor();
  await sleep(700);
  await hand.click(change);
  rec.mark("diff");
  await right(page).locator(".codelens-decoration").first().waitFor();
  await sleep(1200);
  // The sidebar marks every CTE of both sides.
  await hand.click(activity(page, "CTE Diff"));
  rec.mark("sidebar");
  await sleep(2500);
  await still(page, rec, "diff");
  await still(page, rec, "sidebar", await sidebarTo(page, pane(page, "CTEs").locator(".monaco-list-row").last()));
  // Preview payments: its new where clause drops rows.
  await scrollTo(page, hand, "payments as (");
  await sleep(400);
  const preview = await lens(page, "payments as (", "▶ Preview");
  await hand.click(preview);
  rec.mark("preview");
  await result(page, "payments (orders.sql)");
  rec.mark("preview-rows");
  await sleep(2500);
  await still(page, rec, "preview", await results(page, preview));
  // Compare order_payments: its SQL didn't change, but it reads payments, so its rows did.
  await scrollTo(page, hand, "order_payments as (");
  await sleep(400);
  const compare = await lens(page, "order_payments as (", "⇄ Compare sides");
  await hand.click(compare);
  rec.mark("compare");
  await result(page, "order_payments");
  rec.mark("compare-rows");
  await sleep(3000);
  await still(page, rec, "compare", await results(page, compare));
  // Compare final from the sidebar: a column added, one dropped.
  const final = pane(page, "CTEs").locator(".monaco-list-row", { hasText: /^final/ }).first();
  await hand.over(final.locator(".label-name"));
  rec.mark("final-hover");
  await sleep(700);
  await hand.click(final.locator('.action-label[aria-label^="Compare Both Sides"]'), 400);
  rec.mark("final");
  await result(page, "final");
  rec.mark("final-rows");
  await sleep(3000);
  await still(page, rec, "compare-final", await results(page, page.locator(".part.panel"), 0));
  await rec.stop();

  // Compare Files: orders.sql as Old, orders_v2.sql (a rewrite in a new file) as New. File rows come after the slots.
  await pane(page, "Compare Files").locator(".pane-header").click();
  const files = pane(page, "Compare Files");
  const file = (name: string) => files.locator(".monaco-list-row", { hasText: name }).last();
  const models = files.locator(".monaco-list-row", { hasText: "models" }).first();
  await models.waitFor();
  if (!(await file("orders_v2.sql").count())) await models.click();
  await file("orders_v2.sql").waitFor();
  for (const [name, action] of [["orders.sql", "Use as Old"], ["orders_v2.sql", "Use as New"]]) {
    await hand.over(file(name));
    await hand.click(file(name).locator(`.action-label[aria-label^="${action}"]`), 300);
    await sleep(500);
  }
  await hand.to(VIEW.width - 80, VIEW.height - 60, 300);
  await still(page, undefined, "compare-files", await sidebarTo(page, files.locator(".monaco-list-row").last()));
}

/** The README's GIF, cut from the footage at its marks: the change opens with the sidebar's marks, then a CTE whose SQL
 * didn't change is compared. 10 fps and 128 colours keep it near 1 MB (a palette per clip, as qdbd's demo.gif). */
function gif(): void {
  const m = JSON.parse(fs.readFileSync(path.join(OUT, "review.marks.json"), "utf8"));
  const cuts = [
    [m.diff - 0.4, m.sidebar + 2.4],
    [m.compare - 1.8, m["compare-rows"] + 3],
  ];
  const trims = cuts.map(([a, b], i) => `[0:v]trim=${a.toFixed(2)}:${b.toFixed(2)},setpts=PTS-STARTPTS[c${i}]`).join(";");
  const palette = "fps=10,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle";
  const filter = `${trims};${cuts.map((_, i) => `[c${i}]`).join("")}concat=n=${cuts.length},${palette}`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(OUT, "review.mp4"), "-filter_complex", filter, path.join(IMG, "demo.gif")]);
  console.log(`wrote docs/assets/img/demo.gif (${Math.round(fs.statSync(path.join(IMG, "demo.gif")).size / 1024)} KB)`);
}

// `node scripts/capture.ts gif` only remakes the GIF from the last footage.
if (process.argv[2] !== "gif") {
  fixture();
  const { page, close } = await launch();
  try {
    await flow(page);
  } finally {
    await close();
  }
}
gif();
