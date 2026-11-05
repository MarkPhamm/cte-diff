# Changelog

## 0.3.0

- **Compare** works on DuckDB (dbt-duckdb), as well as Snowflake. Rows still match by column name, so reordered columns don't show as differences.
- Results open in the **CTE Diff** tab of the bottom panel, beside the Terminal, instead of an editor tab.
- A comparison cut short by `cteDiff.limit` now says so, with how many rows differ in all ("the first 99 of 300").
- `examples/duckdb`: a small dbt project on a local DuckDB file, to try the extension without a warehouse.

## 0.2.0

- New: the **CTE Diff** sidebar (its icon is in the Activity Bar). It lists the CTEs of the SQL you're on. On a diff, every CTE of both sides is marked **changed**, **new**, **removed**, or **reads a changed CTE** (same text, but its data can still change), with a summary at the top.
- Each CTE's row has buttons: preview the left (old) side, preview the right (new) side, compare both. Click a CTE to jump to it.
- **New Comparison** is a button in the sidebar's title bar.
- The project's `.env` is loaded before running dbt, so profiles that read `env_var()` work in VS Code.

## 0.1.0

- First release: **▶ Preview** any CTE (or the whole query), and **⇄ Compare sides** of a diff editor, through `dbt show`.
- **New Comparison** opens two blank panes to paste an old and a new query into.
