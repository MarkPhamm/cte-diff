# cte-diff

A VS Code extension that shows what a dbt change does to the data, one CTE at a time. It runs each CTE through `dbt show` on the user's own warehouse.

## Running a CTE

**Preview**:
A CTE's rows on one side, or the whole query's rows.
_Avoid_: run, execute, show

**Compare**:
A CTE run on both sides in one query. It returns the rows that only one side has, plus each side's row count. The result is a **comparison**.
_Avoid_: diff (the editor's text diff), data diff

**Side**:
One of the two versions of the SQL. The left side is old and the right side is new.
_Avoid_: base, head, version, before/after

**Supported warehouse**:
A warehouse that Compare has SQL for. Preview runs on every warehouse dbt supports.
_Avoid_: adapter (in text for users)

## Reading results

**Mark**:
The sidebar's label for a CTE, found by comparing the text of both sides. It is one of **changed**, **new**, **removed** or **reads a changed CTE**.
_Avoid_: status, affected

**Id column**:
A column named like a key (`id`, `*_id`, `*_key`, `*_pk`, `*_sk`). It pairs the old and new versions of a changed row.
_Avoid_: key, primary key

**Verdict**:
The comparison's one-line answer: the sides are the same, they differ, or they differ only by duplicates.
_Avoid_: result, status
