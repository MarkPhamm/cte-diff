// Writes web/demo-rows.json: the rows the site's live demo shows, from running the extension's own SQL (cteQuery,
// compareQuery) for web/sample.ts on DuckDB, over the made-up tables below. Needs the duckdb CLI.
// Run: node scripts/demo-rows.ts
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { compareCtes, cteQuery } from "../src/cte.ts";
import { compareQuery, forAdapter, type Row } from "../src/query.ts";
import { after, before } from "../web/sample.ts";

// Orders 14, 52 and 87 each had a failed payment attempt: summing every payment overstates their totals.
const TABLES = `
create table stg_customers as select * from (values
  (1, 'Ada'), (2, 'Grace'), (3, 'Linus'), (4, 'Margaret'), (5, 'Alan')) t(customer_id, first_name);
create table stg_orders as select order_id, customer_id, order_date::date as order_date, status from (values
  (11, 1, '2024-01-04', 'completed'), (14, 2, '2024-01-09', 'completed'), (23, 3, '2024-01-15', 'completed'),
  (31, 1, '2024-02-02', 'completed'), (52, 4, '2024-02-11', 'completed'), (66, 5, '2024-02-20', 'returned'),
  (87, 2, '2024-03-03', 'completed'), (90, 3, '2024-03-08', 'completed')) t(order_id, customer_id, order_date, status);
create table stg_payments as select payment_id, order_id, amount::decimal(10, 2) as amount, status from (values
  (1, 11, 18.00, 'success'), (2, 14, 24.00, 'success'), (3, 14, 8.00, 'fail'), (4, 23, 40.00, 'success'),
  (5, 31, 12.50, 'success'), (6, 52, 30.00, 'success'), (7, 52, 15.00, 'fail'), (8, 66, 22.00, 'success'),
  (9, 66, -22.00, 'success'), (10, 87, 9.00, 'success'), (11, 87, 9.00, 'fail'), (12, 90, 35.00, 'success'))
  t(payment_id, order_id, amount, status);
`;

/** What dbt would run on DuckDB: refs become the tables above, and the adapter Jinja its DuckDB branch. */
const render = (sql: string) => forAdapter(sql.replace(/\{\{\s*ref\('(\w+)'\)\s*\}\}/g, "$1"), "duckdb");

/** The query's rows. The CLI prints decimals as strings; dbt show returns them as numbers, so they become numbers. */
function run(sql: string): Row[] {
  const out = execFileSync("duckdb", ["-json", "-c", TABLES + render(sql)], { encoding: "utf8" }).trim();
  const rows: Row[] = out ? JSON.parse(out) : [];
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === "string" && /^-?\d+\.\d+$/.test(v) ? Number(v) : v])));
}

const rows: { left: Record<string, Row[]>; right: Record<string, Row[]>; compare: Record<string, Row[]> } = { left: {}, right: {}, compare: {} };
for (const { name, status } of compareCtes(before, after)) {
  const key = name ?? ""; // "" is the whole query
  if (status !== "added") rows.left[key] = run(cteQuery(before, name));
  if (status !== "removed") rows.right[key] = run(cteQuery(after, name));
  if (status !== "added" && status !== "removed") rows.compare[key] = run(compareQuery(cteQuery(before, name), cteQuery(after, name)));
}
const file = path.join(import.meta.dirname, "..", "web", "demo-rows.json");
fs.writeFileSync(file, JSON.stringify(rows) + "\n");
console.log(`wrote ${file}`);
