# Changelog

## 0.12.0

- **Sort the results**: click a column header to sort the rows by it, ascending, then descending, then back to dbt's order. A click on a second header sorts by it, and the first breaks ties. No `ORDER BY` and no rerun: the sort acts on the rows already fetched. In a comparison, each changed row's old and new versions stay together.

## 0.11.0

- **`cteDiff.dbtArgs`**: extra arguments for every dbt run, such as `["--vars", "{cob_date: 20271015}"]` for a model that reads `var()`. Without them dbt uses the `var()` default, which can return the wrong rows without an error. The results heading and **Check Setup** show them.
- A preview's heading names the branch of the side it ran on, such as `orders.sql (qa)`, for a CTE as it already did for a subquery or a branch.
- **⇄ Compare sides** no longer fails with `spawn E2BIG` on large models on Linux: the query it sends to dbt holds each side's SQL once instead of four times. A query still too long for the command line now says how large it is.
- The old side of a diff now uses its own macros. When a macro or another project file differs from the branch, commit or staged version on the left, **▶ Preview**, **⇄ Compare sides** and **Compare Compiled SQL** compile that side in a temporary copy of the project as it was there, so a macro-only change shows up. Before, both sides used your working tree's macros. That side takes a few seconds more, as dbt parses the copy in full.

## 0.10.0

- **Nested CTEs**: a CTE inside another CTE's `with` gets **▶ Preview** and, in a diff, **⇄ Compare sides**, like a top-level one. The preview keeps the CTE inside the one that holds it, so names resolve as they do in the model. The sidebar lists nested CTEs under their holder, marked changed / new / removed / affected; an inner CTE that reads a changed CTE from outside is marked affected. The Command Palette's pick lists them as `holder.inner`.
- The sidebar's CTEs open to show what is under them. The subqueries listed in 0.9.0 couldn't be expanded.
- **▶ Preview branch** above each `select` of a `union`, `union all`, `intersect`, `except` or `minus`, in a CTE, the final query or a subquery. It runs that one `select` with the CTEs it reads, so you can see which branch brings in a row. An `order by` or `limit` after the last branch sorts the whole set, so the last branch's preview leaves it out.

## 0.9.0

- **▶ Preview subquery** above any subquery: an `exists`, `in`, scalar subquery or derived table. A correlated subquery runs with the outer relations it reads, so references such as `renamed.game_id` resolve as they do in the model.
- The sidebar lists each CTE's subqueries under it, with **▶** to preview one. In a diff, a changed or affected CTE lists its old and new subqueries.
- Sharing a link to the site shows a preview of the `order_payments` comparison.

## 0.8.2

- **Compare Compiled SQL** is in the CTE Diff sidebar when a diff is open: the first row of the CTE list, and a button in the sidebar's title bar. It does the same thing as the button on the diff.

## 0.8.1

- **Compare Compiled SQL** shows what dbt renders for both sides of an open diff, as a diff: the Jinja, `ref`s, sources and macros resolved, with nothing run on the warehouse. After Compare with Branch, it shows the branch's compiled SQL against your working tree's.

## 0.8.0

- Comparisons now run on **BigQuery** and **Redshift**, as well as Snowflake and DuckDB. On BigQuery a reordered column list shows as a difference. On Redshift there are no row counts, and the two sides' columns must line up: adding, dropping, renaming or reordering a column makes the warehouse reject the comparison. The marketplace name is now **CTE Diff for dbt**.
- The demo shows Compare with Branch: orders.sql compared with the qa branch, and three order totals that changed. It is 37 seconds, and the docs have a GIF of it.

## 0.7.1

- **Compare with Branch…** opens the SQL file in a diff with another branch's version on the left, such as `qa` while you work on `dev`, so you can compare its CTEs across branches. It is in the sidebar's title bar, beside each file in Compare Files, and in the Command Palette. The results heading names the branch: `orders.sql (qa) ↔ orders.sql`.

- The demo is 28 seconds. The camera glides after the cursor instead of jerking with it, each result holds on screen with its title long enough to read, and the scenes hand over with a pan, a blur and a whip instead of hard cuts.

## 0.7.0

- The demo previews a CTE on both sides of a git diff, then compares that CTE across two files.
- The first time a SQL diff opens, CTE Diff offers to show the **▶ Preview | ⇄ Compare sides** buttons above each CTE, which diff editors hide by default. One click sets `"diffEditor.codeLens": true`.
- **CTE Diff: Check Setup** runs `dbt debug` with CTE Diff's settings and shows the dbt it found, the project, the target, and dbt's own words when something is wrong. A failed run links to it.
- A **Get started with CTE Diff** walkthrough on VS Code's Welcome page.
- **CTE Diff: Choose dbt Project** changes the project that runs pasted SQL, without reloading VS Code.
- Under each result's heading: the files, the dbt target and how long the run took.
- Cancelling a run says "Cancelled", not "dbt failed".
- Errors from before dbt runs, such as no dbt project found, show in the results panel instead of a pop-up.
- A comparison on a warehouse other than Snowflake or DuckDB says so plainly, says that Preview works there, and links to ask for that warehouse. It used to show the warehouse's SQL error.
- dbt-core's errors show without colour codes.
- The sidebar's welcome text names all three ways to open a comparison: Source Control, Compare Files, and pasting two queries.
- `examples/duckdb` is now the change from the docs site and the demo video: jaffle_shop's `orders` model and a new version of it.
- Settings explains that the buttons above a CTE in a diff need `"diffEditor.codeLens": true`. The sidebar and the title bar work without it.

## 0.6.2

- Docs, the Marketplace page and the README now use ctediff.dev.
- On the docs home page, the install command is as wide as the buttons. Screenshots in the README and the docs fill the column.
- The README and the docs play each step of the demo: opening the diff, the sidebar's marks, a preview, a comparison, and columns that differ.
- The docs home page plays a 38-second silent demo of a real change, and the README links to it.

## 0.6.1

- The Marketplace and Open VSX pages show the extension at work: a demo, screenshots and a quick start. The docs have an [FAQ and limits](https://ctediff.dev/faq/) page.
- **⇄ Compare sides** no longer shows above a CTE that only one side has. It could only fail there.
- The sidebar's summary reads "2 read a changed CTE", not "2 reads".

## 0.6.0

- **Compare Files** in the sidebar, below the CTEs: an **Old** and a **New** slot and the workspace's SQL files by folder. Hover a file and click **←** or **→** to put it in a slot, then **Open the diff**. **Old** starts as the SQL file you open.

## 0.5.1

- **Compare Two Files…** picks from a searchable list of the workspace's SQL files, the open file first, instead of the system's file dialog.

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
