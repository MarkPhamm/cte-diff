import assert from "node:assert/strict";
import { test } from "node:test";
import { compareQuery, cutFrom, dbtError, parseShow, readComparison } from "../src/query.ts";

test("compareQuery wraps each side and diffs both ways", () => {
  const q = compareQuery("with a as (select 1 x) select * from a -- trailing comment", "select 2 x");
  assert.match(q, /select \* from a -- trailing comment\n\) __t\)/, "a trailing comment can't swallow the closing parens");
  assert.match(q, /__only_l as \(select __row from __l except select __row from __r\)/);
  assert.match(q, /__only_r as \(select __row from __r except select __row from __l\)/);
});

/** What dbt renders: `{% if target.type == 'duckdb' %}a{% else %}b{% endif %}` picks a or b. */
const render = (sql: string, type: string) =>
  sql.replace(/{% if target\.type == '(\w+)' %}(.*?){% else %}(.*?){% endif %}/gs, (_, t, a, b) => (t === type ? a : b));

test("compareQuery picks each adapter's SQL", () => {
  const q = compareQuery("select 1 x", "select 2 x");
  const snowflake = render(q, "snowflake");
  const duckdb = render(q, "duckdb");
  assert.doesNotMatch(snowflake + duckdb, /{%/);
  assert.match(snowflake, /to_json\(object_construct_keep_null\(\*\)\)/);
  assert.match(snowflake, /to_json\(object_construct\(/);
  assert.doesNotMatch(snowflake, /json_each|json_object/);
  assert.match(duckdb, /json_each\(to_json\(__t\)\)/);
  assert.match(duckdb, /to_json\(json_object\(/);
  assert.doesNotMatch(duckdb, /object_construct/);
});

test("parseShow reads dbt Fusion's output, logs around it", () => {
  // Captured from dbt 2.0.9: dbt show --inline ... --output json
  const out = `       dbt 2.0.9
   Loading profiles.yml
[{"x":1,"y":"a","z":null},{"x":2,"y":"b,\\"c","z":null}]
 Succeeded model main.inline (ephemeral) [1 of 1 in 2.49s]
`;
  assert.deepEqual(parseShow(out), [
    { x: 1, y: "a", z: null },
    { x: 2, y: 'b,"c', z: null },
  ]);
  assert.deepEqual(parseShow("[]\n"), []);
});

test("parseShow reads dbt-core's multi-line show object", () => {
  const out = `12:00:00  Running with dbt=1.8.0
{
  "node": "inline_query",
  "show": [
    {"ID": 1, "NAME": "[x]"}
  ]
}
12:00:01  Done.`;
  assert.deepEqual(parseShow(out), [{ ID: 1, NAME: "[x]" }]);
  assert.equal(parseShow("[warning] nothing here\n"), undefined);
});

test("dbtError keeps Fusion's error blocks and drops warnings", () => {
  const stderr = `
=================== Errors and Warnings ====================
[warning] [RemoteError (dbt1014)]: Failed to download model schema
[error] [JinjaError (dbt1501)]: Failed to render SQL unknown function
(in target/inline_45a64675.sql:1:8)
  --> target/inline_45a64675.sql:1:8
`;
  assert.equal(
    dbtError("", stderr),
    "[error] [JinjaError (dbt1501)]: Failed to render SQL unknown function\n(in target/inline_45a64675.sql:1:8)\n  --> target/inline_45a64675.sql:1:8",
  );
  assert.equal(dbtError("Compilation Error\n  bad thing", ""), "Compilation Error\n  bad thing");
});

test("readComparison splits counts from rows, whatever the column case", () => {
  const c = readComparison([
    { __K: 0, __SIDE: "counts", __ROW: '{"left":3,"only_left":1,"only_right":2,"right":4}' },
    { __K: 1, __SIDE: "left", __ROW: '{"ID":1}' },
    { __k: 1, __side: "right", __row: '{"ID":2}' },
  ]);
  assert.deepEqual(c.counts, { left: 3, right: 4, only_left: 1, only_right: 2 });
  assert.deepEqual(c.rows, [
    { side: "left", row: { ID: 1 } },
    { side: "right", row: { ID: 2 } },
  ]);
});

test("cutFrom spots a comparison cut by the limit", () => {
  const counts = { left: 500, right: 500, only_left: 150, only_right: 150 };
  const rows = (k: number) => Array.from({ length: k }, () => ({ side: "left" as const, row: {} }));
  assert.equal(cutFrom({ counts, rows: rows(99) }, 100), 300, "limit 100 = the counts row + 99 differing rows");
  assert.equal(cutFrom({ counts: { ...counts, only_left: 1, only_right: 1 }, rows: rows(2) }, 100), undefined);
  assert.equal(cutFrom({ rows: rows(100) }, 100), 100, "without counts, a full result is taken as cut");
  assert.equal(cutFrom({ rows: rows(3) }, 100), undefined);
});
