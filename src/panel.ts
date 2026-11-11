/* The Results view in the bottom panel, beside the Terminal: HTML redrawn for each state, plus one script (out/view.js,
 * from src/view.ts) that sorts, filters, copies and saves the rows. The HTML itself comes from src/results.ts, which the docs site's demo shares. */
import { randomBytes } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { type Comparison, type Row } from "./query.ts";
import { SUPPORTED } from "./query.ts";
import { cancelledHtml, comparisonHtml, errorHtml, RESULTS_CSS, rowsHtml, runningHtml, setupHtml, unsupportedHtml } from "./results.ts";

let view: vscode.WebviewView | undefined;
let last = { title: "", body: "" };
let out: vscode.Uri; // the extension's out/, which holds view.js

/** Fills the view when VS Code first shows it, with the latest result if there is one. */
export function resultsProvider(extensionUri: vscode.Uri): vscode.WebviewViewProvider {
  out = vscode.Uri.joinPath(extensionUri, "out");
  return {
    resolveWebviewView(v) {
      view = v;
      // enableCommandUris: the Check Setup link under an error.
      v.webview.options = { enableScripts: true, enableCommandUris: ["cteDiff.checkSetup"], localResourceRoots: [out] };
      v.onDidDispose(() => (view = undefined));
      v.webview.onDidReceiveMessage(received);
      v.description = last.title;
      v.webview.html = page(
        v.webview,
        last.body ||
          `<p class="muted">Click <b>▶ Preview</b> above a CTE to see its rows here. In a diff, <b>⇄ Compare sides</b> runs the CTE on both sides and lists the rows that differ.</p>
<p class="muted">The <b>CTE Diff</b> sidebar and the editor's title bar have the same buttons.</p>`,
      );
    },
  };
}

/** What the view's script asks for: text on the clipboard, or a file saved where the user picks. */
async function received(m: { copy?: unknown; save?: { name?: unknown; text?: unknown } }): Promise<void> {
  if (typeof m.copy === "string") {
    await vscode.env.clipboard.writeText(m.copy);
    vscode.window.setStatusBarMessage("CTE Diff: copied as Markdown", 3000);
  }
  const { name, text } = m.save ?? {};
  if (typeof name !== "string" || typeof text !== "string") return;
  const file = path.basename(name);
  const ext = path.extname(file).slice(1);
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir());
  const uri = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(folder, file), filters: { [ext.toUpperCase()]: [ext] } });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
  vscode.window.setStatusBarMessage(`CTE Diff: saved ${path.basename(uri.fsPath)}`, 3000);
}

function show(title: string, body: string): void {
  last = { title, body };
  if (!view) {
    // The view isn't open yet: opening it calls resolveWebviewView, which draws `last`.
    void vscode.commands.executeCommand("cteDiff.results.focus");
    return;
  }
  view.description = title;
  view.webview.html = page(view.webview, body);
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

const NAMES: Record<string, string> = { bigquery: "BigQuery", duckdb: "DuckDB", redshift: "Redshift", snowflake: "Snowflake" };
const name = (type: string) => NAMES[type] ?? type;

/** The view's page: `body`, its CSS, and the sort script, the only script the policy lets run. */
function page(webview: vscode.Webview, body: string): string {
  const nonce = randomBytes(16).toString("base64");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(out, "view.js"));
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>${RESULTS_CSS}</style></head><body>${body}<script nonce="${nonce}" src="${script}"></script></body></html>`;
}
