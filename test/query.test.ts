import assert from "node:assert/strict";
import { test } from "node:test";
import { compareQuery, cutFrom, dbtError, forAdapter, pairRows, parseCompiled, parseShow, readComparison, unsupported, type Comparison, type Row } from "../src/query.ts";

test("compareQuery wraps each side and diffs both ways", () => {
  const q = compareQuery("with a as (select 1 x) select * from a -- trailing comment", "select 2 x");
  assert.match(q, /select \* from a -- trailing comment\n\) AS __t\)/, "a trailing comment can't swallow the closing parens");
  assert.match(q, /__only_l as \(select __row from __l except select __row from __r\)/);
  assert.match(q, /__only_r as \(select __row from __r except select __row from __l\)/);
});

test("compareQuery picks each adapter's SQL", () => {
  const q = compareQuery("select 1 x", "select 2 x");
  const snowflake = forAdapter(q, "snowflake");
  const duckdb = forAdapter(q, "duckdb");
  const bigquery = forAdapter(q, "bigquery");
  const redshift = forAdapter(q, "redshift");
  assert.doesNotMatch(snowflake + duckdb + bigquery + redshift, /{%/);
  assert.match(snowflake, /to_json\(object_construct_keep_null\(\*\)\)/);
  assert.match(snowflake, /to_json\(object_construct\(/);
  assert.doesNotMatch(snowflake, /json_each|json_object/);
  assert.match(duckdb, /json_each\(to_json\(__t\)\)/);
  assert.match(duckdb, /to_json\(json_object\(/);
  assert.doesNotMatch(duckdb, /object_construct/);
  assert.match(bigquery, /TO_JSON_STRING\(__t\)/);
  assert.match(bigquery, /TO_JSON_STRING\(STRUCT\(\(select count\(\*\) from __l\) AS `left`.*\)\)/);
  assert.match(bigquery, /except distinct/);
  assert.doesNotMatch(bigquery, /object_construct|json_each|::varchar/);
  // Redshift has no row-to-JSON: the differing rows come back raw, with a __side marker and no counts row.
  assert.match(redshift, /select \* from __l except select \* from __r/);
  assert.match(redshift, /'left' as __side/);
  assert.doesNotMatch(redshift, /__row|counts|TO_JSON_STRING/);
});

test("compareQuery raises a plain error on a warehouse it has no SQL for", () => {
  const postgres = forAdapter(compareQuery("select 1 x", "select 2 x"), "postgres");
  assert.doesNotMatch(postgres, /{%|object_construct|json_each/);
  assert.match(postgres, /{{ exceptions\.raise_compiler_error\("CTE Diff: Compare has no SQL for " ~ target\.type\) }}/);
  // As dbt-core prints the raised error.
  assert.equal(unsupported("Compilation Error in sql_operation inline_query\n  CTE Diff: Compare has no SQL for postgres"), "postgres");
  assert.equal(unsupported("Database Error: syntax error at or near 'except'"), undefined);
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

test("parseCompiled reads the CompiledNode event dbt-core and Fusion print", () => {
  const sql = 'select * from "example"."main"."orders"\nwhere status = \'success\'';
  // Captured from dbt-core 1.12.6 and dbt Fusion 2.0.9: dbt compile --inline ... --log-format json
  const event = (info: object, data?: object) => JSON.stringify({ ...(data ? { data } : {}), info });
  const core = `${event(
    { code: "Q042", name: "CompiledNode", msg: `Compiled inline node is:\n${sql}` },
    { compiled: sql, is_inline: true, node_name: "inline_query" },
  )}\n`;
  assert.equal(parseCompiled(core), sql);
  // Without the event's data, the message carries it, as dbt 1.5 and 1.6 word it.
  const old = `12:00:00  Compiling...\n${event({ code: "Q042", msg: `Compiled node 'inline_query' is:\n${sql}` })}\n`;
  assert.equal(parseCompiled(old), sql);
  assert.equal(parseCompiled(`dbt 2.0.9\n[{"x":1}]\n`), undefined);
});

test("parseCompiled finds the event among dbt's other output", () => {
  const line = JSON.stringify({ info: { code: "Q042", msg: "Compiled inline node is:\nselect 1 as x" } });
  assert.equal(parseCompiled(`   dbt 2.0.9\n   Loading profiles.yml\n${line}\n Succeeded model inline [1 of 1 in 0.01s]\n`), "select 1 as x");
});

test("dbtError reads a JSON log's error events, not the JSON around them", () => {
  const event = (level: string, msg: string) => JSON.stringify({ info: { code: "Z002", level, msg } });
  const out = [event("info", "Running with dbt=1.12.6"), event("error", "[ERROR]: Encountered an error:\nError parsing inline query"), event("error", "[ERROR]: second")].join("\n");
  assert.equal(dbtError(out, ""), "[ERROR]: Encountered an error:\nError parsing inline query\n\n[ERROR]: second");
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

test("readComparison reads Redshift's raw rows: the row's columns beside __side, no counts", () => {
  const c = readComparison([
    { __side: "left", id: 1, amount: 32 },
    { __side: "right", id: 1, amount: 24 },
  ]);
  assert.equal(c.counts, undefined);
  assert.deepEqual(c.rows, [
    { side: "left", row: { id: 1, amount: 32 } },
    { side: "right", row: { id: 1, amount: 24 } },
  ]);
});

test("cutFrom spots a comparison cut by the limit", () => {
  const counts = { left: 500, right: 500, only_left: 150, only_right: 150 };
  const rows = (k: number) => Array.from({ length: k }, () => ({ side: "left" as const, row: {} }));
  assert.equal(cutFrom({ counts, rows: rows(99) }, 100), 300, "limit 100 = the counts row + 99 differing rows");
  assert.equal(cutFrom({ counts: { ...counts, only_left: 1, only_right: 1 }, rows: rows(2) }, 100), undefined);
  assert.equal(cutFrom({ rows: rows(100) }, 100), 100, "without counts, the limit is all differing rows");
  assert.equal(cutFrom({ rows: rows(99) }, 100), undefined, "without counts, 99 rows under a limit of 100 is the whole result");
  assert.equal(cutFrom({ rows: rows(3) }, 100), undefined);
});

test("forAdapter keeps other Jinja", () => {
  assert.equal(forAdapter("select {{ ref('a') }}, {% if target.type == 'duckdb' %}1{% else %}2{% endif %}", "duckdb"), "select {{ ref('a') }}, 1");
  const chain = "{% if target.type == 'bigquery' %}1{% elif target.type == 'duckdb' %}2{% elif target.type == 'redshift' %}3{% elif target.type == 'snowflake' %}4{% else %}5{% endif %}";
  assert.deepEqual(["bigquery", "duckdb", "redshift", "snowflake", "postgres"].map((t) => forAdapter(chain, t)), ["1", "2", "3", "4", "5"]);
});

const sides = (left: Row[], right: Row[]): Comparison => ({
  rows: [...left.map((row) => ({ side: "left" as const, row })), ...right.map((row) => ({ side: "right" as const, row }))],
});

test("pairRows pairs a changed row's two versions by its id column", () => {
  const p = pairRows(
    sides(
      [{ amount: 32, order_id: 14 }, { amount: 45, order_id: 52 }, { amount: 5, order_id: 60 }],
      [{ amount: 24, order_id: 14 }, { amount: 30, order_id: 52 }, { amount: 7, order_id: 61 }],
    ),
  );
  assert.deepEqual(p.key, ["order_id"]);
  assert.deepEqual(p.pairs.map(([l, r]) => [l.order_id, l.amount, r.amount]), [[14, 32, 24], [52, 45, 30]]);
  assert.deepEqual(p.left, [{ amount: 5, order_id: 60 }]);
  assert.deepEqual(p.right, [{ amount: 7, order_id: 61 }]);
});

test("pairRows needs every id column that is unique on both sides to agree", () => {
  // Order 5 removed and order 9 added, both customer 1's: different rows, not one changed row.
  const p = pairRows(sides([{ CUSTOMER_ID: 1, ORDER_ID: 5 }], [{ CUSTOMER_ID: 1, ORDER_ID: 9 }]));
  assert.deepEqual(p.key, ["CUSTOMER_ID", "ORDER_ID"]);
  assert.equal(p.pairs.length, 0);
  // customer_id repeats on the left, so only order_id keys the rows.
  const q = pairRows(sides([{ customer_id: 1, order_id: 5, x: 1 }, { customer_id: 1, order_id: 6, x: 1 }], [{ customer_id: 1, order_id: 5, x: 2 }]));
  assert.deepEqual(q.key, ["order_id"]);
  assert.equal(q.pairs.length, 1);
});

test("pairRows pairs nothing without an id column", () => {
  const p = pairRows(sides([{ name: "a", n: 1 }], [{ name: "a", n: 2 }]));
  assert.deepEqual(p, { key: [], pairs: [], left: [{ name: "a", n: 1 }], right: [{ name: "a", n: 2 }] });
});
