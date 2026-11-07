# FAQ and limits

## Using it

### I don't see ▶ Preview or ⇄ Compare sides in a diff

VS Code hides CodeLens in diff editors unless `"diffEditor.codeLens": true` is in your [settings](settings.md). Without it, use the **CTE Diff** sidebar, or **⇄ Compare a CTE…** in the editor's title bar: both work in any diff.

### Why is ⇄ missing above one CTE?

That CTE is only on one side, **new** or **removed**, so there is nothing to compare it with. **▶ Preview** shows its rows.

### dbt isn't found

CTE Diff runs `cteDiff.dbtPath` when it's set. Otherwise it looks in the project's (or the workspace's) `.venv`, then `~/.local/bin`, then Homebrew, then `PATH`. Set `cteDiff.dbtPath` to the `dbt` you run in a terminal.

### dbt can't find my profile, or a variable

dbt runs in the dbt project's folder, so it finds `profiles.yml` there or in `~/.dbt`, as it does in a terminal. If the project has a `.env` file, its variables are loaded first. Variables already set in VS Code's environment take precedence. Pick a target other than the profile's default with `cteDiff.target`.

### It runs in the wrong dbt project

It runs in the project holding the SQL file: the nearest folder up with a `dbt_project.yml`. Pasted SQL has no file, so it runs in the workspace's project. When the workspace has several, it asks once, and keeps the answer until VS Code reloads. Set `cteDiff.projectDir` to choose one for good.

### What does a run cost?

One query per click, on your warehouse. A comparison computes the CTE on both sides in full, so it scans what the CTE scans, twice. `cteDiff.limit` caps the rows returned, not the rows scanned. A new run cancels the one still going, and **Cancel** on the progress notification stops it.

### Does it send my data anywhere?

No. dbt runs on your machine with your profile, and the rows go from your warehouse to the panel. The extension collects no telemetry. Each run is logged to **Output › CTE Diff** with the exact SQL.

## Known limits

- **Duplicates.** `EXCEPT` compares distinct rows. When only duplicated rows differ, the row counts show it and no rows are listed.
- **Warehouses.** Comparisons run on Snowflake and DuckDB. On other adapters dbt runs the Snowflake SQL and the warehouse reports an error. Previews run on any warehouse dbt supports.
- **Pairing.** A changed row shows as an old and new pair when an id column (`id`, or a name ending in `_id`, `_key`, `_pk` or `_sk`) is unique among the differing rows. Without one, rows are listed as only left and only right.
- **CTEs written by Jinja.** The CTE list comes from the SQL as written, with Jinja tags skipped. CTEs that a `{% for %}` loop or a macro writes aren't listed, and the list stops at the first thing it can't read.
- **`//` in SQL.** It's read as the start of a comment, so DuckDB's integer division can hide the CTEs after it.
- **Large integers.** Values above 2⁵³ (9,007,199,254,740,992) can show rounded in the panel.
- **Very long models on Windows.** The SQL goes to dbt on the command line, which Windows caps at about 32,000 characters.
