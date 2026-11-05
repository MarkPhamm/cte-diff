// Runs inside VS Code (see run.mjs): a diff of old.sql and new.sql gets CodeLens on both sides and fills the sidebar.
import assert from "node:assert/strict";
import * as path from "node:path";
import * as vscode from "vscode";
import type { FilesTree } from "../../src/files.ts";
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
  const { tree, files } = (await ext.activate()) as { tree: CteTree; files: FilesTree };

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
  assert.match(String(tree.getTreeItem(nodes[4]).tooltip), /reads a CTE that changed/);
  const commands = await vscode.commands.getCommands(true);
  for (const c of ["cteDiff.compareCte", "cteDiff.previewCte", "cteDiff.rerun", "cteDiff.showLog"]) assert.ok(commands.includes(c), c);

  // Clicking a CTE selects its name in the diff's right side.
  await vscode.commands.executeCommand("cteDiff.tree.reveal", nodes[1]);
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === right.toString())!;
  assert.equal(editor.document.getText(editor.selection), "b");

  // A plain SQL file lists its CTEs for preview only.
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: "sql", content: "with x as (select 1) select * from x" }));
  const single = await until(() => tree.getChildren().length === 2 && tree.getChildren(), "the sidebar to follow the editor");
  assert.deepEqual(single.map((n) => tree.getTreeItem(n).contextValue), ["single", "single"]);

  // Compare Two Files… lists the workspace's SQL files and opens the two picked in a diff, the first picked on the left.
  const ask = vscode.window.showQuickPick;
  const picks = [left, right];
  const offered: string[][] = [];
  Object.assign(vscode.window, {
    showQuickPick: async (items: { description: string; label: string; uri: vscode.Uri }[]) => {
      offered.push(items.map((i) => `${i.description}/${i.label}`));
      const want = picks.shift()!.toString();
      return items.find((i) => i.uri.toString() === want);
    },
  });
  try {
    await vscode.commands.executeCommand("cteDiff.compareFiles");
  } finally {
    Object.assign(vscode.window, { showQuickPick: ask });
  }
  assert.deepEqual(offered, [["models/new.sql", "models/old.sql"], ["models/new.sql"]]);
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  assert.ok(input instanceof vscode.TabInputTextDiff, "a diff is open");
  assert.deepEqual([input.original.toString(), input.modified.toString()], [left.toString(), right.toString()]);

  // The sidebar's Compare Files shows the picks in its Old and New slots, and the SQL files by folder, marked old and new.
  const rows = async () =>
    (await files.getChildren()).map((n) => {
      const item = files.getTreeItem(n);
      return `${item.label}:${item.description ?? ""}`;
    });
  assert.deepEqual(await rows(), ["Old:old.sql", "New:new.sql", "Open the diff:", "models:"]);
  const dir = (await files.getChildren()).find((n) => n.kind === "dir")!;
  assert.deepEqual(
    (await files.getChildren(dir)).map((n) => files.getTreeItem(n)).map((i) => [path.basename(i.resourceUri!.path), i.description, i.contextValue]),
    [
      ["new.sql", "new", "sqlFile"],
      ["old.sql", "old", "sqlFile"],
    ],
  );
  // ← on the New file moves it to Old and empties New.
  await vscode.commands.executeCommand("cteDiff.files.setOld", { kind: "file", uri: right });
  assert.deepEqual(await rows(), ["Old:new.sql", "New:pick a file…", "models:"]);
}
