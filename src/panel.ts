/* The results panel beside the editor: static HTML (no scripts), redrawn for each state. */
import * as vscode from "vscode";
import type { Comparison, Row } from "./query.ts";

let panel: vscode.WebviewPanel | undefined;

function show(title: string, body: string): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel("cteDiff.results", title, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {});
    panel.onDidDispose(() => (panel = undefined));
  }
  panel.title = title;
  panel.webview.html = page(body);
  panel.reveal(undefined, true);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (x: number) => x.toLocaleString("en-US");

function cell(v: unknown): string {
  if (v === null || v === undefined) return '<td class="null">NULL</td>';
  return `<td>${esc(typeof v === "object" ? JSON.stringify(v) : String(v))}</td>`;
}

/** Column names in first-seen order across all rows. */
function columns(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  return [...seen];
}

function grid(rows: Row[], cols: string[], badge?: (i: number) => string): string {
  const head = (badge ? "<th></th>" : "") + cols.map((c) => `<th>${esc(c)}</th>`).join("");
  const body = rows.map((r, i) => `<tr>${badge ? badge(i) : ""}${cols.map((c) => cell(r[c])).join("")}</tr>`).join("");
  return `<div class="scroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function showRunning(title: string, what: string): void {
  show(title, `<p class="muted">Running <code>dbt show</code> for ${esc(what)}…</p>`);
}

export function showError(title: string, message: string): void {
  show(title, `<h3>dbt failed</h3><pre class="error">${esc(message)}</pre><p class="muted">The full log is in Output › CTE Diff.</p>`);
}

export function showRows(title: string, what: string, rows: Row[], limit: number): void {
  const more = rows.length >= limit ? ` (the first ${n(limit)}; raise <code>cteDiff.limit</code> for more)` : "";
  const note = `<p><b>${esc(what)}</b>: ${n(rows.length)} row${rows.length === 1 ? "" : "s"}${more}</p>`;
  show(title, note + (rows.length ? grid(rows, columns(rows)) : ""));
}

export function showComparison(title: string, what: string, c: Comparison, limit: number): void {
  const k = c.counts;
  const summary = k
    ? `left ${n(k.left)} rows · right ${n(k.right)} rows · <span class="l">only left ${n(k.only_left)}</span> · <span class="r">only right ${n(k.only_right)}</span>`
    : "row counts unavailable";
  let body = `<p><b>${esc(what)}</b>: ${summary}</p>`;
  if (k && !k.only_left && !k.only_right) {
    body += k.left === k.right ? "<p>✓ Both sides return the same rows.</p>" : "<p>✓ Same distinct rows; the counts differ only by duplicates.</p>";
  }
  const lcols = columns(c.rows.filter((r) => r.side === "left").map((r) => r.row));
  const rcols = columns(c.rows.filter((r) => r.side === "right").map((r) => r.row));
  const onlyL = lcols.filter((x) => !rcols.includes(x));
  const onlyR = rcols.filter((x) => !lcols.includes(x));
  if (lcols.length && rcols.length && (onlyL.length || onlyR.length)) {
    body += `<p class="warn">The columns differ, so every row does. Only left: ${esc(onlyL.join(", ") || "none")}. Only right: ${esc(onlyR.join(", ") || "none")}.</p>`;
  }
  if (c.rows.length) {
    const shown = c.rows.length >= limit ? ` The first ${n(limit)} differing rows, sorted so a changed row's two versions tend to sit together.` : "";
    body += `<p class="muted">Rows on one side only.${shown}</p>`;
    const rows = c.rows.map((r) => r.row);
    body += grid(rows, columns(rows), (i) => (c.rows[i].side === "left" ? '<td class="badge l">− left</td>' : '<td class="badge r">+ right</td>'));
  }
  show(title, body);
}

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 12px; }
.scroll { overflow: auto; max-height: calc(100vh - 90px); border: 1px solid var(--vscode-panel-border); }
table { border-collapse: collapse; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
th { position: sticky; top: 0; background: var(--vscode-editorGroupHeader-tabsBackground); text-align: left; }
th, td { padding: 3px 8px; border-bottom: 1px solid var(--vscode-panel-border); white-space: pre; }
.null, .muted { color: var(--vscode-descriptionForeground); }
.null { font-style: italic; }
.l { color: var(--vscode-gitDecoration-deletedResourceForeground); }
.r { color: var(--vscode-gitDecoration-addedResourceForeground); }
.badge { font-weight: 600; }
.warn { color: var(--vscode-editorWarning-foreground); }
.error { color: var(--vscode-errorForeground); white-space: pre-wrap; }
</style></head><body>${body}</body></html>`;
}
