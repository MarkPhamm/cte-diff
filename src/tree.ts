/* The CTE Diff sidebar: the CTEs of the SQL in the active editor, each with the CTEs of its own WITH and its
 * subqueries. When that editor is one
 * side of a diff, every CTE of both sides, marked changed / new / removed / affected (unchanged, but reads one that
 * changed). */
import * as path from "node:path";
import * as vscode from "vscode";
import { compareCtes, findCte, innerCtes, parse, sameName, subqueries, type Cte, type CteStatus, type Status } from "./cte.ts";
import { diffOf } from "./lens.ts";

export const SQL_LANGUAGES = ["sql", "jinja-sql", "snowflake-sql"];

export interface CteNode {
  /** Undefined: the whole query. */
  name?: string;
  /** Names of the CTEs holding a nested CTE, outermost first. */
  path?: string[];
  status?: Status;
  /** Diff sides holding this CTE; a single file sets `uri` only. */
  left?: vscode.Uri;
  right?: vscode.Uri;
  uri?: vscode.Uri;
  /** The list's action row: compare both sides' compiled SQL. Not a CTE. */
  compiled?: boolean;
  /** A subquery under its CTE (or the final query). */
  subquery?: boolean;
  /** The subquery's first offset, and the offset of its closing parenthesis. */
  start?: number;
  end?: number;
  children?: CteNode[];
}

/** The subqueries of one CTE (`-1` is the final query), labelled by the line they start on. */
function childNodes(sql: string, uri: vscode.Uri, cte: number, side?: "old" | "new"): CteNode[] {
  const lineOf = (offset: number) => sql.slice(0, offset).split(/\r?\n/).length;
  return subqueries(sql)
    .filter((s) => s.cte === cte)
    .map((s) => ({ name: `subquery at line ${lineOf(s.start)}${side ? ` (${side})` : ""}`, uri, subquery: true, start: s.start, end: s.close }));
}

/** The CTEs of `holder`'s own WITH, each with its own nested ones under it. */
function nestedNodes(sql: string, uri: vscode.Uri, holder: Cte, path: string[]): CteNode[] {
  return innerCtes(sql, holder).map((c) => ({ name: c.name, path, uri, children: nestedNodes(sql, uri, c, [...path, c.name]) }));
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
      const [leftSql, rightSql] = [l.getText(), r.getText()];
      const leftCtes = parse(leftSql).ctes;
      const rightCtes = parse(rightSql).ctes;
      const childrenOf = (name: string | undefined, status: Status): CteNode[] => {
        const i = name === undefined ? -1 : leftCtes.findIndex((c) => sameName(c.name, name));
        const j = name === undefined ? -1 : rightCtes.findIndex((c) => sameName(c.name, name));
        // A new CTE has no old side, a removed one no new side. A changed or affected one shows both sides, whose rows
        // can differ; an unchanged one shows one side, so its subqueries don't all appear twice.
        const old = status === "changed" || status === "affected" || status === "removed";
        const now = status !== "removed";
        return [
          ...(old ? childNodes(leftSql, diff.left, i, "old") : []),
          ...(now ? childNodes(rightSql, diff.right, j, "new") : []),
        ];
      };
      // Nested CTEs go under their holder, before its subqueries, which stay with the top-level CTE.
      const toNode = ({ name, status, nested }: CteStatus, path: string[]): CteNode => ({
        name,
        path,
        status,
        left: status === "added" ? undefined : diff.left,
        right: status === "removed" ? undefined : diff.right,
        children: [...(nested ?? []).map((n) => toNode(n, [...path, name!])), ...(path.length ? [] : childrenOf(name, status))],
      });
      this.nodes = [{ compiled: true }, ...statuses.map((s) => toNode(s, []))];
      this.shown = [diff.left.toString(), diff.right.toString()];
      const count = (s: Status) => statuses.filter((x) => x.status === s).length;
      // The notes are written for one CTE: "2 read a changed CTE".
      const note = (s: Status) => (count(s) > 1 ? LOOK[s].note.replace("reads", "read") : LOOK[s].note);
      const parts = (["changed", "added", "removed", "affected"] as Status[]).filter(count).map((s) => `${count(s)} ${note(s)}`);
      this.describe(path.basename(diff.right.path), parts.length ? parts.join(" · ") : "No CTE changed.");
    } else if (SQL_LANGUAGES.includes(doc.languageId)) {
      const sql = doc.getText();
      this.nodes = [
        ...parse(sql).ctes.map((c, i) => ({
          name: c.name,
          uri: doc.uri,
          children: [...nestedNodes(sql, doc.uri, c, [c.name]), ...childNodes(sql, doc.uri, i)],
        })),
        { uri: doc.uri, children: childNodes(sql, doc.uri, -1) },
      ];
      this.shown = [doc.uri.toString()];
      this.describe(path.basename(doc.uri.path), "Open the file in a diff to compare its CTEs.");
    } else {
      this.nodes = [];
      this.shown = [];
      this.describe(undefined, undefined);
    }
    // The sidebar's title button follows this list, which stays a diff when the sidebar takes focus.
    void vscode.commands.executeCommand("setContext", "cteDiff.inDiff", diff !== undefined);
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
    return node ? (node.children ?? []) : this.nodes;
  }

  getTreeItem(node: CteNode): vscode.TreeItem {
    if (node.compiled) {
      const item = new vscode.TreeItem("Compare Compiled SQL");
      item.tooltip = "Diff what dbt renders for each side. Nothing runs on the warehouse.";
      item.contextValue = "compiled";
      item.command = { command: "cteDiff.compareCompiled", title: "Compare Compiled SQL" };
      return item;
    }
    if (node.subquery) {
      const item = new vscode.TreeItem(node.name ?? "subquery");
      item.iconPath = new vscode.ThemeIcon("symbol-method");
      item.contextValue = "subquery";
      item.tooltip =
        "Preview this subquery's rows. A correlated one runs with the outer tables it reads, so its references resolve.";
      item.command = { command: "cteDiff.tree.reveal", title: "Go to Subquery", arguments: [node] };
      return item;
    }
    // Open when it holds CTEs, so nested ones show; folded when it only has subqueries.
    const kids = node.children ?? [];
    const fold = !kids.length
      ? vscode.TreeItemCollapsibleState.None
      : kids.some((k) => !k.subquery)
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed;
    const item = new vscode.TreeItem(node.name ?? "(whole query)", fold);
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

/** Selects the CTE's name (or the final select, or a subquery) in the editor showing it, diff sides included. */
export async function reveal(node: CteNode): Promise<void> {
  const uri = node.right ?? node.uri ?? node.left;
  if (!uri) return;
  const editor =
    vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uri.toString()) ??
    (await vscode.window.showTextDocument(uri, { preview: true }));
  const sql = editor.document.getText();
  if (node.subquery && node.start !== undefined && node.end !== undefined) {
    const range = new vscode.Range(editor.document.positionAt(node.start), editor.document.positionAt(node.end));
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    return;
  }
  const ctes = parse(sql).ctes;
  const cte = node.name === undefined ? undefined : findCte(sql, node.name, node.path)?.cte;
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
