# Changelog

## 0.5.0

- **Compare Two Files…** in the sidebar's title bar and the Command Palette: pick an old and a new SQL file, and they open side by side, ready to compare CTE by CTE.

## 0.4.0

- A comparison lists a changed row as a pair, old above new, with the changed cells highlighted. Rows pair up by their id columns (`id`, `*_id`, `*_key`, `*_pk`, `*_sk`). Rows with no partner follow, under **Only on the left** and **Only on the right**.
- The results show their counts as badges, say plainly whether the sides differ, number a preview's rows, and right-align numbers.
- **Compare a CTE…** in the editor's title bar of a SQL diff: pick a CTE to compare. It works without CodeLens, which diff editors hide by default. Outside a diff it is **Preview a CTE…**.
- **Run Again** and **Show Log** in the results' title bar.
- Hover a CTE in the sidebar for what its mark means.
- The site's playground works again after moving between pages, and shows the comparison SQL for Snowflake or DuckDB instead of both in Jinja.

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
