# Install

Install **CTE Diff for dbt** from either store:

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MarkPhamm.cte-diff), for VS Code.
- [Open VSX](https://open-vsx.org/extension/MarkPhamm/cte-diff), for Cursor, VSCodium and other editors built on VS Code.

Or from VS Code's Quick Open (++cmd+p++ or ++ctrl+p++):

```text
ext install MarkPhamm.cte-diff
```

## Requirements

- **dbt Fusion, or dbt-core 1.5 or later.** Both have `dbt show --inline`, which runs every query. dbt needs a working profile.
- **BigQuery, DuckDB, Redshift or Snowflake, for comparisons.** Each warehouse has its own SQL for turning a row into JSON and diffing it (Redshift diffs the rows themselves, with no row counts). Previews work on any warehouse dbt supports.
- **A trusted workspace.** dbt runs the project's macros, so the extension stays off in Restricted Mode.

## Finding dbt and the project

The extension looks for `dbt` in the project's `.venv`, then `~/.local/bin`, then Homebrew, then `PATH`. It runs in the dbt project that holds the open file, or else the one in the workspace. Set [`cteDiff.dbtPath` and `cteDiff.projectDir`](settings.md) to choose them yourself.

If the project has a `.env` file, its variables are loaded before dbt runs, so profiles that read `env_var()` work. Variables already set in the environment take precedence.

Next: [use it](usage.md).
