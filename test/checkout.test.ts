import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, test } from "node:test";
import { inCopy } from "../src/checkout.ts";

const roots: string[] = [];
after(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

/** A repository holding a dbt project in proj/, committed on main and branch qa, with gitignored packages. */
function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cte-diff-test-"));
  roots.push(root);
  const proj = path.join(root, "proj");
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(proj, file)), { recursive: true });
    fs.writeFileSync(path.join(proj, file), text);
  };
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd: proj, stdio: "pipe" });
  write("dbt_project.yml", "name: p\n");
  write("macros/cents.sql", "v1");
  write("models/orders.sql", "select 1");
  write(".gitignore", "dbt_packages/\n");
  write("profiles.yml", "the branch's own profile");
  write("dbt_packages/pkg/m.sql", "pkg");
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  git("add", "-A");
  git("commit", "-qm", "one");
  git("branch", "qa");
  const file = path.join(proj, "models", "orders.sql");
  const side = (ref: string, scheme = "git") => ({ scheme, query: JSON.stringify({ path: file, ref }), fsPath: file });
  const copy = (ref: string, scheme?: string) =>
    inCopy(side(ref, scheme), { dbt: "dbt", projectDir: proj }, async (dir) => ({ dir, macro: fs.readFileSync(path.join(dir, "macros", "cents.sql"), "utf8") }));
  return { proj, write, git, copy };
}

test("inCopy copies nothing when the project differs from the ref in the file itself or not at all", async () => {
  const { write, copy } = repo();
  assert.equal(await copy("qa"), undefined);
  write(".user.yml", "id: 1"); // dbt writes it beside profiles.yml
  write("models/orders.sql", "select 2");
  assert.equal(await copy("qa"), undefined);
  assert.equal(await copy("~"), undefined);
  write("macros/cents.sql", "v2");
  assert.equal(await copy("qa", "file"), undefined);
  assert.equal(await copy("no-such-branch"), undefined);
  assert.equal(await copy("--output=x"), undefined);
});

test("inCopy runs on the project as the ref has it when a macro differs, then removes the copy", async () => {
  const { proj, write, git, copy } = repo();
  write("macros/cents.sql", "v2");
  const got = await copy("qa");
  assert.equal(got?.macro, "v1");
  assert.equal(path.basename(got.dir), "proj");
  assert.equal(fs.existsSync(got.dir), false);
  assert.equal(fs.readFileSync(path.join(proj, "dbt_packages", "pkg", "m.sql"), "utf8"), "pkg"); // the link went, not the packages
  assert.equal((await copy("~"))?.macro, "v1"); // the index, as a Source Control diff shows it
  git("add", "macros/cents.sql");
  assert.equal(await copy("~"), undefined);
  assert.equal((await copy("HEAD"))?.macro, "v1");
});

test("inCopy links the open project's packages, drops the ref's profiles.yml and counts an untracked macro", async () => {
  const { proj, write } = repo();
  write("macros/new.sql", "new");
  const got = await inCopy(
    { scheme: "git", query: JSON.stringify({ ref: "qa" }), fsPath: path.join(proj, "models", "orders.sql") },
    { dbt: "dbt", projectDir: proj },
    async (dir) => [
      fs.readFileSync(path.join(dir, "dbt_packages", "pkg", "m.sql"), "utf8"),
      fs.existsSync(path.join(dir, "profiles.yml")),
      fs.existsSync(path.join(dir, "macros", "new.sql")),
    ],
  );
  assert.deepEqual(got, ["pkg", false, false]);
});

test("inCopy removes the copy when the run fails", async () => {
  const { proj, write } = repo();
  write("macros/cents.sql", "v2");
  let dir = "";
  const fail = async (d: string) => {
    dir = d;
    throw new Error("dbt failed");
  };
  await assert.rejects(inCopy({ scheme: "git", query: JSON.stringify({ ref: "qa" }), fsPath: path.join(proj, "x.sql") }, { dbt: "dbt", projectDir: proj }, fail), /dbt failed/);
  assert.ok(dir && !fs.existsSync(dir));
});
