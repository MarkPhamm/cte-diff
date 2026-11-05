import assert from "node:assert/strict";
import * as path from "node:path";
import { test } from "node:test";
import { findDbt, parseEnv } from "../src/dbt.ts";

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
