/* CodeLens above each CTE (and the final select): Preview, and Compare sides when the file is one side of an open diff
 * and the CTE is on both sides. A CTE inside another CTE's WITH gets the same; each subquery, and each branch of a UNION,
 * gets a Preview too. */
import * as vscode from "vscode";
import { branches, findCte, nestedCtes, parse, subqueries } from "./cte.ts";

/** Which side of an open diff editor `uri` is on, and the other side's URI. */
export function diffOf(uri: vscode.Uri): { left: vscode.Uri; right: vscode.Uri } | undefined {
  const key = uri.toString();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputTextDiff && (input.original.toString() === key || input.modified.toString() === key)) {
        return { left: input.original, right: input.modified };
      }
    }
  }
  return undefined;
}

export class CteLens implements vscode.CodeLensProvider {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  refresh(): void {
    this.changed.fire();
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const sql = doc.getText();
    const { withStart, ctes } = parse(sql);
    const diff = diffOf(doc.uri);
    const otherUri = diff && (diff.left.toString() === doc.uri.toString() ? diff.right : diff.left).toString();
    const other = vscode.workspace.textDocuments.find((d) => d.uri.toString() === otherUri);
    // Compare needs the CTE on both sides. When the other side isn't loaded yet, offer it anyway.
    const otherSql = other?.getText();
    const onBoth = (name?: string, path: string[] = []) => otherSql === undefined || name === undefined || findCte(otherSql, name, path) !== undefined;
    const lenses: vscode.CodeLens[] = [];
    const add = (offset: number, name: string | undefined, path: string[] = []) => {
      const range = new vscode.Range(doc.positionAt(offset), doc.positionAt(offset));
      const args = [doc.uri, name, path];
      const title = name ? "▶ Preview" : "▶ Preview query";
      lenses.push(new vscode.CodeLens(range, { title, command: "cteDiff.preview", arguments: args }));
      if (diff && onBoth(name, path)) lenses.push(new vscode.CodeLens(range, { title: "⇄ Compare sides", command: "cteDiff.compare", arguments: args }));
    };
    for (const c of ctes) add(c.start, c.name);
    for (const c of nestedCtes(sql)) add(c.start, c.name, c.path);
    // A correlated subquery needs the query around it to resolve what it reads; the command adds that context.
    for (const s of subqueries(sql)) {
      const range = new vscode.Range(doc.positionAt(s.start), doc.positionAt(s.start));
      lenses.push(new vscode.CodeLens(range, { title: "▶ Preview subquery", command: "cteDiff.previewSubquery", arguments: [doc.uri, s.start] }));
    }
    for (const b of branches(sql)) {
      const range = new vscode.Range(doc.positionAt(b.start), doc.positionAt(b.start));
      lenses.push(new vscode.CodeLens(range, { title: "▶ Preview branch", command: "cteDiff.previewBranch", arguments: [doc.uri, b.start] }));
    }
    // The whole query: on the line after the last CTE, or at the top when there are none.
    const last = ctes.at(-1);
    const finalAt = last ? sql.slice(last.bodyEnd).search(/\S/) : -1;
    if (sql.trim()) add(last && finalAt >= 0 ? last.bodyEnd + finalAt : withStart >= 0 ? withStart : 0, undefined);
    return lenses;
  }
}
