import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test } from "node:test";
import { compile, debug, findDbt, parseEnv, show } from "../src/dbt.ts";

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
