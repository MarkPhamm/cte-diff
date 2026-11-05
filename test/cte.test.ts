import assert from "node:assert/strict";
import { test } from "node:test";
import { cteQuery, parse } from "../src/cte.ts";

const names = (sql: string) => parse(sql).ctes.map((c) => c.name);

// The new side of a real review: string literals with commas and parentheses, a comment between CTEs.
const REVIEW = `with key_tuples as (
    select distinct
        md5(
            coalesce(cast(o.order_id as varchar), '_dbt_utils_surrogate_key_null_') || '-' ||
            coalesce(cast(c.coupon_id as varchar), '_dbt_utils_surrogate_key_null_')
        ) as __entity_key,
        cast(o.store_id as string) as __store_id
    from analytics.dev.snap_orders o
    where o.order_id = 42
),

-- a comment between CTEs, with parens (7.3) and a comma, too
order_versions as (
    select t.__entity_key, source.*
    from analytics.dev.snap_orders source
    inner join (
        select distinct __entity_key, __order_key from key_tuples
    ) t on source.order_id = t.__order_key
)

select * from order_versions;
`;

test("finds top-level CTEs, not subqueries", () => {
  assert.deepEqual(names(REVIEW), ["key_tuples", "order_versions"]);
});

test("a CTE's query keeps the CTEs before it and selects from it", () => {
  const q = cteQuery(REVIEW, "key_tuples");
  assert.ok(q.startsWith("with key_tuples as ("));
  assert.ok(q.endsWith("where o.order_id = 42\n)\nselect * from key_tuples"));
  assert.ok(!q.includes("order_versions"));
  assert.ok(cteQuery(REVIEW, "ORDER_VERSIONS").endsWith(")\nselect * from order_versions"), "unquoted names match any case");
});

test("the whole query drops the trailing semicolon", () => {
  assert.ok(cteQuery(REVIEW).endsWith("select * from order_versions"));
});

test("dbt Jinja before the WITH is kept, and Jinja inside is skipped", () => {
  const sql = `{{ config(materialized='table', tags=['a)']) }}
{% set cols = ["a", "b"] %}
with src as (select * from {{ ref('orders') }} where x = '{{ var("y)") }}'),
"Quoted CTE" (a, b) as (select 1, 2 /* ) , */ -- )
)
select * from src`;
  assert.deepEqual(names(sql), ["src", '"Quoted CTE"']);
  const q = cteQuery(sql, '"Quoted CTE"');
  assert.ok(q.startsWith("{{ config(materialized='table', tags=['a)']) }}\n{% set cols"));
  assert.ok(q.endsWith('select * from "Quoted CTE"'));
  assert.throws(() => cteQuery(sql, '"quoted cte"'), /No CTE/, "quoted names are case-sensitive");
});

test("strings with escapes, $$ blocks and with recursive", () => {
  const sql = `WITH RECURSIVE a as (select 'it''s (' as s, 'x\\')' as t, $$ ) $$ as u), b as (select * from a) select 1`;
  assert.deepEqual(names(sql), ["a", "b"]);
});

test("a nested WITH stays inside its CTE", () => {
  const sql = "with outer_cte as (with inner_cte as (select 1) select * from inner_cte) select * from outer_cte";
  assert.deepEqual(names(sql), ["outer_cte"]);
});

test("no WITH: no CTEs, the whole query still previews", () => {
  assert.deepEqual(parse("select 1").ctes, []);
  assert.equal(parse("select 1").withStart, -1);
  assert.equal(cteQuery("  select 1;\n"), "select 1");
});
