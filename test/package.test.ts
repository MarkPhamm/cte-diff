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
  for (const f of [pkg.main, pkg.icon].map((f: string) => path.normalize(f).replace(/\\/g, "/"))) {
    assert.ok(fs.existsSync(path.join(root, f)) || f.startsWith("out/"), `${f} exists`);
    assert.ok(shipped(f), `${f} is listed in .vscodeignore`);
  }
});

test("every command the lenses run is contributed", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const contributed = pkg.contributes.commands.map((c: { command: string }) => c.command);
  const used = [...fs.readFileSync(path.join(root, "src/lens.ts"), "utf8").matchAll(/command: "([\w.]+)"/g)].map((m) => m[1]);
  assert.ok(used.length > 0);
  for (const c of used) assert.ok(contributed.includes(c), c);
});
