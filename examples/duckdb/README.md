# Example: CTE Diff on DuckDB

A small dbt project on a local DuckDB file. No warehouse, no login. `profiles.yml` sits in this folder, so dbt finds it here.

It is the change from the docs site and the demo video: jaffle_shop's `orders` model (`models/orders.sql`), and a new version of it (`models/orders_v2.sql`). The new version keeps only successful payments, adds each customer's first name and drops `refunded`. The seeds are the site's made-up tables.

## Set up (once)

```sh
cd examples/duckdb
python3 -m venv .venv && .venv/bin/pip install dbt-duckdb
.venv/bin/dbt seed            # loads seeds/*.csv into example.duckdb
```

The extension finds `.venv/bin/dbt` on its own. **CTE Diff: Check Setup** in the Command Palette runs `dbt debug` and shows what it finds.

## Preview a CTE

1. Open this repo in VS Code with CTE Diff installed.
2. Open `models/orders.sql`.
3. Click **▶ Preview** above `order_payments`. Eight rows, one per order.

## Compare the change

1. In the **CTE Diff** sidebar, under **Compare Files**, put `orders.sql` in **Old** and `orders_v2.sql` in **New**, then **Open the diff**. Or copy `orders_v2.sql` over `orders.sql` and open `orders.sql` from **Source Control**.
2. The sidebar marks `payments` and `final` **changed**, `customers` **new**, `refunds` **removed**, and `order_payments` **reads a changed CTE**.
3. Click **⇄ Compare a CTE…** in the editor's title bar and pick `order_payments`. Or hover it in the sidebar and click **⇄**.

A diff editor hides the **▶ Preview | ⇄ Compare sides** buttons above each CTE unless `"diffEditor.codeLens": true` is in your settings. CTE Diff offers to turn it on the first time a SQL diff opens.

`order_payments` differs on orders 14, 52 and 87: each had a failed payment that the old version counted. The panel lists three changed rows, matched on `order_id`, old above new, with `total_amount` highlighted. `payments` has 3 of its 12 rows only on the left, and `final` differs on every row, because its columns changed.

If you copied the file, undo it with `git checkout models/orders.sql`.
