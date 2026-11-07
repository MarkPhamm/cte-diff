# What CTE Diff needs

- **dbt Fusion, or dbt-core 1.5 or later**, with your warehouse's adapter. CTE Diff looks in the project's `.venv`, then `~/.local/bin`, Homebrew and `PATH`. Set `cteDiff.dbtPath` if yours is elsewhere.
- **A dbt project.** The nearest `dbt_project.yml` above the file runs the SQL. **CTE Diff: Choose dbt Project** picks the one for pasted SQL.
- **A profile that connects.** The profile's default target runs the SQL; `cteDiff.target` picks another. The project's `.env` is loaded first.
- **For comparisons: Snowflake or DuckDB.** Previews run on any warehouse dbt supports.

Every run's SQL and dbt's output are in **Output › CTE Diff**.
