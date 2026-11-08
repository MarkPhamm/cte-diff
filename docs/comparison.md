# How the comparison works

For each side, the CTE becomes `select * from <cte>`, keeping the CTEs before it. Text before the `with`, such as `{{ config() }}`, is kept too. Both sides then run in one query, on BigQuery, DuckDB, Redshift or Snowflake, through `dbt show`, so Jinja renders as in a real run.

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

## How rows compare

Snowflake, DuckDB and BigQuery turn each row into JSON; Redshift compares the rows themselves. Snowflake and DuckDB sort the JSON keys, so rows compare by column *name*, not position. BigQuery keeps the row's column order, so a reordered column list shows as a difference there.

- **Snowflake:** `to_json(object_construct_keep_null(*))`. Snowflake keeps an object's keys sorted.
- **DuckDB:** `to_json` of the row, re-joined from `json_each` in key order. DuckDB keeps a row's columns in their order, so the keys are sorted by hand.
- **BigQuery:** `TO_JSON_STRING` of the row itself (the FROM alias is the row as a `STRUCT`), in column order. A reordered column list therefore shows as a difference; a renamed, added or dropped column does too. The counts row is a `STRUCT` of four numbers, also as JSON.

dbt renders the right one: the query holds every warehouse's branch, in a `{% if target.type == '...' %}` block. A renamed, added or dropped column shows up as a difference instead of an error. All three keep a `NULL` column in the JSON, so `NULL` and a missing column differ.

**Redshift** has no function that turns a row of unknown columns into JSON, so its comparison runs on the rows themselves:

```sql
with __l as (
  -- the left side's CTE
),
__r as (
  -- the right side's CTE
),
__only_l as (select * from __l except select * from __r),
__only_r as (select * from __r except select * from __l)
select 'left' as __side, * from __only_l
union all select 'right' as __side, * from __only_r
```

The differing rows come back with their own columns and a `__side` marker, and there is no counts row: the panel says so, and still says whether the sides match. Redshift's `EXCEPT` matches columns by position, so the two sides' columns must line up by count, order and type. A change to the columns errors instead of showing as a difference. And because `EXCEPT` compares distinct rows and there are no counts, a change to duplicates alone isn't shown.

## What the counts mean

On Snowflake, DuckDB and BigQuery, the result is `left EXCEPT right` and `right EXCEPT left`, plus the row count of each side. Redshift has no counts row.

`EXCEPT` compares distinct rows. If the only change is duplicated rows, the counts differ but no rows are listed. The panel says so: "Same distinct rows; the counts differ only by duplicates." Redshift has no counts to show that, so a duplicate-only change reads as no difference there.

## How CTEs are marked

The sidebar compares each CTE's text, with whitespace collapsed:

- A CTE whose text differs is **changed**.
- A CTE on one side only is **new** or **removed**.
- A CTE with the same text that reads a changed, new or removed CTE is marked **reads a changed CTE**. This follows the chain: a CTE that reads one of those is marked too.

Comments and Jinja tags are skipped when finding CTEs, but they count as text inside a CTE's body. Editing a comment or a `ref()` in a CTE marks it changed.
