# Example: CTE Diff on DuckDB

A small dbt project on a local DuckDB file. No warehouse, no login. `profiles.yml` sits in this folder, so dbt finds it here.

## Set up (once)

```sh
cd examples/duckdb
python3 -m venv .venv && .venv/bin/pip install dbt-duckdb
.venv/bin/dbt seed            # loads seeds/*.csv into example.duckdb
```

The extension finds `.venv/bin/dbt` on its own.

## Preview a CTE

1. Open this repo in VS Code with CTE Diff installed.
2. Open `models/customer_revenue.sql`.
3. Click **▶ Preview** above `revenue`. Four rows, one per customer with completed orders.

## Compare a change

1. In `paid_orders`, change `where status = 'completed'` to `where status in ('completed', 'refunded')`. Save.
2. Open the file from **Source Control**, so the old and new versions open side by side.
3. Click **⇄ Compare sides** above `revenue`.

Only customer 1 differs: 1 order and 120 on the left, 2 orders and 160 on the right. `paid_orders` shows as **changed** in the sidebar, and `revenue` as **reads a changed CTE**.

Undo the edit with `git checkout models/customer_revenue.sql`.
