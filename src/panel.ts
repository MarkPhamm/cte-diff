/* The Results view in the bottom panel, beside the Terminal: static HTML (no scripts), redrawn for each state. */
import * as vscode from "vscode";
import { cutFrom, pairRows, type Comparison, type Row } from "./query.ts";

let view: vscode.WebviewView | undefined;
let last = { title: "", html: "" };

/** Fills the view when VS Code first shows it, with the latest result if there is one. */
export const results: vscode.WebviewViewProvider = {
  resolveWebviewView(v) {
    view = v;
    v.onDidDispose(() => (view = undefined));
    v.description = last.title;
    v.webview.html =
      last.html ||
      page(
        `<p class="muted">Click <b>▶ Preview</b> above a CTE to see its rows here. In a diff, <b>⇄ Compare sides</b> runs the CTE on both sides and lists the rows that differ.</p>
<p class="muted">The <b>CTE Diff</b> sidebar and the editor's title bar have the same buttons.</p>`,
      );
  },
};

function show(title: string, body: string): void {
  last = { title, html: page(body) };
  if (!view) {
    // The view isn't open yet: opening it calls resolveWebviewView, which draws `last`.
    void vscode.commands.executeCommand("cteDiff.results.focus");
    return;
  }
  view.description = title;
  view.webview.html = last.html;
  view.show(true);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (x: number) => x.toLocaleString("en-US");
const plural = (k: number, word: string) => `${n(k)} ${word}${k === 1 ? "" : "s"}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A cell; `changed` marks a value that differs from the row's other version. */
function cell(r: Row, c: string, changed = false): string {
  const cls = changed ? ["chg"] : [];
  if (!(c in r)) return '<td class="absent" title="Not a column on this side"></td>';
  const v = r[c];
  if (v === null || v === undefined) return `<td class="${["null", ...cls].join(" ")}">NULL</td>`;
  if (typeof v === "number") cls.push("num");
  const attr = cls.length ? ` class="${cls.join(" ")}"` : "";
  return `<td${attr}>${esc(typeof v === "object" ? JSON.stringify(v) : String(v))}</td>`;
}

/** Column names in first-seen order across all rows. */
function columns(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  return [...seen];
}

/** A table under a sticky header; a column of numbers is right-aligned, header included. */
function table(rows: Row[], cols: string[], first: string, body: string): string {
  const numeric = (c: string) => rows.some((r) => typeof r[c] === "number") && rows.every((r) => r[c] == null || typeof r[c] === "number");
  const head = cols.map((c) => `<th${numeric(c) ? ' class="num"' : ""}>${esc(c)}</th>`).join("");
  return `<div class="scroll"><table><thead><tr><th class="${first}"></th>${head}</tr></thead>${body}</table></div>`;
}

/** The view's heading: what ran, and the counts under it. */
const heading = (what: string, stats: string[]) => `<h2>${esc(what)}</h2><div class="stats">${stats.join("")}</div>`;
const stat = (text: string, cls = "") => `<span class="stat ${cls}">${text}</span>`;

export function showRunning(title: string, what: string): void {
  show(title, `<div class="progress"></div><h2>${esc(what)}</h2><p class="muted">Running <code>dbt show</code>…</p>`);
}

export function showError(title: string, message: string): void {
  show(title, `<h2 class="bad">dbt failed</h2><pre class="error">${esc(message)}</pre><p class="muted">The full log, with the SQL that ran, is in Output › CTE Diff (the log button in this view's title bar).</p>`);
}

export function showRows(title: string, what: string, rows: Row[], limit: number): void {
  const cols = columns(rows);
  let body = heading(what, [stat(plural(rows.length, "row")), stat(plural(cols.length, "column"))]);
  if (rows.length >= limit) body += `<p class="muted">The first ${plural(limit, "row")}. Raise <code>cteDiff.limit</code> for more.</p>`;
  if (rows.length) {
    const trs = rows.map((r, i) => `<tr><td class="idx">${i + 1}</td>${cols.map((c) => cell(r, c)).join("")}</tr>`).join("");
    body += table(rows, cols, "idx", `<tbody>${trs}</tbody>`);
  } else body += '<p class="muted">No rows.</p>';
  show(title, body);
}

export function showComparison(title: string, what: string, c: Comparison, limit: number): void {
  const k = c.counts;
  const p = pairRows(c);
  const stats = k
    ? [
        stat(`Left ${plural(k.left, "row")}`),
        stat(`Right ${plural(k.right, "row")}`),
        stat(`Only left ${n(k.only_left)}`, k.only_left ? "l" : ""),
        stat(`Only right ${n(k.only_right)}`, k.only_right ? "r" : ""),
      ]
    : [];
  let body = heading(what, stats);
  if (!k) body += '<p class="muted">Row counts unavailable.</p>';
  else if (!k.only_left && !k.only_right) {
    body += `<p class="verdict"><span class="good">✓</span> ${k.left === k.right ? "Both sides return the same rows." : "Same distinct rows; the counts differ only by duplicates."}</p>`;
  } else {
    const parts = [p.pairs.length && plural(p.pairs.length, "changed row"), p.left.length && `${n(p.left.length)} only left`, p.right.length && `${n(p.right.length)} only right`];
    body += `<p class="verdict"><span class="bad">✗</span> The sides differ${p.pairs.length ? `: ${parts.filter(Boolean).join(", ")}` : ""}.</p>`;
  }
  const lcols = columns(c.rows.filter((r) => r.side === "left").map((r) => r.row));
  const rcols = columns(c.rows.filter((r) => r.side === "right").map((r) => r.row));
  const onlyL = lcols.filter((x) => !rcols.includes(x));
  const onlyR = rcols.filter((x) => !lcols.includes(x));
  if (lcols.length && rcols.length && (onlyL.length || onlyR.length)) {
    body += `<p class="warn">The columns differ, so every row does. Only left: ${esc(onlyL.join(", ") || "none")}. Only right: ${esc(onlyR.join(", ") || "none")}.</p>`;
  }
  const total = cutFrom(c, limit);
  if (total !== undefined) {
    body += `<p class="muted">The first ${n(c.rows.length)}${k ? ` of ${n(total)}` : ""} differing rows. Raise <code>cteDiff.limit</code> for more.</p>`;
  }
  if (c.rows.length) {
    const cols = [...p.key, ...columns(c.rows.map((r) => r.row)).filter((x) => !p.key.includes(x))];
    const width = cols.length + 1;
    const row = (side: "l" | "r", r: Row, other?: Row) =>
      `<tr class="${side}"><td class="side">${side === "l" ? "−" : "+"}</td>${cols.map((x) => cell(r, x, !!other && !same(r[x], other[x]))).join("")}</tr>`;
    const group = (label: string, trs: string) => (trs ? `<tbody><tr class="group"><td colspan="${width}">${label}</td></tr>${trs}</tbody>` : "");
    body += table(
      c.rows.map((r) => r.row),
      cols,
      "side",
      group(
        `${plural(p.pairs.length, "changed row")}, matched on ${esc(p.key.join(", "))}: old (−) above new (+)`,
        p.pairs.map(([l, r]) => row("l", l, r) + row("r", r, l)).join(""),
      ) +
        group(`Only on the left (old): ${n(p.left.length)}`, p.left.map((r) => row("l", r)).join("")) +
        group(`Only on the right (new): ${n(p.right.length)}`, p.right.map((r) => row("r", r)).join("")),
    );
  }
  show(title, body);
}

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 4px 12px 12px; }
h2 { font-size: 1.1em; font-weight: 600; margin: 6px 0 6px; font-family: var(--vscode-editor-font-family); }
p { margin: 6px 0; }
code { font-family: var(--vscode-editor-font-family); }
.stats { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.stat { padding: 1px 8px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.stat.l { background: var(--vscode-diffEditor-removedTextBackground); color: var(--vscode-foreground); }
.stat.r { background: var(--vscode-diffEditor-insertedTextBackground); color: var(--vscode-foreground); }
.verdict { font-weight: 600; }
.good { color: var(--vscode-testing-iconPassed, var(--vscode-gitDecoration-addedResourceForeground)); }
.bad { color: var(--vscode-errorForeground); }
.scroll { overflow: auto; max-height: calc(100vh - 120px); border: 1px solid var(--vscode-panel-border); }
table { border-collapse: collapse; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
th { position: sticky; top: 0; z-index: 1; background: var(--vscode-editorGroupHeader-tabsBackground); text-align: left; font-weight: 600; }
th, td { padding: 3px 8px; border-bottom: 1px solid var(--vscode-panel-border); white-space: pre; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.idx { color: var(--vscode-editorLineNumber-foreground); text-align: right; }
.null, .muted { color: var(--vscode-descriptionForeground); }
.null { font-style: italic; }
.absent { background: repeating-linear-gradient(135deg, transparent 0 4px, var(--vscode-panel-border) 4px 5px); }
.group td { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-descriptionForeground);
  background: var(--vscode-sideBar-background); padding-top: 6px; }
.side { font-weight: 700; text-align: center; }
tr.l .side { color: var(--vscode-gitDecoration-deletedResourceForeground); }
tr.r .side { color: var(--vscode-gitDecoration-addedResourceForeground); }
tr.l .chg { background: var(--vscode-diffEditor-removedTextBackground); }
tr.r .chg { background: var(--vscode-diffEditor-insertedTextBackground); }
.warn { color: var(--vscode-editorWarning-foreground); }
.error { color: var(--vscode-errorForeground); white-space: pre-wrap; }
.progress { position: fixed; top: 0; left: 0; right: 0; height: 2px; overflow: hidden; }
.progress::after { content: ""; position: absolute; width: 30%; height: 100%; background: var(--vscode-progressBar-background);
  animation: slide 1.2s ease-in-out infinite; }
@keyframes slide { from { left: -30%; } to { left: 100%; } }
@media (prefers-reduced-motion: reduce) { .progress::after { animation: none; width: 100%; opacity: .5; } }
</style></head><body>${body}</body></html>`;
}
