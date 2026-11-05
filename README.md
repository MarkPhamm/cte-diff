# CTE Diff for dbt and Snowflake

Docs and a playground: **https://markphamm.github.io/cte-diff/**

Reviewing a change to a dbt model? Open the two versions in a diff editor and click above any CTE:

- **▶ Preview** shows that CTE's rows, on either side.
- **⇄ Compare sides** runs the same CTE on both sides and shows the rows only one side returns, with row counts. You see what the change did to the data, CTE by CTE, without copying SQL into a worksheet.

Queries run through `dbt show`, in your dbt project, so Jinja (`ref`, `source`, macros, `var`) renders as in a real run. dbt connects with your profile, so key-pair, SSO and password logins all work. If the project has a `.env` file, its variables are loaded first; variables already set in the environment take precedence.

## The sidebar

Click the **CTE Diff** icon in the Activity Bar. It lists the CTEs of the SQL you're on.

When that SQL is one side of a diff, it lists every CTE of both sides, marked:
- **changed**: its text changed.
- **new** or **removed**: it's only on one side.
- **reads a changed CTE**: the text is the same, but it reads one that changed, so its rows can still differ.

Hover a CTE for its buttons: **←** previews the left (old) side, **→** previews the right (new) side, and **⇄** compares both. Click a CTE to jump to it.

## Use it

- **A git change:** open the model from Source Control. Lenses appear on both sides of the diff.
- **Any two files:** select both in the Explorer, then use **Compare Selected**.
- **Pasted SQL:** run **CTE Diff: New Comparison (Paste Two Queries)**. Paste the old query on the left and the new one on the right.

Every SQL file also gets **▶ Preview** outside a diff. The last lens previews the whole query.

Each run is logged to **Output › CTE Diff**, along with the exact SQL. A new run cancels the one still going.

## How the comparison works

Each side's CTE becomes `select * from <cte>`, keeping the CTEs before it. Both sides run in one query, on Snowflake or DuckDB.

Each row is turned into JSON with its keys sorted (`object_construct_keep_null(*)` on Snowflake, `to_json` and `json_each` on DuckDB). Rows then compare by column *name*, not position. A renamed, added or dropped column shows up as a difference instead of an error. The result is `left EXCEPT right` and `right EXCEPT left`, plus the row count of each side.

`EXCEPT` compares distinct rows. If the only change is duplicated rows, the counts differ but no rows are listed.

## Settings

| Setting | Default | |
|---|---|---|
| `cteDiff.dbtPath` | empty | Path to `dbt`. Empty: the project's `.venv`, `~/.local/bin`, Homebrew, else `PATH`. |
| `cteDiff.projectDir` | empty | The dbt project to run in. Empty: the project holding the file, else the one in the workspace. |
| `cteDiff.target` | empty | The dbt target (`--target`). |
| `cteDiff.limit` | `100` | The most rows a preview fetches, and the most differing rows a comparison lists. |

## Requirements

- dbt Fusion, or dbt-core 1.5 or later (both have `dbt show --inline`), with a working profile.
- Comparisons run on Snowflake and DuckDB (dbt picks the SQL by the profile's adapter). Previews work on any warehouse dbt supports.
- A trusted workspace: dbt runs the project's macros.

## Try it on DuckDB

`examples/duckdb` is a small dbt project on a local DuckDB file, with no warehouse or login. Its README walks through a preview and a comparison.

## Development

```sh
npm install
npm test            # unit tests (node --test)
npm run typecheck
npm run package     # builds cte-diff-<version>.vsix
```

Release: bump `version` in `package.json`, add a `CHANGELOG.md` entry, commit, then run `scripts/release.sh`.
