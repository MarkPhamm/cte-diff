/* The Results view in the bottom panel, beside the Terminal: static HTML (no scripts), redrawn for each state. The HTML
 * itself comes from src/results.ts, which the docs site's demo shares. */
import * as vscode from "vscode";
import { type Comparison, type Row } from "./query.ts";
import { SUPPORTED } from "./query.ts";
import { cancelledHtml, comparisonHtml, errorHtml, RESULTS_CSS, rowsHtml, runningHtml, setupHtml, unsupportedHtml } from "./results.ts";

let view: vscode.WebviewView | undefined;
let last = { title: "", html: "" };

/** Fills the view when VS Code first shows it, with the latest result if there is one. */
export const results: vscode.WebviewViewProvider = {
  resolveWebviewView(v) {
    view = v;
    v.webview.options = { enableCommandUris: ["cteDiff.checkSetup"] }; // the Check Setup link under an error
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

const checkSetup = '<p><a href="command:cteDiff.checkSetup">Check Setup</a> runs <code>dbt debug</code> and shows what dbt finds.</p>';

export const showRunning = (title: string, what: string, command?: string) => show(title, runningHtml(what, command));
/** An error from dbt, or (`title` "Couldn't run") from before dbt ran. */
export const showError = (title: string, message: string, heading?: string) => show(title, errorHtml(message, heading) + checkSetup);
export const showCancelled = (title: string, what: string) => show(title, cancelledHtml(what));
export const showUnsupported = (title: string, warehouse: string) => show(title, unsupportedHtml(warehouse, SUPPORTED.map(name)));
export const showSetup = (checks: [string, string][], ok: boolean, output: string) => show("Check Setup", setupHtml(checks, ok, output));
export const showRows = (title: string, what: string, rows: Row[], limit: number, meta: string) => show(title, rowsHtml(what, rows, limit, meta));
export const showComparison = (title: string, what: string, c: Comparison, limit: number, meta: string) =>
  show(title, comparisonHtml(what, c, limit, meta));

const NAMES: Record<string, string> = { duckdb: "DuckDB", snowflake: "Snowflake" };
const name = (type: string) => NAMES[type] ?? type;

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>${RESULTS_CSS}</style></head><body>${body}</body></html>`;
}
