// Runs inside VS Code (see run.mjs): a diff of old.sql and new.sql gets CodeLens on both sides and fills the sidebar.
import assert from "node:assert/strict";
import * as fs from "node:fs";
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
  // The results view's sort script, which src/panel.ts loads from out/.
  assert.ok(fs.existsSync(path.join(ext.extensionPath, "out", "view.js")), "out/view.js is built");

  const lenses = await until(async () => {
    const l = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", left);
    return l?.some((x) => x.command?.title === "⇄ Compare sides") && l;
  }, "Compare sides lenses on the left side");
  assert.deepEqual(
    lenses.map((l) => `${l.range.start.line}:${l.command?.title}`),
    // `gone` is only on the left: it can be previewed, not compared.
    ["0:▶ Preview", "0:⇄ Compare sides", "1:▶ Preview", "1:⇄ Compare sides", "2:▶ Preview", "3:▶ Preview query", "3:⇄ Compare sides"],
  );

  const nodes = await until(() => tree.getChildren().length === 6 && tree.getChildren(), "the sidebar to list both sides");
  assert.deepEqual(
    nodes.map((n) => [n.compiled ? "Compare Compiled SQL" : (n.name ?? "(whole query)"), n.status, tree.getTreeItem(n).contextValue]),
    [
      ["Compare Compiled SQL", undefined, "compiled"],
      ["a", "same", "left right"],
      ["b", "changed", "left right"],
      ["new_one", "added", "right"],
      ["gone", "removed", "left"],
      ["(whole query)", "affected", "left right"],
    ],
  );
  assert.equal(tree.getTreeItem(nodes[0]).command?.command, "cteDiff.compareCompiled");
  assert.equal(tree.view?.message, "1 changed · 1 new · 1 removed · 1 reads a changed CTE");
  assert.match(String(tree.getTreeItem(nodes[5]).tooltip), /reads a CTE that changed/);
  const commands = await vscode.commands.getCommands(true);
  for (const c of ["cteDiff.compareCte", "cteDiff.compareCompiled", "cteDiff.previewCte", "cteDiff.previewSubquery", "cteDiff.previewBranch", "cteDiff.tree.previewSubquery", "cteDiff.rerun", "cteDiff.showLog", "cteDiff.checkSetup", "cteDiff.chooseProject"]) {
    assert.ok(commands.includes(c), c);
  }

  // Clicking a CTE selects its name in the diff's right side.
  await vscode.commands.executeCommand("cteDiff.tree.reveal", nodes[2]);
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === right.toString())!;
  assert.equal(editor.document.getText(editor.selection), "b");

  // A plain SQL file lists its CTEs for preview only.
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ language: "sql", content: "with x as (select 1) select * from x" }));
  const single = await until(() => tree.getChildren().length === 2 && tree.getChildren(), "the sidebar to follow the editor");
  assert.deepEqual(single.map((n) => tree.getTreeItem(n).contextValue), ["single", "single"]);

  // A CTE inside another CTE's WITH gets a Preview lens, with the names holding it, and shows under its holder.
  const nestedDoc = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "with h as (\n  with i as (select 1 id)\n  select * from i\n)\nselect * from h",
  });
  await vscode.window.showTextDocument(nestedDoc);
  const nestedLens = await until(async () => {
    const l = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", nestedDoc.uri);
    return l?.find((x) => x.range.start.line === 1 && x.command?.title === "▶ Preview");
  }, "a lens on the nested CTE");
  assert.deepEqual(nestedLens.command?.arguments?.slice(1), ["i", ["h"]]);
  const holder = await until(() => tree.getChildren().find((n) => n.name === "h" && n.children?.length), "the sidebar to list h");
  assert.equal(tree.getTreeItem(holder).collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
  const [inner] = tree.getChildren(holder);
  assert.deepEqual([inner.name, inner.path, tree.getTreeItem(inner).contextValue], ["i", ["h"], "single"]);

  // A subquery gets its own Preview lens, which carries the offset the command turns into a query.
  const subDoc = await vscode.workspace.openTextDocument({
    language: "sql",
    content: "with x as (select 1 id) select * from x where exists (select 1 from y where y.id = x.id)",
  });
  await vscode.window.showTextDocument(subDoc);
  const subLens = await until(async () => {
    const l = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", subDoc.uri);
    return l?.find((x) => x.command?.title === "▶ Preview subquery");
  }, "a subquery lens");
  assert.equal(subLens.command?.command, "cteDiff.previewSubquery");
  assert.equal(typeof subLens.command?.arguments?.[1], "number");
  // Each branch of a UNION gets a Preview lens too.
  const unionDoc = await vscode.workspace.openTextDocument({ language: "sql", content: "select 1 a\nunion all\nselect 2 a" });
  const branchLenses = await until(async () => {
    const l = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", unionDoc.uri);
    const found = l?.filter((x) => x.command?.title === "▶ Preview branch");
    return found?.length === 2 && found;
  }, "a lens on each union branch");
  assert.deepEqual(branchLenses.map((l) => [l.range.start.line, l.command?.command]), [[0, "cteDiff.previewBranch"], [2, "cteDiff.previewBranch"]]);
  await vscode.window.showTextDocument(subDoc);
  // The sidebar lists it under the whole query, with a button to preview it.
  const subs = await until(() => {
    const whole = tree.getChildren().find((n) => n.name === undefined);
    const found = whole ? tree.getChildren(whole) : [];
    return found.length === 1 && found;
  }, "the sidebar to list the subquery");
  assert.equal(tree.getTreeItem(subs[0]).contextValue, "subquery");
  assert.equal(tree.getTreeItem(subs[0]).command?.command, "cteDiff.tree.reveal");

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

  // In a diff, a nested CTE is listed under its holder with its own status, and both sides get Compare sides on it.
  const [oldNested, newNested] = await Promise.all(
    ["where id > 0", "where id > 1"].map((w) =>
      vscode.workspace.openTextDocument({ language: "sql", content: `with h as (\n  with i as (select 1 id),\n  j as (select * from i ${w})\n  select * from j\n)\nselect * from h` }),
    ),
  );
  await vscode.commands.executeCommand("vscode.diff", oldNested.uri, newNested.uri, "nested old ↔ new");
  const h = await until(() => tree.getChildren().find((n) => n.name === "h" && n.status === "changed"), "the sidebar to list the nested diff");
  assert.deepEqual(
    tree.getChildren(h).map((n) => [n.name, n.path, n.status, tree.getTreeItem(n).contextValue]),
    [
      ["i", ["h"], "same", "left right"],
      ["j", ["h"], "changed", "left right"],
    ],
  );
  const nestedCompare = await until(async () => {
    const l = await vscode.commands.executeCommand<vscode.CodeLens[]>("vscode.executeCodeLensProvider", oldNested.uri);
    return l?.find((x) => x.range.start.line === 2 && x.command?.title === "⇄ Compare sides");
  }, "Compare sides on the nested CTE");
  assert.deepEqual(nestedCompare.command?.arguments?.slice(1), ["j", ["h"]]);
}
