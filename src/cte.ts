/* Finds the top-level CTEs of a SQL (or un-rendered dbt Jinja SQL) query and builds the query that selects one of
 * them. No `vscode` import, so `node --test` runs this directly. */

export interface Cte {
  /** As written, quotes included: what goes into `select * from <name>`. */
  name: string;
  /** Offsets of the name in the text. */
  start: number;
  end: number;
  /** Offset just past the CTE's closing parenthesis. */
  bodyEnd: number;
}

export interface Parsed {
  /** Offset of the top-level `with`, or -1 when the query has none. */
  withStart: number;
  ctes: Cte[];
}

interface Token {
  kind: "word" | "quoted" | "punct";
  text: string;
  start: number;
  end: number;
}

/** Tokens outside strings, comments and Jinja tags: words, "quoted identifiers", and single punctuation. */
function* tokens(sql: string): Generator<Token> {
  let i = 0;
  const n = sql.length;
  const skipTo = (close: string, from: number) => {
    const j = sql.indexOf(close, from);
    return j < 0 ? n : j + close.length;
  };
  while (i < n) {
    const c = sql[i];
    const two = sql.slice(i, i + 2);
    if (/\s/.test(c)) i++;
    else if (two === "--" || two === "//") i = skipTo("\n", i);
    else if (two === "/*") i = skipTo("*/", i + 2);
    else if (two === "{{") i = skipTo("}}", i + 2);
    else if (two === "{%") i = skipTo("%}", i + 2);
    else if (two === "{#") i = skipTo("#}", i + 2);
    else if (two === "$$") i = skipTo("$$", i + 2);
    else if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "\\") i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i++;
      }
      i++;
    } else if (c === '"') {
      const start = i++;
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') break;
        else i++;
      }
      i++;
      yield { kind: "quoted", text: sql.slice(start, i), start, end: i };
    } else if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < n && /[\w$]/.test(sql[i])) i++;
      yield { kind: "word", text: sql.slice(start, i), start, end: i };
    } else {
      yield { kind: "punct", text: c, start: i, end: ++i };
    }
  }
}

/** The top-level CTEs. Lenient: stops at the first thing it doesn't understand and keeps what it found. */
export function parse(sql: string): Parsed {
  const it = tokens(sql);
  const next = () => it.next().value as Token | undefined;
  const isWord = (t: Token | undefined, w: string) => t?.kind === "word" && t.text.toLowerCase() === w;
  // Skips a balanced parenthesised group whose "(" was just read; returns the offset past its ")".
  const skipGroup = (): number | undefined => {
    for (let depth = 1, t = next(); t; t = next()) {
      if (t.text === "(") depth++;
      else if (t.text === ")" && --depth === 0) return t.end;
    }
    return undefined;
  };

  let t = next();
  while (t?.text === "(") t = next(); // `(with ...)` wrapped in parentheses
  if (!isWord(t, "with")) return { withStart: -1, ctes: [] };
  const withStart = t!.start;
  const ctes: Cte[] = [];
  t = next();
  if (isWord(t, "recursive")) t = next();
  while (t && (t.kind === "word" || t.kind === "quoted")) {
    const name = t;
    t = next();
    if (t?.text === "(") {
      if (skipGroup() === undefined) break; // column list: `name (a, b) as (...)`
      t = next();
    }
    if (!isWord(t, "as")) break;
    if (next()?.text !== "(") break;
    const bodyEnd = skipGroup();
    if (bodyEnd === undefined) break;
    ctes.push({ name: name.text, start: name.start, end: name.end, bodyEnd });
    t = next();
    if (t?.text !== ",") break;
    t = next();
  }
  return { withStart, ctes };
}

/** The query that selects CTE `name` (matched case-insensitively, as Snowflake does for unquoted names), or the
 * whole query when `name` is undefined. Text before the `with` (dbt `{{ config() }}`, `{% set %}`) is kept. */
export function cteQuery(sql: string, name?: string): string {
  if (name === undefined) return sql.trim().replace(/;+$/, "").trimEnd();
  const cte = parse(sql).ctes.find((c) => sameName(c.name, name));
  if (!cte) throw new Error(`No CTE named ${name}`);
  return `${sql.slice(0, cte.bodyEnd)}\nselect * from ${cte.name}`;
}

const norm = (s: string) => (s.startsWith('"') ? s : s.toUpperCase());

export function sameName(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

/** How a CTE differs between two versions of a query. `affected`: same text, but it reads a CTE that changed. */
export type Status = "added" | "removed" | "changed" | "affected" | "same";

/** One entry per CTE (the right side's order, then CTEs only on the left), then the whole query (`name` undefined). */
export function compareCtes(left: string, right: string): { name?: string; status: Status }[] {
  const l = parse(left).ctes;
  const r = parse(right).ctes;
  // A CTE's text from after its name to its closing parenthesis, whitespace collapsed; the final select after the last.
  const text = (sql: string, from: number, to: number) =>
    sql.slice(from, to).replace(/\s+/g, " ").replace(/ ?([(),;]) ?/g, "$1").trim();
  const finalText = (sql: string, ctes: Cte[]) => text(sql, ctes.at(-1)?.bodyEnd ?? 0, sql.length).replace(/;$/, "");
  // Names (normalised) that a stretch of SQL reads.
  const reads = (sql: string, from: number, to: number) => {
    const out = new Set<string>();
    for (const t of tokens(sql)) if (t.start >= from && t.end <= to && t.kind !== "punct") out.add(norm(t.text));
    return out;
  };
  const dirty = new Set<string>(); // changed, added, removed or affected: whatever reads them is affected
  const out: { name?: string; status: Status }[] = [];
  const removed = l.filter((c) => !r.some((x) => sameName(x.name, c.name)));
  for (const c of removed) dirty.add(norm(c.name));
  const statusOf = (changed: boolean, from: number, to: number): Status =>
    changed ? "changed" : [...reads(right, from, to)].some((w) => dirty.has(w)) ? "affected" : "same";
  for (const c of r) {
    const old = l.find((x) => sameName(x.name, c.name));
    const status = old ? statusOf(text(left, old.end, old.bodyEnd) !== text(right, c.end, c.bodyEnd), c.end, c.bodyEnd) : "added";
    if (status !== "same") dirty.add(norm(c.name));
    out.push({ name: c.name, status });
  }
  for (const c of removed) out.push({ name: c.name, status: "removed" });
  out.push({ status: statusOf(finalText(left, l) !== finalText(right, r), r.at(-1)?.bodyEnd ?? 0, right.length) });
  return out;
}
