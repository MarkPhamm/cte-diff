// Footage for the demo video, and the Compare Files still, taken from the packaged extension in a real VS Code.
// It builds a scratch dbt-duckdb project from web/sample.ts (the site's example: jaffle_shop's orders model and its
// made-up tables). orders.sql is committed as the old query, then rewritten, so a git diff has HEAD on the left and
// the working tree on the right. orders_v1.sql stays the old query; orders_v2.sql is the new query.
// Two clips: git.mp4 previews payments on the left, then the right; files.mp4 opens those two files and compares
// payments. The README GIF is cut from the finished film, not here.
// `node scripts/capture.ts stills` is the other shoot: dbt Power User, CTE Diff not installed. It writes
// videos/cte-diff-demo/assets/stills, and stops if Execute CTE is on the left editor.
// Needs ffmpeg, the duckdb CLI and a dbt with dbt-duckdb: CTE_DIFF_DBT, else examples/duckdb's venv (see its README).
// Run: npm run capture   (the Compare Files still goes to docs/assets/img; footage and its marks to out/capture)
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
const FOOT = path.join(ROOT, "videos", "cte-diff-demo", "assets", "footage");
const STILLS = path.join(ROOT, "videos", "cte-diff-demo", "assets", "stills");
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

/** The scratch dbt project under `ws`. orders.sql is committed as the old query, then rewritten. orders_v1.sql stays
 * the old query. orders_v2.sql is the new query. */
function fixture(ws: string): void {
  fs.rmSync(ws, { recursive: true, force: true });
  const files: Record<string, string> = {
    "dbt_project.yml": 'name: jaffle_shop\nversion: "1.0.0"\nprofile: jaffle_shop\n',
    "profiles.yml": "jaffle_shop:\n  target: dev\n  outputs:\n    dev:\n      type: duckdb\n      path: jaffle_shop.duckdb\n      threads: 1\n",
    ".gitignore": "target/\nlogs/\n*.duckdb*\n.user.yml\n.vscode/\n",
    ".vscode/settings.json": JSON.stringify({ "cteDiff.dbtPath": DBT }),
    "models/orders.sql": before,
    "models/orders_v1.sql": before, // the old query, never rewritten, for the file comparison
    "models/orders_v2.sql": after,
  };
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(ws, file)), { recursive: true });
    fs.writeFileSync(path.join(ws, file), text);
  }
  fs.mkdirSync(path.join(ws, "seeds"));
  const seeds = ["stg_customers", "stg_orders", "stg_payments"].map((t) => `copy ${t} to 'seeds/${t}.csv' (header);`);
  execFileSync("duckdb", ["-c", tables + seeds.join("\n")], { cwd: ws });
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=demo", "-c", "user.email=demo@example.com", ...args], { cwd: ws });
  git("init", "-q", "-b", "main");
  git("add", ".");
  git("commit", "-qm", "orders model");
  fs.writeFileSync(path.join(ws, "models", "orders.sql"), after);
  execFileSync(DBT, ["seed"], { cwd: ws, stdio: "inherit" });
}

/** VS Code in a fresh profile, and its workbench page over CDP. `extension` is a vsix path or a marketplace id. */
async function launch(home: string, ws: string, extension: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const code = await downloadAndUnzipVSCode(VSCODE);
  const dirs = [`--user-data-dir=${path.join(home, "user-data")}`, `--extensions-dir=${path.join(home, "extensions")}`];
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(code, { reuseMachineInstall: true });
  execFileSync(cli, [...cliArgs, ...dirs, "--install-extension", extension, "--force"], { stdio: "inherit" });
  fs.mkdirSync(path.join(home, "user-data", "User"), { recursive: true });
  fs.writeFileSync(path.join(home, "user-data", "User", "settings.json"), JSON.stringify(SETTINGS, null, 1));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // set inside VS Code's terminals
  env.PATH = `${path.dirname(DBT)}${path.delimiter}${env.PATH ?? ""}`;
  const args = [ws, "--new-window", ...dirs, "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes"];
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
const sideEditor = (page: Page, side: "left" | "right") =>
  page.locator(`.monaco-diff-editor .editor.${side === "left" ? "original" : "modified"}`);
const right = (page: Page) => sideEditor(page, "right");

/** The diff side's line whose whole text is `text` (Monaco renders spaces as no-break spaces; \s matches them). */
const lineOn = (page: Page, side: "left" | "right", text: string) =>
  sideEditor(page, side).locator(".view-line").filter({ hasText: new RegExp(`^\\s*${text.split(/\s+/).map(escape).join("\\s+")}\\s*$`) }).first();
const line = (page: Page, text: string) => lineOn(page, "right", text);

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

/** The CodeLens button `title` on one side, in the row just above the line `text`. */
async function lensOn(page: Page, side: "left" | "right", text: string, title: string): Promise<Locator> {
  const at = await lineOn(page, side, text).boundingBox();
  if (!at) throw new Error(`no line ${text} on the ${side}`);
  const buttons = sideEditor(page, side).locator(".codelens-decoration a", { hasText: title });
  let best = -1;
  for (let i = 0, gap = Infinity; i < (await buttons.count()); i++) {
    const b = await buttons.nth(i).boundingBox();
    if (b && b.y < at.y && at.y - b.y < gap) [best, gap] = [i, at.y - b.y];
  }
  if (best < 0) throw new Error(`no ${title} above ${text} on the ${side}`);
  return buttons.nth(best);
}

/** Waits for the results view (a webview: an iframe in an iframe) to show `heading`. When `stat` is set, the badges
 * must include it, so a second run of the same CTE is not mistaken for the first. */
async function result(page: Page, heading: string, stat?: string): Promise<void> {
  const probe = `(() => {
    const h = document.querySelector("h2");
    if (h && h.classList.contains("bad")) return "error: " + document.body.innerText.slice(0, 800);
    const stats = document.querySelector(".stats");
    if (!h || h.textContent !== ${JSON.stringify(heading)} || !stats || document.querySelector(".progress")) return "";
    if (${JSON.stringify(stat ?? "")} && !stats.textContent.includes(${JSON.stringify(stat ?? "")})) return "";
    return "ok";
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

/** Opens or closes the primary sidebar. A click on an activity-bar icon opens it on that view. */
async function setSidebar(page: Page, open: boolean): Promise<void> {
  const b = await page.locator(".part.sidebar").boundingBox();
  const isOpen = !!b && b.width > 20;
  if (isOpen !== open) {
    await page.keyboard.press("Meta+B");
    await sleep(500);
  }
}

/** Opens the git diff of orders.sql from Source Control. The sidebar stays open on Source Control. */
async function openGitDiff(page: Page, hand: Hand): Promise<void> {
  await setSidebar(page, true);
  await hand.click(activity(page, "Source Control"));
  const change = page.locator(".scm-view .monaco-list-row", { hasText: "orders.sql" }).first();
  await change.waitFor();
  await sleep(400);
  await hand.click(change);
  await right(page).waitFor({ timeout: 30000 });
  await sleep(800);
}

/** The results badges, for the capture log. */
async function statsText(page: Page): Promise<string> {
  for (const f of page.frames()) {
    const s = await f.evaluate(`document.querySelector(".stats")?.textContent || ""`).catch(() => "");
    if (s) return String(s);
  }
  return "";
}

/** A full-window PNG at the screencast's 2x, cursor hidden. */
async function fullShot(page: Page, dest: string): Promise<void> {
  await page.evaluate(`document.querySelector(".qv-cursor").style.visibility = "hidden"`);
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
  await cdp.detach();
  await page.evaluate(`document.querySelector(".qv-cursor").style.visibility = "visible"`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(data, "base64"));
}

async function flow(page: Page): Promise<void> {
  const hand = new Hand(page);
  // Off camera: a taller results panel, then the git diff, sidebar closed, payments in view.
  await growPanel(page, 160);
  await openGitDiff(page, hand);
  await setSidebar(page, false);
  await scrollTo(page, hand, "payments as (");
  await lensOn(page, "left", "payments as (", "▶ Preview");
  await sleep(400);

  const git = new Recorder(page, "git");
  await git.start();
  await sleep(600);
  git.mark("where");
  const where = line(page, "where status = 'success'");
  if (await where.count()) await hand.over(where, 500);
  await sleep(900);
  await hand.click(await lensOn(page, "left", "payments as (", "▶ Preview"));
  git.mark("preview-left");
  await result(page, "payments (orders.sql)", "12 rows");
  git.mark("rows-left");
  console.log("left", await statsText(page));
  await sleep(5200);
  await hand.click(await lensOn(page, "right", "payments as (", "▶ Preview"));
  git.mark("preview-right");
  await result(page, "payments (orders.sql)", "9 rows");
  git.mark("rows-right");
  console.log("right", await statsText(page));
  await sleep(5200);
  await git.stop();

  // Off camera: close the results, then fill the slots. The clip starts there.
  await page.keyboard.press("Meta+J");
  await sleep(400);
  await setSidebar(page, true);
  await hand.click(activity(page, "CTE Diff"));
  await sleep(700);
  await pane(page, "CTEs").locator(".pane-header").click();
  await sleep(300);
  const files = pane(page, "Compare Files");
  const file = (name: string) => files.locator(".monaco-list-row", { hasText: name }).last();
  const models = files.locator(".monaco-list-row", { hasText: "models" }).first();
  await models.waitFor();
  if (!(await file("orders_v1.sql").count())) await hand.click(models, 300);
  await file("orders_v2.sql").waitFor();
  for (const [name, action] of [
    ["orders_v1.sql", "Use as Old"],
    ["orders_v2.sql", "Use as New"],
  ] as const) {
    await hand.over(file(name));
    await hand.click(file(name).locator(`.action-label[aria-label^="${action}"]`), 300);
    await sleep(400);
  }
  const twistie = models.locator(".monaco-tl-twistie");
  if (await twistie.count()) await hand.click(twistie, 250);
  await sleep(300);
  const openRow = files.locator(".monaco-list-row", { hasText: "Open the diff" });
  await openRow.waitFor();
  await openRow.scrollIntoViewIfNeeded();
  await hand.to(VIEW.width - 80, VIEW.height - 60, 300);
  await still(page, undefined, "compare-files", await sidebarTo(page, openRow));

  const filesRec = new Recorder(page, "files");
  await filesRec.start();
  await sleep(1600);
  filesRec.mark("slots");
  await hand.click(openRow);
  filesRec.mark("open");
  await right(page).locator(".codelens-decoration").first().waitFor();
  filesRec.mark("diff");
  await sleep(600);
  await scrollTo(page, hand, "payments as (");
  await sleep(500);
  filesRec.mark("where");
  await hand.click(await lensOn(page, "right", "payments as (", "⇄ Compare sides"));
  filesRec.mark("compare");
  await result(page, "payments", "Only left 3");
  filesRec.mark("rows");
  console.log("compare", await statsText(page));
  await sleep(4500);
  await filesRec.stop();

  fs.mkdirSync(FOOT, { recursive: true });
  for (const name of ["git", "files"]) {
    fs.copyFileSync(path.join(OUT, `${name}.mp4`), path.join(FOOT, `${name}.mp4`));
    fs.copyFileSync(path.join(OUT, `${name}.marks.json`), path.join(FOOT, `${name}.marks.json`));
  }
}

/** dbt Power User, without CTE Diff. Two stills of the git diff. Stops when Preview CTE is on the left editor. */
async function powerUserStills(): Promise<void> {
  const home = path.join(ROOT, "out", "power-user");
  const ws = path.join(home, "jaffle_shop");
  fs.rmSync(home, { recursive: true, force: true });
  fixture(ws);
  const { page, close } = await launch(home, ws, "innoverio.vscode-dbt-power-user");
  try {
    const hand = new Hand(page);
    await page.keyboard.press("Escape");
    await openGitDiff(page, hand);
    await setSidebar(page, false);
    await scrollTo(page, hand, "payments as (");
    // Power User 0.67 labels the lens "Execute CTE", not "Preview CTE". Either string counts.
    const lens = /Execute CTE|Preview CTE/;
    try {
      await until(async () => {
        const n = await sideEditor(page, "right").locator(".codelens-decoration", { hasText: lens }).count();
        return n > 0 ? n : false;
      }, "Execute CTE or Preview CTE on the right editor", 45000);
    } catch (err) {
      for (const side of ["left", "right"] as const) {
        console.log(side, await sideEditor(page, side).locator(".codelens-decoration").allTextContents());
      }
      await fullShot(page, path.join(home, "no-lens.png"));
      throw err;
    }
    for (const side of ["left", "right"] as const) {
      const texts = await sideEditor(page, side).locator(".codelens-decoration").allTextContents();
      console.log(side, texts);
    }
    const leftN = await sideEditor(page, "left").locator(".codelens-decoration", { hasText: lens }).count();
    if (leftN > 0) {
      await fullShot(page, path.join(home, "left-has-lens.png"));
      throw new Error("The CTE lens is on the left editor too. See out/power-user/left-has-lens.png");
    }
    const rightN = await sideEditor(page, "right").locator(".codelens-decoration", { hasText: lens }).count();
    if (!rightN) throw new Error("the right editor lost its CTE lens");
    const ask = page.getByText("Don't ask again", { exact: true });
    if (await ask.count()) await ask.click();
    const started = page.locator(".tab", { hasText: "Get Started" }).first();
    if (await started.count()) {
      await started.hover();
      const close = started.locator(".tab-close, .codicon-close").first();
      if (await close.count()) await close.click();
    }
    await sleep(400);
    await hand.click(lineOn(page, "left", "payments as ("));
    await sleep(500);
    await fullShot(page, path.join(STILLS, "power-user-left.png"));
    await hand.click(lineOn(page, "right", "payments as ("));
    await sleep(700);
    await fullShot(page, path.join(STILLS, "power-user-right.png"));
    console.log("wrote the Power User stills");
  } finally {
    await close();
  }
}

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
if (process.argv[2] === "stills") {
  await powerUserStills();
} else {
  fs.rmSync(OUT, { recursive: true, force: true });
  fixture(WS);
  const { page, close } = await launch(OUT, WS, path.join(ROOT, `cte-diff-${version}.vsix`));
  try {
    await flow(page);
  } finally {
    await close();
  }
}
