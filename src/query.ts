/* The Snowflake SQL a comparison runs, and reading `dbt show --output json` back. No `vscode` import. */

export type Row = Record<string, unknown>;

/** Rows only on one side, plus row counts: one query, so one dbt run. Each row becomes the JSON of an OBJECT, whose keys
 * Snowflake keeps sorted, so columns match by name, not position, and a column missing on one side shows as a
 * difference instead of an error.
 * shortcut: EXCEPT is a set operation, so duplicate rows count once; key-based matching would catch duplicates. */
export function compareQuery(left: string, right: string): string {
  return `with __l as (select to_json(object_construct_keep_null(*)) as __row from (
${left}
)),
__r as (select to_json(object_construct_keep_null(*)) as __row from (
${right}
)),
__only_l as (select __row from __l except select __row from __r),
__only_r as (select __row from __r except select __row from __l)
select * from (
  select 0 as __k, 'counts' as __side, to_json(object_construct(
    'left', (select count(*) from __l), 'right', (select count(*) from __r),
    'only_left', (select count(*) from __only_l), 'only_right', (select count(*) from __only_r))) as __row
  union all select 1, 'left', __row from __only_l
  union all select 1, 'right', __row from __only_r
) order by __k, __row, __side`;
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

/** Reads compareQuery's rows. Column names come back in whatever case the warehouse uses. */
export function readComparison(rows: Row[]): Comparison {
  const get = (r: Row, k: string) => r[k] ?? r[k.toUpperCase()];
  const out: Comparison = { rows: [] };
  for (const r of rows) {
    const side = get(r, "__side");
    const row = JSON.parse(String(get(r, "__row")));
    if (side === "counts") out.counts = row;
    else out.rows.push({ side: side === "left" ? "left" : "right", row });
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

/** dbt's error, without the noise: Fusion's `[error]` blocks, else the last lines of output. */
export function dbtError(stdout: string, stderr: string): string {
  const all = `${stderr}\n${stdout}`;
  const blocks = all.split(/\n(?=\[(?:error|warning)\])/).filter((b) => b.trimStart().startsWith("[error]"));
  if (blocks.length) return blocks.map((b) => b.trim()).join("\n\n");
  const lines = all.split(/\r?\n/).filter((l) => l.trim());
  return lines.slice(-25).join("\n") || "dbt failed without output";
}
