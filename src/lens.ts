/* CodeLens above each CTE (and the final select): Preview, and Compare sides when the file is one side of an open diff. */
import * as vscode from "vscode";
import { parse } from "./cte.ts";

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
    const inDiff = !!diffOf(doc.uri);
    const lenses: vscode.CodeLens[] = [];
    const add = (offset: number, name: string | undefined) => {
      const range = new vscode.Range(doc.positionAt(offset), doc.positionAt(offset));
      const args = [doc.uri, name];
      const title = name ? "▶ Preview" : "▶ Preview query";
      lenses.push(new vscode.CodeLens(range, { title, command: "cteDiff.preview", arguments: args }));
      if (inDiff) lenses.push(new vscode.CodeLens(range, { title: "⇄ Compare sides", command: "cteDiff.compare", arguments: args }));
    };
    for (const c of ctes) add(c.start, c.name);
    // The whole query: on the line after the last CTE, or at the top when there are none.
    const last = ctes.at(-1);
    const finalAt = last ? sql.slice(last.bodyEnd).search(/\S/) : -1;
    if (sql.trim()) add(last && finalAt >= 0 ? last.bodyEnd + finalAt : withStart >= 0 ? withStart : 0, undefined);
    return lenses;
  }
}
