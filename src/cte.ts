/* Finds the CTEs (nested ones too), the subqueries and the UNION branches of a SQL (or un-rendered dbt Jinja SQL) query, and builds the query that
 * selects one of them. No `vscode` import, so `node --test` runs this directly. */

export interface Cte {
  /** As written, quotes included: what goes into `select * from <name>`. */
  name: string;
  /** Offsets of the name in the text. */
  start: number;
  end: number;
  /** Offset of the `(` that opens the CTE's body. */
  bodyStart: number;
  /** Offset just past the CTE's closing parenthesis. */
  bodyEnd: number;
}

export interface Parsed {
  /** Offset of the top-level `with`, or -1 when the query has none. */
  withStart: number;
  ctes: Cte[];
}

interface Token {
  kind: "word" | "quoted" | "punct" | "jinja";
  text: string;
  start: number;
  end: number;
}

const isWord = (t: Token | undefined, w: string) => t?.kind === "word" && t.text.toLowerCase() === w;
const isIdent = (t: Token | undefined) => t?.kind === "word" || t?.kind === "quoted";

/** Tokens outside strings and comments: words, "quoted identifiers", single punctuation, and whole Jinja tags. */
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
    else if (two === "{{" || two === "{%" || two === "{#") {
      const start = i;
      i = skipTo(two === "{{" ? "}}" : two === "{%" ? "%}" : "#}", i + 2);
      yield { kind: "jinja", text: sql.slice(start, i), start, end: i };
    } else if (two === "$$") i = skipTo("$$", i + 2);
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
  const next = (): Token | undefined => {
    for (let v = it.next(); !v.done; v = it.next()) if (v.value.kind !== "jinja") return v.value;
    return undefined;
  };
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
    t = next();
    // `as [not] materialized (...)`, as DuckDB and Postgres allow.
    if (isWord(t, "not")) t = next();
    if (isWord(t, "materialized")) t = next();
    if (t?.text !== "(") break;
    const bodyStart = t.start;
    const bodyEnd = skipGroup();
    if (bodyEnd === undefined) break;
    ctes.push({ name: name.text, start: name.start, end: name.end, bodyStart, bodyEnd });
    t = next();
    if (t?.text !== ",") break;
    t = next();
  }
  return { withStart, ctes };
}

/** The CTEs of `cte`'s own WITH, when its body starts with one, with offsets in `sql`. */
export function innerCtes(sql: string, cte: Cte): Cte[] {
  const from = cte.bodyStart + 1;
  const own = parse(sql.slice(from, cte.bodyEnd - 1));
  return own.ctes.map((c) => ({ name: c.name, start: c.start + from, end: c.end + from, bodyStart: c.bodyStart + from, bodyEnd: c.bodyEnd + from }));
}

/** A CTE defined in another CTE's own WITH. */
export interface NestedCte extends Cte {
  /** Names of the CTEs holding it, outermost first. */
  path: string[];
}

/** Every CTE inside another CTE's WITH, at any depth, in source order. */
export function nestedCtes(sql: string): NestedCte[] {
  const out: NestedCte[] = [];
  const walk = (holder: Cte, path: string[]) => {
    for (const c of innerCtes(sql, holder)) {
      out.push({ ...c, path });
      walk(c, [...path, c.name]);
    }
  };
  for (const c of parse(sql).ctes) walk(c, [c.name]);
  return out;
}

/** The CTE `name` inside the CTEs named by `path` (outermost first; empty for a top-level CTE), and those holders. */
export function findCte(sql: string, name: string, path: string[] = []): { cte: Cte; holders: Cte[] } | undefined {
  let ctes = parse(sql).ctes;
  const holders: Cte[] = [];
  for (const p of path) {
    const holder = ctes.find((c) => sameName(c.name, p));
    if (!holder) return undefined;
    holders.push(holder);
    ctes = innerCtes(sql, holder);
  }
  const cte = ctes.find((c) => sameName(c.name, name));
  return cte && { cte, holders };
}

/** How a CTE is named in messages: `holder.inner` for a nested one. */
export const cteLabel = (name: string, path: string[] = []) => [...path, name].join(".");

/** The query that selects CTE `name` (matched case-insensitively, as Snowflake does for unquoted names), or the
 * whole query when `name` is undefined. Text before the `with` (dbt `{{ config() }}`, `{% set %}`) is kept. A CTE
 * nested in others' WITHs (`path`, outermost first) keeps that nesting: each holder selects the CTE inside it, so names
 * resolve as they do in the model. */
export function cteQuery(sql: string, name?: string, path: string[] = []): string {
  if (name === undefined) return sql.trim().replace(/;+$/, "").trimEnd();
  const found = findCte(sql, name, path);
  if (!found) throw new Error(`No CTE named ${cteLabel(name, path)}`);
  // shortcut: a holder with a column list, `h (a, b) as (...)`, renames the inner CTE's columns or fails on a count
  // mismatch; rare in dbt models, revisit if someone hits it.
  const names = [...found.holders, found.cte].map((c) => c.name);
  let tail = "";
  for (let i = names.length - 1; i > 0; i--) tail += `\nselect * from ${names[i]})`;
  return `${sql.slice(0, found.cte.bodyEnd)}${tail}\nselect * from ${names[0]}`;
}

const norm = (s: string) => (s.startsWith('"') ? s : s.toUpperCase());

export function sameName(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

/** A parenthesized SELECT (or WITH) inside the query: a derived table, or an EXISTS / IN / scalar subquery. */
export interface Subquery {
  /** Offset of its first word, `select` or `with`. */
  start: number;
  /** Offset just past its closing parenthesis. */
  end: number;
  /** Offsets of its parentheses. */
  open: number;
  close: number;
  /** Index of the top-level CTE holding it, or -1 for the query after the CTEs. */
  cte: number;
}

/** Every subquery, in source order. A CTE's own body, nested ones' too, is not one: CTEs have their own preview. */
export function subqueries(sql: string): Subquery[] {
  const { withStart, ctes } = parse(sql);
  const bodies = new Set([...ctes, ...nestedCtes(sql)].map((c) => c.bodyStart));
  const first = sql.search(/\S/);
  const out: Subquery[] = [];
  const stack: { open: number; first?: Token }[] = [];
  for (const t of tokens(sql)) {
    if (t.kind === "jinja") continue;
    if (t.text === "(") {
      stack.push({ open: t.start });
      continue;
    }
    if (t.text === ")") {
      const g = stack.pop();
      if (!g?.first || bodies.has(g.open)) continue;
      if (!isWord(g.first, "select") && !isWord(g.first, "with")) continue;
      // `(with ...) select ...` and a query wrapped whole in parentheses are the query, not a subquery.
      if (withStart > g.open && withStart < t.end) continue;
      if (g.open === first && !sql.slice(t.end).trim()) continue;
      let cte = -1;
      for (let i = 0; i < ctes.length; i++) if (ctes[i].bodyStart < g.open && t.end <= ctes[i].bodyEnd) cte = i;
      out.push({ start: g.first.start, end: t.end, open: g.open, close: t.start, cte });
      continue;
    }
    const top = stack[stack.length - 1];
    if (top && !top.first) top.first = t;
  }
  return out.sort((a, b) => a.start - b.start);
}

interface Positioned {
  token: Token;
  depth: number;
}

/** Tokens in `[start, end)` with their parenthesis depth, the range's own level being 0. */
function tokensInRange(sql: string, start: number, end: number): Positioned[] {
  const out: Positioned[] = [];
  let depth = 0;
  for (const token of tokens(sql)) {
    if (token.end <= start) continue;
    if (token.start >= end) break;
    if (token.text === ")") depth--;
    out.push({ token, depth: Math.max(0, depth) });
    if (token.text === "(") depth++;
  }
  return out;
}

/** The index after the `)` that closes the group opened at `i`. */
function skipGroupAt(toks: Positioned[], i: number): number {
  const depth = toks[i]?.depth;
  if (depth === undefined) return i;
  for (let j = i + 1; j < toks.length; j++) if (toks[j].token.text === ")" && toks[j].depth === depth) return j + 1;
  return toks.length;
}

/** The relation a dbt `ref()` or `source()` names, to qualify its columns with. */
function jinjaName(text: string): string | undefined {
  if (!/\b(?:ref|source)\s*\(/.test(text)) return undefined;
  const names = [...text.matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => m[1] ?? m[2]);
  return names.at(-1)?.split(".").at(-1);
}

interface FromItem {
  /** Names a query can use to read it: its alias, else its table name's last parts. */
  keys: string[];
  /** As written, to put in a FROM clause. */
  text: string;
  start: number;
  end: number;
}

/** A relation in a FROM clause, with its alias if it has one. */
function relationAt(toks: Positioned[], i: number, sql: string): { keys: string[]; text: string; start: number; end: number; next: number } | undefined {
  while (i < toks.length && (isWord(toks[i].token, "lateral") || isWord(toks[i].token, "only"))) i++;
  const first = toks[i];
  if (!first) return undefined;
  const depth = first.depth;
  const start = first.token.start;
  let end = first.token.end;
  let keys: string[] = [];
  if (first.token.text === "(") {
    const close = skipGroupAt(toks, i);
    if (close <= i) return undefined;
    end = toks[close - 1].token.end;
    i = close;
  } else if (first.token.kind === "jinja") {
    const name = jinjaName(first.token.text);
    if (name) keys = [name];
    i++;
  } else if (isIdent(first.token)) {
    const parts = [first.token.text];
    i++;
    while (i + 1 < toks.length && toks[i].token.text === "." && toks[i].depth === depth && isIdent(toks[i + 1].token)) {
      parts.push(toks[i + 1].token.text);
      end = toks[i + 1].token.end;
      i += 2;
    }
    keys = parts.map((_, j) => parts.slice(j).join("."));
    if (i < toks.length && toks[i].token.text === "(" && toks[i].depth === depth) {
      const close = skipGroupAt(toks, i);
      end = toks[close - 1].token.end;
      i = close;
      keys = []; // a table function has no name to qualify it by
    }
  } else return undefined;
  // AS alias, or a bare alias.
  let j = i;
  if (j < toks.length && isWord(toks[j].token, "as")) j++;
  const alias = toks[j];
  if (alias && alias.depth === depth && isIdent(alias.token) && (alias.token.kind === "quoted" || !NOT_ALIAS.has(alias.token.text.toLowerCase()))) {
    keys = [alias.token.text];
    end = alias.token.end;
    i = j + 1;
  }
  return { keys, text: sql.slice(start, end), start, end, next: i };
}

const JOIN_WORDS = new Set(["left", "right", "full", "inner", "outer", "cross", "natural", "semi", "anti", "lateral", "asof"]);
const FROM_END = new Set([
  "where", "group", "having", "qualify", "order", "limit", "fetch", "union", "except", "intersect", "window",
  "connect", "start", "model", "sample", "pivot", "unpivot", "cluster", "distribute", "sort", "into", "for", "option",
]);
/** Words that end a relation's alias slot: an unquoted clause, join or operator, never a bare alias. */
const NOT_ALIAS = new Set([...FROM_END, ...JOIN_WORDS, "join", "on", "using", "as", "and", "or", "not", "in", "is", "null", "true", "false", "case", "when", "then", "else", "end", "asc", "desc", "offset", "tablesample", "at", "with", "all", "distinct", "by"]);

/** Whether a join, with any modifiers (`left outer`, `cross`, ...), starts at `i`. */
function isJoinStart(toks: Positioned[], i: number): boolean {
  const depth = toks[i]?.depth;
  for (let j = i; j < toks.length && j < i + 6 && toks[j].depth === depth; j++) {
    const t = toks[j].token;
    if (t.kind !== "word") return false;
    const w = t.text.toLowerCase();
    if (w === "join") return true;
    if (!JOIN_WORDS.has(w)) return false;
  }
  return false;
}

/** Reads a FROM clause from just after its `from`, adding each relation to `out`; returns the index after it. */
function parseFromList(toks: Positioned[], i: number, depth: number, sql: string, out: FromItem[]): number {
  let want = true;
  while (i < toks.length) {
    const { token, depth: d } = toks[i];
    if (d < depth) break;
    if (d === depth) {
      if (token.kind === "word" && FROM_END.has(token.text.toLowerCase())) break;
      if (want) {
        const relation = relationAt(toks, i, sql);
        if (!relation) return i;
        if (relation.keys.length) out.push({ keys: relation.keys, text: relation.text, start: relation.start, end: relation.end });
        i = relation.next;
        want = false;
        continue;
      }
      if (token.text === ",") {
        i++;
        want = true;
        continue;
      }
      if (isJoinStart(toks, i)) {
        while (i < toks.length && !(toks[i].depth === depth && isWord(toks[i].token, "join"))) i++;
        i++;
        want = true;
        continue;
      }
    }
    i = token.text === "(" ? skipGroupAt(toks, i) : i + 1;
  }
  return i;
}

/** The relations of a query block's own FROM clauses, not those of subqueries inside it. */
function topLevelFromItems(sql: string, start: number, end: number): FromItem[] {
  const toks = tokensInRange(sql, start, end);
  const items: FromItem[] = [];
  for (let i = 0; i < toks.length; i++) if (toks[i].depth === 0 && isWord(toks[i].token, "from")) i = parseFromList(toks, i + 1, 0, sql, items);
  return items;
}

interface Block {
  start: number;
  end: number;
  /** The narrowest block that holds it, or -1 for a top-level query block. */
  parent: number;
}

/** Every query block: each CTE's body (nested ones' too), the final query, and every subquery. */
function queryBlocks(sql: string, subs: Subquery[]): Block[] {
  const { ctes } = parse(sql);
  const blocks: Block[] = [...ctes, ...nestedCtes(sql)].map((c) => ({ start: c.bodyStart + 1, end: c.bodyEnd - 1, parent: -1 }));
  const last = ctes.at(-1);
  blocks.push({ start: last ? last.bodyEnd : 0, end: sql.length, parent: -1 });
  for (const s of subs) blocks.push({ start: s.open + 1, end: s.close, parent: -1 });
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    let parent = -1;
    for (let j = 0; j < blocks.length; j++) {
      const a = blocks[j];
      if (j === i || a.start > b.start || a.end < b.end || a.end - a.start <= b.end - b.start) continue;
      if (parent < 0 || a.end - a.start < blocks[parent].end - blocks[parent].start) parent = j;
    }
    b.parent = parent;
  }
  return blocks;
}

/** The names a block's FROM relations give columns: its own and its nested blocks'. */
function localAliases(sql: string, blocks: Block[], start: number, end: number): string[] {
  const keys: string[] = [];
  for (const b of blocks) {
    if (b.start < start || b.end > end) continue;
    for (const item of topLevelFromItems(sql, b.start, b.end)) keys.push(...item.keys);
  }
  return keys;
}

/** Where a block's own FROM relations are written, to skip them when looking for outer references. */
function fromRanges(sql: string, blocks: Block[], start: number, end: number): [number, number][] {
  const out: [number, number][] = [];
  for (const b of blocks) {
    if (b.start < start || b.end > end) continue;
    for (const item of topLevelFromItems(sql, b.start, b.end)) out.push([item.start, item.end]);
  }
  return out;
}

/** The `alias` of each `alias.column` in a stretch of SQL, ignoring its own FROM relations and `local` aliases. */
function qualifiedRefs(sql: string, start: number, end: number, local: Set<string>, ranges: [number, number][]): string[] {
  const toks = tokensInRange(sql, start, end);
  const inside = (t: Token) => ranges.some(([a, b]) => t.start >= a && t.end <= b);
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].token;
    if (t.kind === "jinja" || !isIdent(t)) continue;
    if (!(i + 2 < toks.length && toks[i + 1].token.text === "." && isIdent(toks[i + 2].token))) continue;
    let j = i + 2;
    while (j + 2 < toks.length && toks[j + 1].token.text === "." && isIdent(toks[j + 2].token)) j += 2;
    const chain = toks.slice(i, j + 1).map((x) => x.token);
    i = j;
    if (chain.some(inside)) continue;
    const qualifier = chain[0].text;
    if (!local.has(norm(qualifier))) out.push(qualifier);
  }
  return out;
}

/** The FROM relation that gives `key` its columns, from a block outwards: a sibling before an outer query's table. */
function resolveFromItem(sql: string, blocks: Block[], key: string, from: number): { item: FromItem; block: number } | undefined {
  for (let b = from; b >= 0; b = blocks[b].parent) {
    for (const item of topLevelFromItems(sql, blocks[b].start, blocks[b].end)) if (item.keys.some((k) => sameName(k, key))) return { item, block: b };
  }
  return undefined;
}

/** The outer FROM relations a correlated subquery reads, including the ones its own derived tables read. */
function outerFromItems(sql: string, sub: Subquery, blocks: Block[]): string[] {
  const target = blocks.findIndex((b) => b.start === sub.open + 1 && b.end === sub.close);
  if (target < 0) return [];
  const local = new Set(localAliases(sql, blocks, sub.open + 1, sub.close).map(norm));
  const ranges = fromRanges(sql, blocks, sub.open + 1, sub.close);
  const items: { text: string; start: number }[] = [];
  const seen = new Set<string>();
  const add = (key: string, from: number) => {
    const hit = resolveFromItem(sql, blocks, key, from);
    if (!hit) return;
    const id = `${hit.item.start}:${hit.item.end}`;
    if (seen.has(id)) return;
    seen.add(id);
    // A derived table in the outer query can itself read a sibling, as in `(select ... where p.id = o.id) x`. Add what
    // it reads first, so a preview's FROM stays left to right: `orders o, (select ... o.id) x`.
    const innerLocal = new Set(localAliases(sql, blocks, hit.item.start, hit.item.end).map(norm));
    const innerRanges = fromRanges(sql, blocks, hit.item.start, hit.item.end);
    for (const q of qualifiedRefs(sql, hit.item.start, hit.item.end, innerLocal, innerRanges)) add(q, hit.block);
    items.push({ text: hit.item.text, start: hit.item.start });
  };
  for (const q of qualifiedRefs(sql, sub.open + 1, sub.close, local, ranges)) add(q, blocks[target].parent);
  return items.map((i) => i.text);
}

/** `inner` with `outer` relations cross-joined into its own FROM clause, so its outer references resolve. */
function addFrom(inner: string, outer: string): string {
  const toks = tokensInRange(inner, 0, inner.length);
  for (const t of toks) if (t.depth === 0 && isWord(t.token, "from")) return `${inner.slice(0, t.token.end)} ${outer},${inner.slice(t.token.end)}`;
  for (const t of toks) {
    if (t.depth !== 0 || t.token.kind !== "word" || !FROM_END.has(t.token.text.toLowerCase())) continue;
    return `${inner.slice(0, t.token.start)}from ${outer} ${inner.slice(t.token.start)}`;
  }
  return `${inner} from ${outer}`;
}

const stripWith = (s: string) => s.replace(/^\s*with\s+(?:recursive\s+)?/i, "");

/** The text before the first thing that isn't Jinja: a model's `config()` block, usually. */
function leadingText(sql: string): string {
  for (const t of tokens(sql)) if (t.kind !== "jinja") return sql.slice(0, t.start);
  return "";
}

/** The top-level CTEs a subquery can read, plus any WITHs of the blocks around it, as one WITH clause. */
function previewPrefix(sql: string, ctes: Cte[], cteIndex: number, blocks: Block[], target: number): string {
  const { withStart } = parse(sql);
  const kept = cteIndex >= 0 ? cteIndex : ctes.length;
  const leading = withStart >= 0 ? sql.slice(0, withStart) : leadingText(sql);
  const parts: string[] = [];
  let recursive = false;
  if (kept > 0 && withStart >= 0) {
    const top = sql.slice(withStart, ctes[kept - 1].bodyEnd);
    recursive = /^\s*with\s+recursive\b/i.test(top);
    parts.push(stripWith(top));
  }
  const chain: number[] = [];
  // The target's own WITH stays in the query; only the blocks around it are hoisted, so it can read their CTEs.
  for (let b = blocks[target].parent; b >= 0; b = blocks[b].parent) chain.unshift(b);
  for (const [k, b] of chain.entries()) {
    const text = sql.slice(blocks[b].start, blocks[b].end);
    if (!/^\s*with\b/i.test(text)) continue;
    const p = parse(text);
    if (p.withStart < 0 || !p.ctes.length) continue;
    // Inside one of this WITH's CTEs, only the CTEs before that one are in scope.
    const inner = blocks[chain[k + 1] ?? target].start - blocks[b].start;
    const holder = p.ctes.findIndex((c) => c.bodyStart < inner && inner < c.bodyEnd);
    const kept = holder < 0 ? p.ctes : p.ctes.slice(0, holder);
    if (!kept.length) continue;
    const body = text.slice(p.withStart, kept.at(-1)!.bodyEnd);
    recursive ||= /^\s*with\s+recursive\b/i.test(body);
    parts.push(stripWith(body));
  }
  const withClause = parts.length ? `with ${recursive ? "recursive " : ""}${parts.join(",\n")}\n` : "";
  return `${leading}${leading && !leading.endsWith("\n") ? "\n" : ""}${withClause}`;
}

/** The item starting at `at`, or the nearest one on the same line: the text may have shifted since the lens was drawn. */
function nearest<T extends { start: number }>(sql: string, items: T[], at: number): T | undefined {
  const lineOf = (offset: number) => sql.slice(0, offset).split(/\r?\n/).length - 1;
  const line = lineOf(Math.max(0, Math.min(at, sql.length)));
  return (
    items.find((s) => s.start === at) ??
    items.filter((s) => lineOf(s.start) === line).sort((a, b) => Math.abs(a.start - at) - Math.abs(b.start - at))[0]
  );
}

/** The query that previews `sub`, one of `subs`, with the outer FROM relations it reads so correlation resolves. */
function blockQuery(sql: string, subs: Subquery[], sub: Subquery): string {
  const inner = sql.slice(sub.open + 1, sub.close).trim();
  const { ctes } = parse(sql);
  const blocks = queryBlocks(sql, subs);
  const target = blocks.findIndex((b) => b.start === sub.open + 1 && b.end === sub.close);
  const outer = outerFromItems(sql, sub, blocks);
  const query = outer.length ? addFrom(inner, outer.join(",\n    ")) : inner;
  return `${previewPrefix(sql, ctes, sub.cte, blocks, target)}${query}`.trim();
}

/** The query that previews the subquery at `at`, with the outer FROM relations it reads so correlation resolves. */
export function subqueryQuery(sql: string, at: number): string {
  const subs = subqueries(sql);
  const sub = nearest(sql, subs, at);
  if (!sub) throw new Error("That subquery moved. Click ▶ Preview subquery again.");
  return blockQuery(sql, subs, sub);
}

/** One SELECT of a UNION, INTERSECT, EXCEPT or MINUS, in a CTE body, the final query or a subquery. */
export interface Branch {
  /** Offset of its first word, and just past its last token. A trailing ORDER BY or LIMIT of the whole set is left out. */
  start: number;
  end: number;
  /** Index of the top-level CTE holding it, or -1 for the query after the CTEs. */
  cte: number;
}

const SET_OPS = new Set(["union", "intersect", "except", "minus"]);
const SET_OP_MODIFIERS = new Set(["all", "distinct", "by", "name"]);
const SET_TAIL = new Set(["order", "limit", "fetch", "offset"]);

/** Every branch of every set operation, in source order. A branch in parentheses is left to its subquery preview. */
export function branches(sql: string): Branch[] {
  const { ctes } = parse(sql);
  const out: Branch[] = [];
  for (const block of queryBlocks(sql, subqueries(sql))) {
    let from = block.start;
    // A block's own WITH comes before its branches; the preview hoists it.
    const own = parse(sql.slice(block.start, block.end));
    if (own.ctes.length && /^\s*with\b/i.test(sql.slice(block.start, block.end))) from = block.start + own.ctes.at(-1)!.bodyEnd;
    const toks = tokensInRange(sql, from, block.end);
    const parts: { first: number; last: number }[] = [];
    let first = -1;
    let last = -1;
    for (let i = 0; i < toks.length; i++) {
      const { token, depth } = toks[i];
      if (depth === 0 && token.kind === "word" && SET_OPS.has(token.text.toLowerCase())) {
        if (first >= 0) parts.push({ first, last });
        first = -1;
        while (i + 1 < toks.length && toks[i + 1].depth === 0 && SET_OP_MODIFIERS.has(toks[i + 1].token.text.toLowerCase())) i++;
        continue;
      }
      if (token.text === ";" || (first < 0 && token.kind === "jinja")) continue;
      if (first < 0) first = i;
      last = i;
    }
    if (first >= 0) parts.push({ first, last });
    if (parts.length < 2) continue;
    // ORDER BY / LIMIT after the last branch sorts the whole set, not that branch.
    const tail = parts.at(-1)!;
    for (let i = tail.first + 1; i <= tail.last; i++) {
      const { token, depth } = toks[i];
      if (depth === 0 && token.kind === "word" && SET_TAIL.has(token.text.toLowerCase())) {
        tail.last = i - 1;
        break;
      }
    }
    for (const p of parts) {
      if (toks[p.first].token.text === "(") continue;
      const start = toks[p.first].token.start;
      const end = toks[p.last].token.end;
      let cte = -1;
      for (let i = 0; i < ctes.length; i++) if (ctes[i].bodyStart < start && end <= ctes[i].bodyEnd) cte = i;
      out.push({ start, end, cte });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The query that previews the set-operation branch at `at`: the CTEs it can read, then the branch on its own. */
export function branchQuery(sql: string, at: number): string {
  const branch = nearest(sql, branches(sql), at);
  if (!branch) throw new Error("That branch moved. Click ▶ Preview branch again.");
  // Treated as a subquery of the block holding it, so that block's WITH and outer relations come along.
  const sub: Subquery = { start: branch.start, end: branch.end, open: branch.start - 1, close: branch.end, cte: branch.cte };
  return blockQuery(sql, [...subqueries(sql), sub], sub);
}

/** How a CTE differs between two versions of a query. `affected`: same text, but it reads a CTE that changed. */
export type Status = "added" | "removed" | "changed" | "affected" | "same";

/** A CTE's status, with the CTEs of its own WITH under it. */
export interface CteStatus {
  /** Undefined: the whole query. */
  name?: string;
  status: Status;
  nested?: CteStatus[];
}

/** One entry per CTE (the right side's order, then CTEs only on the left), then the whole query (`name` undefined).
 * A CTE with its own WITH lists those CTEs' statuses under `nested`, the same way. */
export function compareCtes(left: string, right: string): CteStatus[] {
  const l = parse(left).ctes;
  const r = parse(right).ctes;
  // A CTE's text from after its name to its closing parenthesis, whitespace collapsed; the final select after the last.
  const text = (sql: string, from: number, to: number) =>
    sql.slice(from, to).replace(/\s+/g, " ").replace(/ ?([(),;]) ?/g, "$1").trim();
  const finalText = (sql: string, ctes: Cte[]) => text(sql, ctes.at(-1)?.bodyEnd ?? 0, sql.length).replace(/;$/, "");
  // Names (normalised) that a stretch of SQL reads.
  const reads = (from: number, to: number) => {
    const out = new Set<string>();
    for (const t of tokens(right)) if (t.start >= from && t.end <= to && (t.kind === "word" || t.kind === "quoted")) out.add(norm(t.text));
    return out;
  };
  const statusOf = (dirty: Set<string>, changed: boolean, from: number, to: number): Status =>
    changed ? "changed" : [...reads(from, to)].some((w) => dirty.has(w)) ? "affected" : "same";
  // `dirty`: names, from outer WITHs too, that are changed, added, removed or affected; whatever reads them is affected.
  const compareList = (l: Cte[], r: Cte[], dirty: Set<string>): CteStatus[] => {
    const out: CteStatus[] = [];
    const removed = l.filter((c) => !r.some((x) => sameName(x.name, c.name)));
    for (const c of removed) dirty.add(norm(c.name));
    for (const c of r) {
      const old = l.find((x) => sameName(x.name, c.name));
      const status = old ? statusOf(dirty, text(left, old.end, old.bodyEnd) !== text(right, c.end, c.bodyEnd), c.end, c.bodyEnd) : "added";
      // Its own WITH sees the CTEs before it, not itself.
      const nested = compareList(old ? innerCtes(left, old) : [], innerCtes(right, c), new Set(dirty));
      // An inner CTE of the same name hides an outer one, so only its own status counts from here on.
      if (status === "same") dirty.delete(norm(c.name));
      else dirty.add(norm(c.name));
      out.push(nested.length ? { name: c.name, status, nested } : { name: c.name, status });
    }
    for (const c of removed) {
      const nested = compareList(innerCtes(left, c), [], new Set());
      out.push(nested.length ? { name: c.name, status: "removed", nested } : { name: c.name, status: "removed" });
    }
    return out;
  };
  const dirty = new Set<string>();
  const out = compareList(l, r, dirty);
  out.push({ status: statusOf(dirty, finalText(left, l) !== finalText(right, r), r.at(-1)?.bodyEnd ?? 0, right.length) });
  return out;
}
