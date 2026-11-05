import * as path from "node:path";
import * as vscode from "vscode";
import { cteQuery } from "./cte.ts";
import { findDbt, projectDirOf, show } from "./dbt.ts";
import { CteLens, diffOf } from "./lens.ts";
import { results, showComparison, showError, showRows, showRunning } from "./panel.ts";
import { compareQuery, readComparison, type Row } from "./query.ts";
import { CteTree, reveal, SQL_LANGUAGES, type CteNode } from "./tree.ts";

let log: vscode.OutputChannel;
let picked: string | undefined; // the project chosen for files outside any dbt project, e.g. pasted SQL
let latest = 0;
let again: (() => Promise<void>) | undefined; // the last preview or compare, for Run Again
let tree: CteTree;

/** Returns the sidebar, for the integration test. */
export function activate(context: vscode.ExtensionContext): { tree: CteTree } {
  log = vscode.window.createOutputChannel("CTE Diff");
  const lens = new CteLens();
  tree = new CteTree();
  tree.view = vscode.window.createTreeView("cteDiff.ctes", { treeDataProvider: tree });
  let pending: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    clearTimeout(pending);
    pending = setTimeout(() => void tree.update(), 300);
  };
  update();
  context.subscriptions.push(
    log,
    tree.view,
    vscode.languages.registerCodeLensProvider(
      SQL_LANGUAGES.map((language) => ({ language })),
      lens,
    ),
    vscode.window.tabGroups.onDidChangeTabs(() => {
      lens.refresh();
      update();
    }),
    vscode.window.registerWebviewViewProvider("cteDiff.results", results),
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeTextDocument((e) => tree.shows(e.document.uri) && update()),
    vscode.commands.registerCommand("cteDiff.tree.reveal", (n: CteNode) => guard(() => reveal(n))),
    vscode.commands.registerCommand("cteDiff.tree.preview", (n: CteNode) => guard(() => preview(n.uri!, n.name))),
    vscode.commands.registerCommand("cteDiff.tree.previewLeft", (n: CteNode) => guard(() => preview(n.left!, n.name))),
    vscode.commands.registerCommand("cteDiff.tree.previewRight", (n: CteNode) => guard(() => preview(n.right!, n.name))),
    vscode.commands.registerCommand("cteDiff.tree.compare", (n: CteNode) => guard(() => compare(n.right!, n.name))),
    vscode.commands.registerCommand("cteDiff.preview", (uri: vscode.Uri, name?: string) => guard(() => preview(uri, name))),
    vscode.commands.registerCommand("cteDiff.compare", (uri: vscode.Uri, name?: string) => guard(() => compare(uri, name))),
    vscode.commands.registerCommand("cteDiff.newComparison", () => guard(newComparison)),
    vscode.commands.registerCommand("cteDiff.compareCte", () => guard(pickCte)),
    vscode.commands.registerCommand("cteDiff.previewCte", () => guard(pickCte)),
    vscode.commands.registerCommand("cteDiff.rerun", () => guard(async () => again?.())),
    vscode.commands.registerCommand("cteDiff.showLog", () => log.show(true)),
    { dispose: () => clearTimeout(pending) },
  );
  return { tree };
}

async function guard(f: () => Promise<void>): Promise<void> {
  try {
    await f();
  } catch (e) {
    vscode.window.showErrorMessage(`CTE Diff: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const label = (name?: string) => name ?? "the whole query";

/** Remembers a run for Run Again, which shows in the results' title bar from the first run on. */
function remember(f: () => Promise<void>): void {
  again = f;
  void vscode.commands.executeCommand("setContext", "cteDiff.ran", true);
}

async function preview(uri: vscode.Uri, name?: string): Promise<void> {
  remember(() => preview(uri, name));
  const doc = await vscode.workspace.openTextDocument(uri);
  const sql = cteQuery(doc.getText(), name);
  const what = `${label(name)} (${path.basename(uri.path) || "untitled"})`;
  const result = await run(uri, `Preview: ${label(name)}`, what, sql);
  if (result) showRows(`Preview: ${label(name)}`, what, result.rows, result.limit);
}

async function compare(uri: vscode.Uri, name?: string): Promise<void> {
  const diff = diffOf(uri);
  if (!diff) throw new Error("Open the two versions in a diff editor first.");
  remember(() => compare(uri, name));
  const [left, right] = await Promise.all([diff.left, diff.right].map((u) => vscode.workspace.openTextDocument(u)));
  const side = (doc: vscode.TextDocument, which: string) => {
    try {
      return cteQuery(doc.getText(), name);
    } catch {
      throw new Error(`The ${which} side has no CTE named ${name}.`);
    }
  };
  const sql = compareQuery(side(left, "left"), side(right, "right"));
  const title = `Compare: ${label(name)}`;
  // A git diff's left side lives at a git: URI, so the project is found from the right side's file.
  const result = await run(diff.right, title, label(name), sql);
  if (result) showComparison(title, label(name), readComparison(result.rows), result.limit);
}

/** The editor title bar's button: pick one of the active SQL's CTEs, as the sidebar lists them. In a diff it compares,
 * or previews the one side a new or removed CTE is on; elsewhere it previews. */
async function pickCte(): Promise<void> {
  await tree.update();
  const nodes = tree.getChildren();
  if (!nodes.length) throw new Error("Open a SQL file first.");
  const inDiff = nodes.some((n) => n.status);
  const items = nodes.map((node) => {
    const item = tree.getTreeItem(node);
    return { label: String(item.label), description: String(item.description ?? ""), iconPath: item.iconPath as vscode.ThemeIcon, node };
  });
  const picked = await vscode.window.showQuickPick(items, {
    title: inDiff ? "Compare a CTE on both sides" : "Preview a CTE",
    placeHolder: inDiff ? "A new or removed CTE previews the one side it is on" : "Type to filter the CTEs",
    matchOnDescription: true,
  });
  if (!picked) return;
  const n = picked.node;
  if (n.uri) await preview(n.uri, n.name);
  else if (n.left && n.right) await compare(n.right, n.name);
  else await preview((n.left ?? n.right)!, n.name);
}

async function newComparison(): Promise<void> {
  const left = await vscode.workspace.openTextDocument({ language: "sql", content: "-- Paste the old SQL here\n" });
  const right = await vscode.workspace.openTextDocument({ language: "sql", content: "-- Paste the new SQL here\n" });
  await vscode.commands.executeCommand("vscode.diff", left.uri, right.uri, "CTE Diff: old ↔ new");
}

/** Runs `sql` with dbt show, with a cancellable notification. Undefined when cancelled or overtaken by a newer run. */
async function run(uri: vscode.Uri, title: string, what: string, sql: string): Promise<{ rows: Row[]; limit: number } | undefined> {
  const config = vscode.workspace.getConfiguration("cteDiff", uri);
  const projectDir = await projectFor(uri, config.get<string>("projectDir", ""));
  const limit = config.get<number>("limit", 100);
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const dbt = findDbt(config.get<string>("dbtPath", ""), [projectDir, ...folders]);
  const id = ++latest;
  showRunning(title, what);
  try {
    const rows = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `CTE Diff: running dbt show for ${what}`, cancellable: true },
      (_, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        return show(sql, { dbt, projectDir, limit, target: config.get<string>("target") || undefined, log: (l) => log.appendLine(l) }, abort.signal);
      },
    );
    return id === latest ? { rows, limit } : undefined;
  } catch (e) {
    if (id !== latest) return undefined;
    showError(title, e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

/** The dbt project to run in: the setting, else the one holding the file, else one picked from the workspace. */
async function projectFor(uri: vscode.Uri, setting: string): Promise<string> {
  const folder = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0];
  if (setting) return path.resolve(folder?.uri.fsPath ?? "", setting);
  const own = uri.scheme === "untitled" ? undefined : projectDirOf(uri.fsPath);
  if (own) return own;
  if (picked) return picked;
  const found = await vscode.workspace.findFiles("**/dbt_project.yml", "**/{dbt_packages,dbt_modules,node_modules,target}/**", 50);
  const dirs = found.map((f) => path.dirname(f.fsPath)).sort((a, b) => a.length - b.length);
  if (dirs.length === 0) throw new Error("No dbt_project.yml in this workspace. Open your dbt project, or set cteDiff.projectDir.");
  picked = dirs.length === 1 ? dirs[0] : await vscode.window.showQuickPick(dirs, { title: "Which dbt project should run the SQL?" });
  if (!picked) throw new Error("No dbt project picked.");
  return picked;
}
