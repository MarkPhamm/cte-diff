# How the comparison works

For each side, the CTE becomes `select * from <cte>`, keeping the CTEs before it. Text before the `with`, such as `{{ config() }}`, is kept too. Both sides then run in one query, on Snowflake or DuckDB, through `dbt show`, so Jinja renders as in a real run.

```sql
with __l as (select to_json(object_construct_keep_null(*)) as __row from (
  -- the left side's CTE
)),
__r as (select to_json(object_construct_keep_null(*)) as __row from (
  -- the right side's CTE
)),
__only_l as (select __row from __l except select __row from __r),
__only_r as (select __row from __r except select __row from __l)
select ...  -- the row counts, then the rows of __only_l and __only_r
```

## Rows compare by column name

Each row is turned into JSON with its keys sorted, so rows compare by column *name*, not position:

- **Snowflake:** `to_json(object_construct_keep_null(*))`. Snowflake keeps an object's keys sorted.
- **DuckDB:** `to_json` of the row, re-joined from `json_each` in key order. DuckDB keeps a row's columns in their order, so the keys are sorted by hand.

dbt renders the right one: the query holds both, in a `{% if target.type == 'duckdb' %}` block. A renamed, added or dropped column shows up as a difference instead of an error. Both keep a `NULL` column in the JSON, so `NULL` and a missing column differ.

## What the counts mean

The result is `left EXCEPT right` and `right EXCEPT left`, plus the row count of each side.

`EXCEPT` compares distinct rows. If the only change is duplicated rows, the counts differ but no rows are listed. The panel says so: "Same distinct rows; the counts differ only by duplicates."

## How CTEs are marked

The sidebar compares each CTE's text, with whitespace collapsed:

- A CTE whose text differs is **changed**.
- A CTE on one side only is **new** or **removed**.
- A CTE with the same text that reads a changed, new or removed CTE is marked **reads a changed CTE**. This follows the chain: a CTE that reads one of those is marked too.

Comments and Jinja tags are skipped when finding CTEs, but they count as text inside a CTE's body. Editing a comment or a `ref()` in a CTE marks it changed.
