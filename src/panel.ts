/* The Results view in the bottom panel, beside the Terminal: static HTML (no scripts), redrawn for each state. The HTML
 * itself comes from src/results.ts, which the docs site's demo shares. */
import * as vscode from "vscode";
import { type Comparison, type Row } from "./query.ts";
import { comparisonHtml, errorHtml, RESULTS_CSS, rowsHtml, runningHtml } from "./results.ts";

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

export const showRunning = (title: string, what: string) => show(title, runningHtml(what));
export const showError = (title: string, message: string) => show(title, errorHtml(message));
export const showRows = (title: string, what: string, rows: Row[], limit: number) => show(title, rowsHtml(what, rows, limit));
export const showComparison = (title: string, what: string, c: Comparison, limit: number) => show(title, comparisonHtml(what, c, limit));

function page(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>${RESULTS_CSS}</style></head><body>${body}</body></html>`;
}
