import * as path from "node:path";
import * as vscode from "vscode";
import { refLabel } from "./branch.ts";
import { branchQuery, cteQuery, subqueryQuery } from "./cte.ts";
import { compile, debug, findDbt, projectDirOf, show } from "./dbt.ts";
import { FilesTree, type FileNode, type Side } from "./files.ts";
import { CteLens, diffOf } from "./lens.ts";
import { results, showCancelled, showComparison, showError, showRows, showRunning, showSetup, showUnsupported } from "./panel.ts";
import { compareQuery, readComparison, unsupported, type Row } from "./query.ts";
import { CteTree, reveal, SQL_LANGUAGES, type CteNode } from "./tree.ts";

let log: vscode.OutputChannel;
let picked: string | undefined; // the project chosen for files outside any dbt project, e.g. pasted SQL
let latest = 0;
let again: (() => Promise<void>) | undefined; // the last preview or compare, for Run Again
let tree: CteTree;

const COMPILED = "cte-diff-compiled";
const compiledText = new Map<string, string>();
let compiledRun = 0;

/** Serves the compiled SQL of each side to a diff editor, so nothing is written to disk. */
const compiledDocs: vscode.TextDocumentContentProvider = {
  provideTextDocumentContent: (uri) => compiledText.get(uri.toString()),
};

/** A URI holding `sql`, named `label`. Unique per call, so a new comparison doesn't show an old side's text. */
function compiledUri(label: string, sql: string): vscode.Uri {
  const name = /\.sql$/i.test(label) ? label : `${label}.sql`;
  const uri = vscode.Uri.from({ scheme: COMPILED, path: `/${name}`, query: String(++compiledRun) });
  compiledText.set(uri.toString(), sql);
  if (compiledText.size > 40) {
    const oldest = compiledText.keys().next().value;
    if (oldest !== undefined) compiledText.delete(oldest);
  }
  return uri;
}

/** Returns the sidebar's views, for the integration test. */
export function activate(context: vscode.ExtensionContext): { tree: CteTree; files: FilesTree } {
  log = vscode.window.createOutputChannel("CTE Diff");
  const lens = new CteLens();
  tree = new CteTree();
  tree.view = vscode.window.createTreeView("cteDiff.ctes", { treeDataProvider: tree });
  const files = new FilesTree(context.workspaceState);
  files.follow(vscode.window.activeTextEditor?.document);
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.sql", false, true, false);
  let pending: ReturnType<typeof setTimeout> | undefined;
  const update = () => {
    clearTimeout(pending);
    pending = setTimeout(() => void tree.update(), 300);
  };
  update();
  offerDiffLens(context);
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
      offerDiffLens(context);
    }),
    vscode.window.registerWebviewViewProvider("cteDiff.results", results),
    vscode.workspace.registerTextDocumentContentProvider(COMPILED, compiledDocs),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      update();
      files.follow(editor?.document);
    }),
    vscode.window.registerTreeDataProvider("cteDiff.files", files),
    watcher,
    watcher.onDidCreate(() => files.reload()),
    watcher.onDidDelete(() => files.reload()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!tree.shows(e.document.uri)) return;
      update();
      lens.refresh(); // the other side's Compare lenses depend on this side's CTEs
    }),
    vscode.commands.registerCommand("cteDiff.tree.reveal", (n: CteNode) => guard(() => reveal(n))),
    vscode.commands.registerCommand("cteDiff.tree.preview", (n: CteNode) => guardRun(() => preview(n.uri!, n.name))),
    vscode.commands.registerCommand("cteDiff.tree.previewLeft", (n: CteNode) => guardRun(() => preview(n.left!, n.name))),
    vscode.commands.registerCommand("cteDiff.tree.previewRight", (n: CteNode) => guardRun(() => preview(n.right!, n.name))),
    vscode.commands.registerCommand("cteDiff.tree.previewSubquery", (n: CteNode) => guardRun(() => previewSubquery(n.uri!, n.start!))),
    vscode.commands.registerCommand("cteDiff.tree.compare", (n: CteNode) => guardRun(() => compare(n.right!, n.name))),
    vscode.commands.registerCommand("cteDiff.preview", (uri: vscode.Uri, name?: string) => guardRun(() => preview(uri, name))),
    vscode.commands.registerCommand("cteDiff.previewSubquery", (uri: vscode.Uri, start: number) => guardRun(() => previewSubquery(uri, start))),
    vscode.commands.registerCommand("cteDiff.previewBranch", (uri: vscode.Uri, start: number) => guardRun(() => previewBranch(uri, start))),
    vscode.commands.registerCommand("cteDiff.compare", (uri: vscode.Uri, name?: string) => guardRun(() => compare(uri, name))),
    vscode.commands.registerCommand("cteDiff.compareCompiled", () => guardRun(compareCompiled)),
    vscode.commands.registerCommand("cteDiff.newComparison", () => guard(newComparison)),
    vscode.commands.registerCommand("cteDiff.compareFiles", () => guard(() => files.compare())),
    vscode.commands.registerCommand("cteDiff.files.pick", (side: Side) => guard(async () => void (await files.pick(side)))),
    vscode.commands.registerCommand("cteDiff.files.setOld", (n: FileNode & { kind: "file" }) => files.set("old", n.uri)),
    vscode.commands.registerCommand("cteDiff.files.setNew", (n: FileNode & { kind: "file" }) => files.set("new", n.uri)),
    vscode.commands.registerCommand("cteDiff.files.open", () => guard(() => files.open())),
    // From the Compare Files list it gets the file's node; from the title bar or Command Palette, nothing.
    vscode.commands.registerCommand("cteDiff.compareWithBranch", (n?: FileNode) =>
      guard(() => files.compareWithBranch(n?.kind === "file" ? n.uri : undefined)),
    ),
    vscode.commands.registerCommand("cteDiff.compareCte", () => guardRun(pickCte)),
    vscode.commands.registerCommand("cteDiff.previewCte", () => guardRun(pickCte)),
    vscode.commands.registerCommand("cteDiff.rerun", () => guardRun(async () => again?.())),
    vscode.commands.registerCommand("cteDiff.showLog", () => log.show(true)),
    vscode.commands.registerCommand("cteDiff.checkSetup", () => guardRun(checkSetup)),
    vscode.commands.registerCommand("cteDiff.chooseProject", () => guard(chooseProject)),
    { dispose: () => clearTimeout(pending) },
  );
  return { tree, files };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function guard(f: () => Promise<void>): Promise<void> {
  try {
    await f();
  } catch (e) {
    vscode.window.showErrorMessage(`CTE Diff: ${message(e)}`);
  }
}

/** guard for commands that show results: an error from before dbt runs goes to the results panel, where the run's
 * own errors go. */
async function guardRun(f: () => Promise<void>): Promise<void> {
  try {
    await f();
  } catch (e) {
    showError("CTE Diff", message(e), "Couldn't run");
  }
}

const ASKED_DIFF_LENS = "cteDiff.askedDiffLens";

/** The first time a SQL diff opens with the buttons above each CTE hidden (VS Code hides CodeLens in diffs by
 * default), offers once to show them. */
function offerDiffLens(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration("diffEditor");
  if (context.globalState.get(ASKED_DIFF_LENS) || config.get<boolean>("codeLens")) return;
  const isSql = (uri: vscode.Uri) =>
    /\.sql$/i.test(uri.path) || SQL_LANGUAGES.includes(vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString())?.languageId ?? "");
  const sqlDiff = vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.input instanceof vscode.TabInputTextDiff && isSql(t.input.modified)));
  if (!sqlDiff) return;
  void context.globalState.update(ASKED_DIFF_LENS, true);
  const yes = "Show Them";
  void vscode.window
    .showInformationMessage(
      'CTE Diff: diff editors hide the ▶ Preview and ⇄ Compare sides buttons above each CTE. Show them? This sets "diffEditor.codeLens": true. The sidebar and the title bar work either way.',
      yes,
      "Not Now",
    )
    .then((a) => {
      if (a === yes) void config.update("codeLens", true, vscode.ConfigurationTarget.Global);
    });
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
  const result = await run(uri, `Preview: ${label(name)}`, what, sql, fileName(uri));
  if (result) showRows(`Preview: ${label(name)}`, what, result.rows, result.limit, result.meta);
}

/** Previews a subquery at `start`, with the outer query's relations so a correlated one resolves them. */
async function previewSubquery(uri: vscode.Uri, start: number): Promise<void> {
  remember(() => previewSubquery(uri, start));
  const doc = await vscode.workspace.openTextDocument(uri);
  const sql = subqueryQuery(doc.getText(), start);
  const what = `subquery at line ${doc.positionAt(start).line + 1} (${fileName(uri)})`;
  const result = await run(uri, "Preview: subquery", what, sql, fileName(uri));
  if (result) showRows("Preview: subquery", what, result.rows, result.limit, result.meta);
}

/** Previews one branch of a UNION (or INTERSECT, EXCEPT) at `start`, with the CTEs it reads. */
async function previewBranch(uri: vscode.Uri, start: number): Promise<void> {
  remember(() => previewBranch(uri, start));
  const doc = await vscode.workspace.openTextDocument(uri);
  const sql = branchQuery(doc.getText(), start);
  const what = `branch at line ${doc.positionAt(start).line + 1} (${fileName(uri)})`;
  const result = await run(uri, "Preview: branch", what, sql, fileName(uri));
  if (result) showRows("Preview: branch", what, result.rows, result.limit, result.meta);
}

/** A file's name for the results' heading; a git: URI is a committed version, named by its branch when it has one. */
const fileName = (uri: vscode.Uri) =>
  (path.basename(uri.path) || "untitled") + (uri.scheme === "git" ? ` (${refLabel(uri.query) ?? "git"})` : "");

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
  const result = await run(diff.right, title, label(name), sql, `${fileName(diff.left)} ↔ ${fileName(diff.right)}`);
  if (result) showComparison(title, label(name), readComparison(result.rows), result.limit, result.meta);
}

/** The diff editor tab in front, if any. */
function activeDiffTab(): vscode.Tab | undefined {
  const groups = vscode.window.tabGroups;
  const ordered = [groups.activeTabGroup, ...groups.all.filter((g) => g !== groups.activeTabGroup)];
  const diffs = ordered.flatMap((g) => g.tabs.filter((t) => t.input instanceof vscode.TabInputTextDiff));
  return diffs.find((t) => t.isActive) ?? diffs[0];
}

/** Compares both sides' compiled SQL, not their rows: dbt renders the Jinja, refs and macros of each side, so the diff
 * shows what the query became. */
async function compareCompiled(): Promise<void> {
  const input = activeDiffTab()?.input;
  if (!(input instanceof vscode.TabInputTextDiff)) throw new Error("Open the two versions in a diff editor first.");
  if (input.original.scheme === COMPILED || input.modified.scheme === COMPILED) throw new Error("This is already a compiled diff.");
  const o = await setup(input.modified);
  const [leftDoc, rightDoc] = await Promise.all([input.original, input.modified].map((uri) => vscode.workspace.openTextDocument(uri)));
  const id = ++latest;
  try {
    const sides = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "CTE Diff: compiling both sides", cancellable: true },
      async (_, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        // One at a time: dbt runs in one project share target/.
        const leftSql = await compile(cteQuery(leftDoc.getText()), o, abort.signal);
        const rightSql = await compile(cteQuery(rightDoc.getText()), o, abort.signal);
        return [leftSql, rightSql] as const;
      },
    );
    if (id !== latest) return;
    const [leftName, rightName] = [fileName(input.original), fileName(input.modified)];
    await vscode.commands.executeCommand(
      "vscode.diff",
      compiledUri(leftName, sides[0]),
      compiledUri(rightName, sides[1]),
      `${leftName} compiled ↔ ${rightName} compiled`,
    );
  } catch (e) {
    if (id !== latest) return;
    if (message(e) === "Cancelled") showCancelled("Compare Compiled SQL", "both sides' compiled SQL");
    else showError("Compare Compiled SQL", message(e));
  }
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

/** Where and how dbt runs for `uri`: the settings, the project, and the dbt executable. */
async function setup(uri: vscode.Uri) {
  const config = vscode.workspace.getConfiguration("cteDiff", uri);
  const projectDir = await projectFor(uri, config.get<string>("projectDir", ""));
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const dbt = findDbt(config.get<string>("dbtPath", ""), [projectDir, ...folders]);
  return { dbt, projectDir, limit: config.get<number>("limit", 100), target: config.get<string>("target") || undefined, log: (l: string) => log.appendLine(l) };
}

/** Runs `sql` with dbt show, with a cancellable notification. Undefined when cancelled, failed (the panel says so) or
 * overtaken by a newer run. `meta` is the heading's line: the files, the target and the run time. */
async function run(uri: vscode.Uri, title: string, what: string, sql: string, files: string): Promise<{ rows: Row[]; limit: number; meta: string } | undefined> {
  const o = await setup(uri);
  const id = ++latest;
  const start = Date.now();
  showRunning(title, what);
  try {
    const rows = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `CTE Diff: running dbt show for ${what}`, cancellable: true },
      (_, token) => {
        const abort = new AbortController();
        token.onCancellationRequested(() => abort.abort());
        return show(sql, o, abort.signal);
      },
    );
    const meta = `${files} · ${o.target ? `target ${o.target}` : "default target"} · ${((Date.now() - start) / 1000).toFixed(1)} s`;
    return id === latest ? { rows, limit: o.limit, meta } : undefined;
  } catch (e) {
    if (id !== latest) return undefined;
    const warehouse = unsupported(message(e));
    if (message(e) === "Cancelled") showCancelled(title, what);
    else if (warehouse) showUnsupported(title, warehouse);
    else showError(title, message(e));
    return undefined;
  }
}

/** Runs dbt debug for the active file's project, with the settings it ran with, and shows what it found. */
async function checkSetup(): Promise<void> {
  const uri = vscode.window.activeTextEditor?.document.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!uri) throw new Error("Open a dbt project's folder first.");
  const o = await setup(uri);
  const checks: [string, string][] = [
    ["dbt", o.dbt === "dbt" ? "dbt on PATH (set cteDiff.dbtPath if it isn't found)" : o.dbt],
    ["Project", o.projectDir],
    ["Target", o.target ?? "the profile's default (cteDiff.target)"],
  ];
  const id = ++latest;
  showRunning("Check Setup", "Setup", "dbt debug");
  const { ok, output } = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "CTE Diff: running dbt debug" },
    () => debug(o),
  );
  if (id === latest) showSetup(checks, ok, output);
}

/** Picks the project that runs SQL outside any dbt project, such as pasted queries, for the rest of the session. */
async function chooseProject(): Promise<void> {
  const dir = await pickProject();
  if (!dir) return;
  picked = dir;
  vscode.window.showInformationMessage(`CTE Diff: SQL outside a dbt project now runs in ${dir}.`);
}

/** One of the workspace's dbt projects: the only one, else the user's pick (undefined if dismissed). */
async function pickProject(): Promise<string | undefined> {
  const found = await vscode.workspace.findFiles("**/dbt_project.yml", "**/{dbt_packages,dbt_modules,node_modules,target}/**", 50);
  const dirs = found.map((f) => path.dirname(f.fsPath)).sort((a, b) => a.length - b.length);
  if (dirs.length === 0) throw new Error("No dbt_project.yml in this workspace. Open your dbt project, or set cteDiff.projectDir.");
  return dirs.length === 1 ? dirs[0] : vscode.window.showQuickPick(dirs, { title: "Which dbt project should run the SQL?" });
}

/** The dbt project to run in: the setting, else the one holding the file, else one picked from the workspace. */
async function projectFor(uri: vscode.Uri, setting: string): Promise<string> {
  const folder = vscode.workspace.getWorkspaceFolder(uri) ?? vscode.workspace.workspaceFolders?.[0];
  if (setting) return path.resolve(folder?.uri.fsPath ?? "", setting);
  const own = uri.scheme === "untitled" ? undefined : projectDirOf(uri.fsPath);
  if (own) return own;
  picked ??= await pickProject();
  if (!picked) throw new Error("No dbt project picked. CTE Diff: Choose dbt Project picks one.");
  return picked;
}
