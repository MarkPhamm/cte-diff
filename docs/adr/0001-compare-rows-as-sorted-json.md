# Compare rows as JSON text with sorted keys

Compare turns each row into JSON with its keys sorted and runs `EXCEPT` on that text. Rows therefore match by column name, not position, and the whole comparison is one `dbt show` query that needs no column list.

## Consequences

Every supported warehouse needs a function that turns `*` into JSON with sorted keys:

- Snowflake and DuckDB have one. DuckDB sorts the keys by hand through `json_each`.
- BigQuery has `to_json`.
- Redshift has none. `OBJECT()` needs explicit key/value pairs and rejects dates. That is why Redshift waits until someone asks for it.

## Update (0.8.0)

- Redshift is supported without JSON: it runs `EXCEPT` on the rows themselves. Its columns match by position and there are no row counts. See [How the comparison works](../comparison.md).
- BigQuery's `TO_JSON_STRING` keeps the row's column order, not sorted keys, so a reordered column list shows as a difference there.

## Considered options

- **Compare by position.** It works on any warehouse, but a reordered column would show up as a change in every row.
- **Get the column list first** with dbt's `get_columns_in_query`, then build the JSON from named columns. This would work on Redshift, but it costs an extra query per run, and dbt Fusion may not support it.
