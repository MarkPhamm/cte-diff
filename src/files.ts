/* The sidebar's Compare Files: an Old and a New slot, and the workspace's SQL files by folder, to open any two in a diff. */
import * as path from "node:path";
import * as vscode from "vscode";
import { diffOf } from "./lens.ts";
import { SQL_LANGUAGES } from "./tree.ts";

export type Side = "old" | "new";

export type FileNode =
  | { kind: "slot"; side: Side }
  | { kind: "open" }
  | { kind: "dir"; dir: string; files: vscode.Uri[] }
  | { kind: "file"; uri: vscode.Uri };

/** Folders of compiled SQL, installed packages and dbt's own macros, which aren't models to compare. */
const SKIP = "**/{node_modules,target,dbt_packages,.venv,venv}/**";

const same = (a?: vscode.Uri, b?: vscode.Uri) => !!a && !!b && a.toString() === b.toString();
const base = (uri: vscode.Uri) => path.basename(uri.path);
const where = (uri: vscode.Uri) => path.dirname(vscode.workspace.asRelativePath(uri));

export class FilesTree implements vscode.TreeDataProvider<FileNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private files?: Thenable<vscode.Uri[]>; // the workspace's SQL files; read again after one is created or deleted
  readonly picked: Partial<Record<Side, vscode.Uri>> = {};

  /** Reads the file list again on the next render. */
  reload(): void {
    this.files = undefined;
    this.changed.fire();
  }

  /** Fills an empty Old slot with the SQL file just opened, unless it is a side of a diff. */
  follow(doc?: vscode.TextDocument): void {
    if (this.picked.old || !doc || doc.uri.scheme !== "file" || !SQL_LANGUAGES.includes(doc.languageId) || diffOf(doc.uri)) return;
    if (!same(doc.uri, this.picked.new)) this.set("old", doc.uri);
  }

  /** Puts a file in a slot, emptying the other slot if it held the same file. */
  set(side: Side, uri: vscode.Uri): void {
    this.picked[side] = uri;
    const other: Side = side === "old" ? "new" : "old";
    if (same(this.picked[other], uri)) this.picked[other] = undefined;
    this.changed.fire();
  }

  private sqlFiles(): Thenable<vscode.Uri[]> {
    this.files ??= vscode.workspace.findFiles("**/*.sql", SKIP).then((fs) => fs.sort((a, b) => a.path.localeCompare(b.path)));
    return this.files;
  }

  /** Asks for a side's file from the workspace's SQL files, the active file first and the other side's left out, and puts it in the slot. */
  async pick(side: Side): Promise<vscode.Uri | undefined> {
    const files = await this.sqlFiles();
    if (!files.length) throw new Error("No SQL files in this workspace.");
    const active = vscode.window.activeTextEditor?.document.uri;
    const other = this.picked[side === "old" ? "new" : "old"];
    const items = files
      .filter((uri) => !same(uri, other))
      .map((uri) => ({ label: base(uri), description: where(uri), uri }))
      .sort((a, b) => +same(b.uri, active) - +same(a.uri, active));
    const chosen = await vscode.window.showQuickPick(items, {
      title: `Compare Files: pick the ${side} one`,
      placeHolder: "Type to search the workspace's SQL files",
      matchOnDescription: true,
    });
    if (chosen) this.set(side, chosen.uri);
    return chosen?.uri;
  }

  /** Asks for both files, then opens them in a diff. */
  async compare(): Promise<void> {
    if ((await this.pick("old")) && (await this.pick("new"))) await this.open();
  }

  /** Opens the two slots' files in a diff, old on the left, asking for any slot still empty. */
  async open(): Promise<void> {
    for (const side of ["old", "new"] as const) if (!this.picked[side] && !(await this.pick(side))) return;
    const { old: left, new: right } = this.picked as Record<Side, vscode.Uri>;
    await vscode.commands.executeCommand("vscode.diff", left, right, `${base(left)} ↔ ${base(right)}`);
  }

  async getChildren(node?: FileNode): Promise<FileNode[]> {
    if (node?.kind === "dir") return node.files.map((uri) => ({ kind: "file", uri }));
    if (node) return [];
    const byDir = new Map<string, vscode.Uri[]>();
    for (const uri of await this.sqlFiles()) byDir.set(where(uri), [...(byDir.get(where(uri)) ?? []), uri]);
    const top: FileNode[] = [
      { kind: "slot", side: "old" },
      { kind: "slot", side: "new" },
    ];
    if (this.picked.old && this.picked.new) top.push({ kind: "open" });
    const dirs = [...byDir].sort(([a], [b]) => a.localeCompare(b));
    return [...top, ...dirs.map(([dir, files]): FileNode => ({ kind: "dir", dir, files }))];
  }

  getTreeItem(node: FileNode): vscode.TreeItem {
    if (node.kind === "slot") {
      const uri = this.picked[node.side];
      const item = new vscode.TreeItem(node.side === "old" ? "Old" : "New");
      item.description = uri ? base(uri) : "pick a file…";
      item.tooltip = uri ? `${vscode.workspace.asRelativePath(uri)}\nClick to pick another file.` : `Pick the ${node.side} file.`;
      item.iconPath = new vscode.ThemeIcon(node.side === "old" ? "arrow-left" : "arrow-right");
      item.command = { command: "cteDiff.files.pick", title: "Pick a File", arguments: [node.side] };
      return item;
    }
    if (node.kind === "open") {
      const item = new vscode.TreeItem("Open the diff");
      item.iconPath = new vscode.ThemeIcon("git-compare");
      item.tooltip = "Open Old and New side by side, then compare their CTEs.";
      item.command = { command: "cteDiff.files.open", title: "Open the Diff" };
      return item;
    }
    if (node.kind === "dir") {
      const holds = node.files.some((uri) => same(uri, this.picked.old) || same(uri, this.picked.new));
      const state = holds ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed;
      const item = new vscode.TreeItem(node.dir === "." ? (vscode.workspace.name ?? ".") : node.dir, state);
      item.iconPath = vscode.ThemeIcon.Folder;
      return item;
    }
    const item = new vscode.TreeItem(node.uri);
    item.iconPath = vscode.ThemeIcon.File;
    item.description = same(node.uri, this.picked.old) ? "old" : same(node.uri, this.picked.new) ? "new" : undefined;
    item.tooltip = `${vscode.workspace.asRelativePath(node.uri)}\n← uses it as Old, → as New.`;
    // Menus in package.json show ← and → on this.
    item.contextValue = "sqlFile";
    item.command = { command: "vscode.open", title: "Open", arguments: [node.uri] };
    return item;
  }
}
