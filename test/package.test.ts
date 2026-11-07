import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

const root = path.join(import.meta.dirname, "..");

/** `.vscodeignore` ignores everything (`**`) and lists what ships with `!`. */
function shipped(file: string): boolean {
  const rules = fs
    .readFileSync(path.join(root, ".vscodeignore"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("!"))
    .map((l) => l.slice(1).trim());
  return rules.includes(file);
}

test("every file package.json points at ships in the .vsix", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const walkthrough = pkg.contributes.walkthroughs.flatMap((w: { steps: { media: Record<string, unknown> }[] }) =>
    w.steps.map((s) => s.media.image ?? s.media.markdown),
  );
  const files = [pkg.main, pkg.icon, ...pkg.contributes.viewsContainers.activitybar.map((v: { icon: string }) => v.icon), ...walkthrough];
  for (const f of files.map((f: string) => path.normalize(f).replace(/\\/g, "/"))) {
    assert.ok(fs.existsSync(path.join(root, f)) || f.startsWith("out/"), `${f} exists`);
    assert.ok(shipped(f), `${f} is listed in .vscodeignore`);
  }
});

test("examples/duckdb is the site's sample", async () => {
  const { before, after } = await import("../web/sample.ts");
  const model = (f: string) => fs.readFileSync(path.join(root, "examples", "duckdb", "models", f), "utf8");
  assert.equal(model("orders.sql"), before);
  assert.equal(model("orders_v2.sql"), after);
});

test("every command the code runs is contributed", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const contributed = pkg.contributes.commands.map((c: { command: string }) => c.command);
  const src = ["lens.ts", "tree.ts", "files.ts", "extension.ts"].map((f) => fs.readFileSync(path.join(root, "src", f), "utf8")).join("\n");
  const used = [...src.matchAll(/(?:command: |registerCommand\()"([\w.]+)"/g)].map((m) => m[1]).filter((c) => !c.startsWith("vscode.")); // VS Code's own commands
  assert.ok(used.length > 0);
  for (const c of used) assert.ok(contributed.includes(c), c);
});
