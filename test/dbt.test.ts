import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { compile, debug, envFor, findDbt, parseEnv, show } from "../src/dbt.ts";

test("parseEnv reads the usual .env shapes", () => {
  const env = parseEnv(`# profile values
export DBT_ENV_NAME=dev
SNOWFLAKE_ROLE = "TRANSFORMER"
KEY_PASSPHRASE='a b#c'
WAREHOUSE=WH # trailing comment
EMPTY=
not a line`);
  assert.deepEqual(env, { DBT_ENV_NAME: "dev", SNOWFLAKE_ROLE: "TRANSFORMER", KEY_PASSPHRASE: "a b#c", WAREHOUSE: "WH", EMPTY: "" });
});

test("findDbt: the setting wins, else plain dbt when nothing is installed where it looks", () => {
  assert.equal(findDbt("/x/dbt", []), "/x/dbt");
  const none = path.join(import.meta.dirname, "no-such-home");
  assert.equal(findDbt("", [none], "linux", none).endsWith("dbt"), true);
});

test("envFor never makes a copy's own profiles.yml the profile, unless the user set DBT_PROFILES_DIR", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cte-diff-"));
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), "cte-diff-"));
  const set = process.env.DBT_PROFILES_DIR;
  delete process.env.DBT_PROFILES_DIR;
  try {
    fs.writeFileSync(path.join(copy, "profiles.yml"), "a branch's profile");
    assert.equal(envFor(copy, home).DBT_PROFILES_DIR, path.join(os.homedir(), ".dbt"));
    fs.writeFileSync(path.join(home, "profiles.yml"), "the user's profile");
    assert.equal(envFor(copy, home).DBT_PROFILES_DIR, home);
    assert.equal(envFor(home).DBT_PROFILES_DIR, undefined); // in place, dbt looks as it does in a terminal
    fs.writeFileSync(path.join(home, ".env"), "DBT_PROFILES_DIR=/mine\n");
    assert.equal(envFor(copy, home).DBT_PROFILES_DIR, "/mine");
  } finally {
    if (set !== undefined) process.env.DBT_PROFILES_DIR = set;
    for (const d of [home, copy]) fs.rmSync(d, { recursive: true });
  }
});

test("show, compile and debug end with --target and cteDiff.dbtArgs", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cte-diff-"));
  try {
    // A fake dbt that prints its arguments where show, compile and debug each read dbt's output.
    const dbt = path.join(dir, "dbt");
    const script = "const a = process.argv.slice(2); console.log(JSON.stringify({ show: a, data: { compiled: JSON.stringify(a) } }));";
    fs.writeFileSync(dbt, `#!${process.execPath}\n${script}\n`, { mode: 0o755 });
    const logged: string[] = [];
    const o = { dbt, projectDir: dir, limit: 5, target: "dev", dbtArgs: ["--vars", "{x: 42}"], log: (l: string) => logged.push(l) };
    const tail = ["--target", "dev", "--vars", "{x: 42}"];
    assert.deepEqual(await show("select 1", o), ["show", "-q", "--inline", "select 1", "--output", "json", "--limit", "5", ...tail]);
    assert.match(logged[0], /&& \S+ show -q --inline <sql> --output json --limit 5 --target dev --vars \{x: 42\}\n/);
    assert.deepEqual(JSON.parse(await compile("select 1", o)), ["compile", "--inline", "select 1", "--log-format", "json", ...tail]);
    assert.deepEqual(JSON.parse((await debug(o)).output).show, ["debug", ...tail]);
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test("show gives the query's size when it is too long for the command line", async () => {
  // 2 MiB: over Linux's 128 KiB for one argument and macOS's 1 MiB for all of them.
  const sql = "x".repeat(2048 * 1024);
  await assert.rejects(show(sql, { dbt: process.execPath, projectDir: import.meta.dirname, limit: 1 }), /the query is 2048 KiB/);
});
