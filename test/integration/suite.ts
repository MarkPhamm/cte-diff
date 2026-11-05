// Runs inside VS Code (see run.mjs): a diff of old.sql and new.sql gets CodeLens on both sides and fills the sidebar.
import assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";
import type { CteTree } from "../../src/tree.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until<T>(f: () => T | false | undefined | Promise<T | false | undefined>, what: string): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const v = await f();
    if (v) return v;
    await wait(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

export async function run(): Promise<void> {
  const ws = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const [left, right] = ["old.sql", "new.sql"].map((f) => vscode.Uri.file(path.join(ws, "models", f)));
  const ext = vscode.extensions.getExtension("MarkPhamm.cte-diff")!;
  await vscode.commands.executeCommand("vscode.diff", left, right, "old ↔ new");
  const { tree } = (await ext.activate()) as { tree: CteTree };

  const lenses = await until(async () => {
    const l = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", left);
    return l?.some((x) => x.command?.title === "⇄ Compare sides") && l;
  }, "Compare sides lenses on the left side");
  assert.deepEqual(
    lenses.map((l) => `${l.range.start.line}:${l.command?.title}`),
    ["0:▶ Preview", "0:⇄ Compare sides", "1:▶ Preview", "1:⇄ Compare sides", "2:▶ Preview", "2:⇄ Compare sides", "3:▶ Preview query", "3:⇄ Compare sides"],
  );

  const nodes = await until(() => tree.getChildren().length === 5 && tree.getChildren(), "the sidebar to list both sides");
  assert.deepEqual(
    nodes.map((n) => [n.name ?? "(whole query)", n.status, tree.getTreeItem(n).contextValue]),
    [
      ["a", "same", "left right"],
      ["b", "changed", "left right"],
      ["new_one", "added", "right"],
      ["gone", "removed", "left"],
      ["(whole query)", "affected", "left right"],
    ],
  );
  assert.equal(tree.view?.message, "1 changed · 1 new · 1 removed · 1 reads a changed CTE");

  // Clicking a CTE selects its name in the diff's right side.
  await vscode.commands.executeCommand("cteDiff.tree.reveal", nodes[1]);
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === right.toString())!;
  assert.equal(editor.document.getText(editor.selection), "b");

  // A plain SQL file lists its CTEs for preview only.
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: "sql", content: "with x as (select 1) select * from x" }));
  const single = await until(() => tree.getChildren().length === 2 && tree.getChildren(), "the sidebar to follow the editor");
  assert.deepEqual(single.map((n) => tree.getTreeItem(n).contextValue), ["single", "single"]);
}
