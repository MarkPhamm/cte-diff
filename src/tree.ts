/* The CTE Diff sidebar: the CTEs of the SQL in the active editor. When that editor is one side of a diff, every CTE of
 * both sides, marked changed / new / removed / affected (unchanged, but reads one that changed). */
import * as path from "node:path";
import * as vscode from "vscode";
import { compareCtes, parse, sameName, type Status } from "./cte.ts";
import { diffOf } from "./lens.ts";

export const SQL_LANGUAGES = ["sql", "jinja-sql", "snowflake-sql"];

export interface CteNode {
  /** Undefined: the whole query. */
  name?: string;
  status?: Status;
  /** Diff sides holding this CTE; a single file sets `uri` only. */
  left?: vscode.Uri;
  right?: vscode.Uri;
  uri?: vscode.Uri;
}

const LOOK: Record<Status, { icon: string; color?: string; note: string; tip: string }> = {
  changed: { icon: "diff-modified", color: "gitDecoration.modifiedResourceForeground", note: "changed", tip: "Its text changed. ⇄ compares its rows." },
  added: { icon: "diff-added", color: "gitDecoration.addedResourceForeground", note: "new", tip: "Only on the right (new) side. → previews it." },
  removed: { icon: "diff-removed", color: "gitDecoration.deletedResourceForeground", note: "removed", tip: "Only on the left (old) side. ← previews it." },
  affected: {
    icon: "arrow-down",
    color: "gitDecoration.modifiedResourceForeground",
    note: "reads a changed CTE",
    tip: "Same text, but it reads a CTE that changed, so its rows can differ. ⇄ compares them.",
  },
  same: { icon: "circle-small", note: "", tip: "Same text on both sides, reading nothing that changed." },
};

export class CteTree implements vscode.TreeDataProvider<CteNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private nodes: CteNode[] = [];
  private shown: string[] = []; // URIs the nodes come from, to refresh on their edits
  view?: vscode.TreeView<CteNode>;

  /** Re-reads the active editor. Keeps the list when focus moves somewhere that isn't a text editor (the results). */
  async update(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const doc = editor.document;
    const diff = SQL_LANGUAGES.includes(doc.languageId) ? diffOf(doc.uri) : undefined;
    if (diff) {
      const [l, r] = await Promise.all([diff.left, diff.right].map((u) => vscode.workspace.openTextDocument(u)));
      const statuses = compareCtes(l.getText(), r.getText());
      this.nodes = statuses.map(({ name, status }) => ({
        name,
        status,
        left: status === "added" ? undefined : diff.left,
        right: status === "removed" ? undefined : diff.right,
      }));
      this.shown = [diff.left.toString(), diff.right.toString()];
      const count = (s: Status) => statuses.filter((x) => x.status === s).length;
      // The notes are written for one CTE: "2 read a changed CTE".
      const note = (s: Status) => (count(s) > 1 ? LOOK[s].note.replace("reads", "read") : LOOK[s].note);
      const parts = (["changed", "added", "removed", "affected"] as Status[]).filter(count).map((s) => `${count(s)} ${note(s)}`);
      this.describe(path.basename(diff.right.path), parts.length ? parts.join(" · ") : "No CTE changed.");
    } else if (SQL_LANGUAGES.includes(doc.languageId)) {
      this.nodes = [...parse(doc.getText()).ctes.map((c) => ({ name: c.name, uri: doc.uri })), { uri: doc.uri }];
      this.shown = [doc.uri.toString()];
      this.describe(path.basename(doc.uri.path), "Open the file in a diff to compare its CTEs.");
    } else {
      this.nodes = [];
      this.shown = [];
      this.describe(undefined, undefined);
    }
    this.changed.fire();
  }

  shows(uri: vscode.Uri): boolean {
    return this.shown.includes(uri.toString());
  }

  private describe(description: string | undefined, message: string | undefined): void {
    if (!this.view) return;
    this.view.description = description;
    this.view.message = message;
  }

  getChildren(node?: CteNode): CteNode[] {
    return node ? [] : this.nodes;
  }

  getTreeItem(node: CteNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.name ?? "(whole query)");
    if (node.status) {
      const look = LOOK[node.status];
      item.iconPath = new vscode.ThemeIcon(look.icon, look.color ? new vscode.ThemeColor(look.color) : undefined);
      item.description = look.note;
      item.tooltip = look.tip;
    } else {
      item.iconPath = new vscode.ThemeIcon(node.name ? "symbol-namespace" : "symbol-file");
    }
    // Menus in package.json match these words: which sides there are to preview, and whether both are there to compare.
    item.contextValue = node.uri ? "single" : [node.left && "left", node.right && "right"].filter(Boolean).join(" ");
    item.command = { command: "cteDiff.tree.reveal", title: "Go to CTE", arguments: [node] };
    return item;
  }
}

/** Selects the CTE's name (or the final select) in the editor showing it, diff sides included. */
export async function reveal(node: CteNode): Promise<void> {
  const uri = node.right ?? node.uri ?? node.left;
  if (!uri) return;
  const editor =
    vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString()) ??
    (await vscode.window.showTextDocument(uri, { preview: true }));
  const sql = editor.document.getText();
  const ctes = parse(sql).ctes;
  const cte = node.name === undefined ? undefined : ctes.find((c) => sameName(c.name, node.name!));
  let start: number;
  let end: number;
  if (cte) [start, end] = [cte.start, cte.end];
  else {
    const after = ctes.at(-1)?.bodyEnd ?? 0;
    start = end = after + Math.max(0, sql.slice(after).search(/\S/));
  }
  const range = new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(end));
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}
