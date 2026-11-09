import assert from "node:assert/strict";
import { test } from "node:test";
import { compareCtes, cteQuery, parse, subqueries, subqueryQuery } from "../src/cte.ts";

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

test("finds subqueries, not the top-level CTE bodies", () => {
  const sql = `with a as (
    select * from t
    where exists (select 1 from u where u.id = t.id)
), b as (
    select * from (select * from v) x
)
select * from b`;
  assert.deepEqual(
    subqueries(sql).map((s) => [sql.slice(s.start, s.start + 6), s.cte]),
    [
      ["select", 0],
      ["select", 1],
    ],
  );
});

const CORRELATED = `with renamed as (
    select * from t_game
),

valid_bets as (
    select renamed.*
    from renamed
    where exists (
        select valid_game.game_id
        from {{ ref('bronze_stg_wdts_reporting__t_game') }} as valid_game
        where
            valid_game.game_id = renamed.game_id
            and valid_game.gaming_day = renamed.gaming_day
    )
)

select * from valid_bets
`;

test("a correlated subquery previews with the outer relation it reads", () => {
  const [sub] = subqueries(CORRELATED);
  const q = subqueryQuery(CORRELATED, sub.start);
  assert.ok(q.startsWith("with renamed as ("), "keeps the CTEs before its own");
  assert.ok(!q.includes("valid_bets as ("), "does not run the CTE that holds it");
  assert.match(q, /from renamed, \{\{ ref\('bronze_stg_wdts_reporting__t_game'\) \}\} as valid_game/);
  assert.match(q, /valid_game\.game_id = renamed\.game_id/);
});

test("an uncorrelated subquery previews on its own", () => {
  const sql = "select * from orders where id in (select order_id from payments where amount > 0)";
  const [sub] = subqueries(sql);
  assert.equal(subqueryQuery(sql, sub.start), "select order_id from payments where amount > 0");
});

test("a correlated subquery previews with the alias of each outer relation it reads", () => {
  const sql = `with valid_bets as (
    select o.* from orders o join customers c on c.id = o.customer_id
    where exists (select 1 from payments p where p.order_id = o.id and p.customer_id = c.id)
)
select * from valid_bets`;
  const [sub] = subqueries(sql);
  const q = subqueryQuery(sql, sub.start);
  assert.match(q, /from orders o,\s+customers c, payments p/);
  assert.match(q, /p\.order_id = o\.id and p\.customer_id = c\.id/);
});

test("a subquery preview keeps a nested WITH, and a derived table's outer reads", () => {
  const nested = `with outer_cte as (
    with inner_cte as (select * from orders)
    select * from inner_cte i where exists (select 1 from payments p where p.order_id = i.id)
)
select * from outer_cte`;
  const [inner, exists] = subqueries(nested);
  assert.ok(subqueryQuery(nested, inner.start).startsWith("with inner_cte as (select * from orders)"));
  assert.match(subqueryQuery(nested, exists.start), /^with inner_cte as \(select \* from orders\)\nselect 1 from inner_cte i, payments p/);

  const derived = `with x as (
    select * from orders o, (select * from payments p where p.order_id = o.id) pay
    where exists (select 1 from refunds r where r.id = pay.id)
) select * from x`;
  const [table, correlated] = subqueries(derived);
  assert.equal(subqueryQuery(derived, table.start), "select * from orders o, payments p where p.order_id = o.id");
  assert.match(subqueryQuery(derived, correlated.start), /^select 1 from orders o,\s+\(select \* from payments p where p\.order_id = o\.id\) pay,\s+refunds r/);
});

test("a subquery's own WITH is not hoisted twice", () => {
  const sql = `with x as (
    select * from orders o
    where exists (with q as (select 1 id) select 1 from q where q.id = o.id)
) select * from x`;
  const [sub] = subqueries(sql);
  const q = subqueryQuery(sql, sub.start);
  assert.equal(q.match(/with q as/g)?.length, 1, "one WITH q");
  assert.equal(q, "with q as (select 1 id) select 1 from orders o, q where q.id = o.id");

  const derived = "select * from (with q as (select 1 id) select * from q) z";
  const [table] = subqueries(derived);
  assert.equal(subqueryQuery(derived, table.start), "with q as (select 1 id) select * from q");
});

test("compareCtes: changed, added, removed, and affected downstream", () => {
  const left = `with a as (select 1 x), b as (select * from a), c as (select 2 y), gone as (select 3)
select * from b`;
  const right = `with a as (select   1 x  ), b as (select * from A), c as (select 22 y), d as (select * from c), e as (select 1)
select * from b;`;
  assert.deepEqual(compareCtes(left, right), [
    { name: "a", status: "same" }, // whitespace only
    { name: "b", status: "changed" }, // a -> A is a text change, even though Snowflake reads it the same
    { name: "c", status: "changed" },
    { name: "d", status: "added" },
    { name: "e", status: "added" },
    { name: "gone", status: "removed" },
    { status: "affected" }, // same final select, but it reads b
  ]);
});

test("compareCtes: an unchanged CTE reading a removed one is affected; no CTEs compares the whole text", () => {
  assert.deepEqual(compareCtes("with a as (select 1), b as (select * from a) select * from b", "with b as (select * from a) select * from b"), [
    { name: "b", status: "affected" },
    { name: "a", status: "removed" },
    { status: "affected" },
  ]);
  assert.deepEqual(compareCtes("select 1", "select  1;"), [{ status: "same" }]);
  assert.deepEqual(compareCtes("select 1", "select 2"), [{ status: "changed" }]);
});
