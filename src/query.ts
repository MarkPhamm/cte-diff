/* The SQL a comparison runs (BigQuery, DuckDB, Redshift or Snowflake), and reading `dbt show --output json` back. No `vscode` import. */

export type Row = Record<string, unknown>;

/** The warehouses a comparison has SQL for, by dbt's `target.type`. */
export const SUPPORTED = ["bigquery", "duckdb", "redshift", "snowflake"] as const;
type Adapter = (typeof SUPPORTED)[number];

/** The start of the dbt error a comparison raises on any other warehouse; its `target.type` follows. */
const UNSUPPORTED = "CTE Diff: Compare has no SQL for";

/** Jinja that dbt renders to the profile's adapter's SQL. On any other adapter it raises an error that unsupported() reads. */
const byAdapter = (sql: Record<Adapter, string>) =>
  SUPPORTED.map((t, i) => `{% ${i ? "elif" : "if"} target.type == '${t}' %}${sql[t]}`).join("") +
  `{% else %}{{ exceptions.raise_compiler_error("${UNSUPPORTED} " ~ target.type) }}{% endif %}`;

/** `sql` as dbt renders it for one adapter: each byAdapter block becomes that adapter's branch, else its else branch.
 * Other Jinja stays. */
export const forAdapter = (sql: string, type: string) =>
  sql.replace(/{% if target\.type == '\w+' %}.*?{% endif %}/gs, (block) => {
    // ["", type, sql, type, sql, undefined (the else), sql]
    const parts = block.slice(0, -"{% endif %}".length).split(/{% (?:el)?if target\.type == '(\w+)' %}|{% else %}/);
    for (let i = 1; i < parts.length; i += 2) if (parts[i] === type || parts[i] === undefined) return parts[i + 1];
    return "";
  });

/** The warehouse a dbt error names when a comparison has no SQL for it; undefined for any other error. */
export const unsupported = (error: string) => error.match(new RegExp(`${UNSUPPORTED} (\\w+)`))?.[1];

/** A row of `__t` as JSON text. Snowflake's OBJECT keeps keys sorted; DuckDB's struct keeps column order, so its keys
 * are sorted by hand; BigQuery turns the row itself (its FROM alias `__t`, a STRUCT) into JSON with TO_JSON_STRING,
 * which keeps the STRUCT's field order (TO_JSON would sort the keys), so a reordered column list reads as a
 * difference there. */
const rowJson: Record<Exclude<Adapter, "redshift">, string> = {
  bigquery: "TO_JSON_STRING(__t)",
  duckdb: `(select '{' || string_agg(to_json(key) || ':' || value, ',' order by key) || '}' from json_each(to_json(__t)))`,
  snowflake: "to_json(object_construct_keep_null(*))",
};

/** The counts row of a JSON comparison, as JSON text. BigQuery has no object builder, so it is a STRUCT of four numbers. */
const countsJson: Record<Exclude<Adapter, "redshift">, string> = {
  bigquery:
    "TO_JSON_STRING(STRUCT((select count(*) from __l) AS `left`, (select count(*) from __r) AS `right`, " +
    "(select count(*) from __only_l) AS `only_left`, (select count(*) from __only_r) AS `only_right`))",
  duckdb: "to_json(json_object('left', (select count(*) from __l), 'right', (select count(*) from __r), 'only_left', (select count(*) from __only_l), 'only_right', (select count(*) from __only_r)))::varchar",
  snowflake:
    "to_json(object_construct('left', (select count(*) from __l), 'right', (select count(*) from __r), 'only_left', (select count(*) from __only_l), 'only_right', (select count(*) from __only_r)))::varchar",
};

/** EXCEPT DISTINCT is BigQuery's set operator; the others take a plain EXCEPT. */
const exceptOp: Record<Exclude<Adapter, "redshift">, string> = { bigquery: "except distinct", duckdb: "except", snowflake: "except" };

/** Rows only on one side, plus row counts: one query, so one dbt run. Each row becomes JSON, so columns match by name,
 * not position, and a column missing on one side shows as a difference instead of an error. EXCEPT is a set operation,
 * so duplicate rows count once; key-based matching would catch duplicates. */
const jsonCompare = (left: string, right: string, a: Exclude<Adapter, "redshift">) => `with __l as (select ${rowJson[a]} as __row from (
${left}
) AS __t),
__r as (select ${rowJson[a]} as __row from (
${right}
) AS __t),
__only_l as (select __row from __l ${exceptOp[a]} select __row from __r),
__only_r as (select __row from __r ${exceptOp[a]} select __row from __l)
select * from (
  select 0 as __k, 'counts' as __side, ${countsJson[a]} as __row
  union all select 1, 'left', __row from __only_l
  union all select 1, 'right', __row from __only_r
) order by __k, __row, __side`;

/** Redshift has no row-to-JSON for an unknown column list, so its comparison runs on the rows themselves: the differing
 * rows come back with a `__side` marker and their own columns, and there is no counts row. An added, dropped, renamed
 * or reordered column then errors in Redshift instead of showing as a difference. */
const rawCompare = (left: string, right: string) => `with __l as (
${left}
),
__r as (
${right}
),
__only_l as (select * from __l except select * from __r),
__only_r as (select * from __r except select * from __l)
select 'left' as __side, * from __only_l
union all select 'right' as __side, * from __only_r`;

export function compareQuery(left: string, right: string): string {
  return byAdapter({
    bigquery: jsonCompare(left, right, "bigquery"),
    duckdb: jsonCompare(left, right, "duckdb"),
    redshift: rawCompare(left, right),
    snowflake: jsonCompare(left, right, "snowflake"),
  });
}

export interface Counts {
  left: number;
  right: number;
  only_left: number;
  only_right: number;
}

export interface Comparison {
  counts?: Counts;
  rows: { side: "left" | "right"; row: Row }[];
}

/** How many rows differ in all, when the result holds fewer: dbt's limit counts the counts row too, so a JSON
 * comparison cuts the differing rows at limit - 1. A raw comparison (Redshift) has no counts row, so it cuts at
 * limit. Undefined when every differing row is there. */
export function cutFrom(c: Comparison, limit: number): number | undefined {
  const total = c.counts ? c.counts.only_left + c.counts.only_right : undefined;
  if (total !== undefined) return c.rows.length < total ? total : undefined;
  return c.rows.length >= limit ? c.rows.length : undefined;
}

/** A column name that reads as a row's identifier: `id`, `order_id`, `ORDER_KEY`, `customer_sk`. */
const ID = /(^|_)(id|key|pk|sk)$/i;

export interface Paired {
  /** The id columns that pair rows: on both sides, unique on each. Empty: nothing pairs. */
  key: string[];
  /** One row's left and right versions: every key column agrees, another column differs. */
  pairs: [Row, Row][];
  /** Rows with no partner on the other side. */
  left: Row[];
  right: Row[];
}

/** Pairs each differing left row with the right row that has the same id, so a changed row reads as one change
 * instead of a removal and an addition. shortcut: guesses the id from column names; add a key setting if that misleads. */
export function pairRows(c: Comparison): Paired {
  const left = c.rows.filter((r) => r.side === "left").map((r) => r.row);
  const right = c.rows.filter((r) => r.side === "right").map((r) => r.row);
  const unique = (rows: Row[], k: string) => rows.every((r) => k in r) && new Set(rows.map((r) => JSON.stringify(r[k]))).size === rows.length;
  const key = [...new Set(left.flatMap((r) => Object.keys(r)))].filter((k) => ID.test(k) && unique(left, k) && unique(right, k));
  const id = (r: Row) => JSON.stringify(key.map((k) => r[k]));
  const byId = new Map(key.length ? right.map((r) => [id(r), r]) : []);
  const pairs: [Row, Row][] = [];
  const rest: Row[] = [];
  for (const l of left) {
    const r = byId.get(id(l));
    if (r) pairs.push([l, r]);
    else rest.push(l);
  }
  const paired = new Set(pairs.map((p) => p[1]));
  return { key, pairs, left: rest, right: right.filter((r) => !paired.has(r)) };
}

/** Reads compareQuery's rows. Column names come back in whatever case the warehouse uses. A JSON comparison's rows hold
 * their data as a `__row` JSON string (counts first); Redshift's hold the row's own columns beside `__side`. */
export function readComparison(rows: Row[]): Comparison {
  const get = (r: Row, k: string) => r[k] ?? r[k.toUpperCase()];
  const out: Comparison = { rows: [] };
  for (const r of rows) {
    const side = get(r, "__side");
    const text = get(r, "__row");
    if (side === "counts") out.counts = JSON.parse(String(text));
    else if (text !== undefined) out.rows.push({ side: side === "left" ? "left" : "right", row: JSON.parse(String(text)) });
    else
      out.rows.push({
        side: side === "left" ? "left" : "right",
        row: Object.fromEntries(Object.entries(r).filter(([k]) => !/^__(?:side|k)$/i.test(k))),
      });
  }
  return out;
}

/** The rows from `dbt show --output json`'s stdout: dbt Fusion prints a JSON array on a line of its own; dbt-core
 * prints `{"node": ..., "show": [...]}`, possibly over several lines. Log lines around it are ignored. */
export function parseShow(stdout: string): Row[] | undefined {
  const lines = stdout.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].trimStart()[0];
    if (c !== "[" && c !== "{") continue;
    const text = balanced(lines.slice(i).join("\n").trimStart());
    if (!text) continue;
    try {
      const v = JSON.parse(text);
      if (Array.isArray(v)) return v;
      if (Array.isArray(v?.show)) return v.show;
    } catch {
      // a log line that happens to start with a bracket
    }
  }
  return undefined;
}

/** dbt's heading before the compiled SQL: "Compiled inline node is:" from dbt 1.7 and Fusion, "Compiled node
 * 'inline_query' is:" from dbt 1.5 and 1.6. */
const COMPILED = /Compiled (?:inline )?node(?: '[^']*')? is:\s*/;

/** The SQL `dbt compile --inline --log-format json` printed: its CompiledNode event, which dbt-core and Fusion write
 * to stdout. Undefined when dbt printed none, so the caller shows dbt's error instead. */
export function parseCompiled(stdout: string): string | undefined {
  for (const line of stdout.split(/\r?\n/)) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    let event: { data?: { compiled?: unknown }; info?: { compiled_code?: unknown; msg?: unknown } };
    try {
      event = JSON.parse(text);
    } catch {
      continue; // a log line that happens to start with a brace
    }
    const compiled = event.data?.compiled ?? event.info?.compiled_code;
    if (typeof compiled === "string" && compiled.trim()) return compiled.trim();
    const msg = event.info?.msg;
    if (typeof msg !== "string") continue;
    const m = COMPILED.exec(msg);
    if (m) return msg.slice(m.index + m[0].length).trim() || undefined;
  }
  return undefined;
}

/** The leading balanced JSON value of `s` (brackets matched outside strings), or undefined. */
function balanced(s: string): string | undefined {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "[" || c === "{") depth++;
    else if ((c === "]" || c === "}") && --depth === 0) return s.slice(0, i + 1);
  }
  return undefined;
}

/** dbt's error, without the noise: Fusion's `[error]` blocks, a JSON log's error events, else the last lines of
 * output. */
export function dbtError(stdout: string, stderr: string): string {
  const all = `${stderr}\n${stdout}`;
  const blocks = all.split(/\n(?=\[(?:error|warning)\])/).filter((b) => b.trimStart().startsWith("[error]"));
  if (blocks.length) return blocks.map((b) => b.trim()).join("\n\n");
  const errors = jsonErrors(all);
  if (errors) return errors;
  const lines = all.split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(-25).join("\n") || "dbt failed without output";
}

/** The messages of `--log-format json`'s error events, which is where dbt puts the error itself. */
function jsonErrors(all: string): string | undefined {
  const messages: string[] = [];
  for (const line of all.split(/\r?\n/)) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    try {
      const event = JSON.parse(text);
      if (event?.info?.level === "error" && typeof event.info.msg === "string") messages.push(event.info.msg.trim());
    } catch {
      // a log line that happens to start with a brace
    }
  }
  return messages.length ? messages.join("\n\n") : undefined;
}
