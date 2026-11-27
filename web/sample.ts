/* The example on the landing page: jaffle_shop's orders model, before and after a change, and made-up tables to run it
 * on. Fictional data only. */
import { forAdapter, isExactNumber, type Row } from "../src/query.ts";

export const before = `with orders as (
    select * from {{ ref('stg_orders') }}
),

payments as (
    select * from {{ ref('stg_payments') }}
),

refunds as (
    select order_id, sum(amount) as refunded
    from payments
    where amount < 0
    group by order_id
),

order_payments as (
    select order_id, sum(amount) as total_amount
    from payments
    group by order_id
),

final as (
    select
        orders.order_id,
        orders.customer_id,
        orders.order_date,
        order_payments.total_amount as amount,
        refunds.refunded
    from orders
    left join order_payments using (order_id)
    left join refunds using (order_id)
)

select * from final
`;

export const after = `with orders as (
    select * from {{ ref('stg_orders') }}
),

payments as (
    select * from {{ ref('stg_payments') }}
    where status = 'success'
),

customers as (
    select customer_id, first_name
    from {{ ref('stg_customers') }}
),

order_payments as (
    select order_id, sum(amount) as total_amount
    from payments
    group by order_id
),

final as (
    select
        orders.order_id,
        orders.customer_id,
        customers.first_name,
        orders.order_date,
        order_payments.total_amount as amount
    from orders
    left join customers using (customer_id)
    left join order_payments using (order_id)
)

select * from final
`;

/** The made-up tables the demo and the playground run on (DuckDB SQL). Orders 14, 52 and 87 each had a failed payment
 * attempt: summing every payment overstates their totals. */
export const tables = `
create table stg_customers as select * from (values
  (1, 'Ada'), (2, 'Grace'), (3, 'Linus'), (4, 'Margaret'), (5, 'Alan')) t(customer_id, first_name);
create table stg_orders as select order_id, customer_id, order_date::date as order_date, status from (values
  (11, 1, '2024-01-04', 'completed'), (14, 2, '2024-01-09', 'completed'), (23, 3, '2024-01-15', 'completed'),
  (31, 1, '2024-02-02', 'completed'), (52, 4, '2024-02-11', 'completed'), (66, 5, '2024-02-20', 'returned'),
  (87, 2, '2024-03-03', 'completed'), (90, 3, '2024-03-08', 'completed')) t(order_id, customer_id, order_date, status);
create table stg_payments as select payment_id, order_id, amount::double as amount, status from (values
  (1, 11, 18.00, 'success'), (2, 14, 24.00, 'success'), (3, 14, 8.00, 'fail'), (4, 23, 40.00, 'success'),
  (5, 31, 12.50, 'success'), (6, 52, 30.00, 'success'), (7, 52, 15.00, 'fail'), (8, 66, 22.00, 'success'),
  (9, 66, -22.00, 'success'), (10, 87, 9.00, 'success'), (11, 87, 9.00, 'fail'), (12, 90, 35.00, 'success'))
  t(payment_id, order_id, amount, status);
`;

/** The SQL as dbt would render it for the tables above on DuckDB: ref('x') and source('s', 'x') become x, and the
 * comparison's adapter Jinja its DuckDB branch. Other Jinja stays, and DuckDB reports it. */
export const forDuckdb = (sql: string) =>
  forAdapter(sql.replace(/\{\{\s*(?:ref\(\s*|source\(\s*'[^']*'\s*,\s*)'([^']+)'\s*\)\s*\}\}/g, "$1"), "duckdb");

/** A column of the playground's result, as DuckDB's `describe` gives it. */
export type Column = { column_name: string; column_type: string };

/** Types duckdb-wasm hands back as a JS number, string or boolean as they are. */
const AS_IS = /^(INTEGER|SMALLINT|TINYINT|DOUBLE|FLOAT|VARCHAR|BOOLEAN)$/;
/** Number types a double holds exactly, read as one. */
const DOUBLE = /^(UINTEGER|USMALLINT|UTINYINT|REAL)$/;
/** Number types a double may round (64-bit and wider integers, decimals); they come back as text, then showRow reads them. */
const WIDE = /^(BIGINT|HUGEINT|UHUGEINT|UBIGINT|DECIMAL)/;

/** The select list that reads the playground's result as dbt show gives it: numbers as numbers, dates and the rest as
 * text. A wide number is read as text, so showRow can keep the digits a double would round. */
export function showColumns(cols: Column[]): string {
  return cols
    .map(({ column_name, column_type }) => {
      const q = `"${column_name.replace(/"/g, '""')}"`;
      return AS_IS.test(column_type) ? q : DOUBLE.test(column_type) ? `${q}::double as ${q}` : `${q}::varchar as ${q}`;
    })
    .join(", ");
}

/** A row read with showColumns: a wide number becomes a number, or stays its digits when a double would round it, as
 * the extension's dbt reader keeps it (9007199254740993 stays "9007199254740993"). */
export function showRow(row: Row, cols: Column[]): Row {
  const out: Row = { ...row };
  for (const { column_name, column_type } of cols) {
    const v = out[column_name];
    if (WIDE.test(column_type) && typeof v === "string") out[column_name] = isExactNumber(v) ? v : Number(v);
  }
  return out;
}
