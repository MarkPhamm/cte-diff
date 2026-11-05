// Writes web/demo-rows.json: the rows the site's live demo shows, from running the extension's own SQL (cteQuery,
// compareQuery) for web/sample.ts on DuckDB, over its made-up tables. Needs the duckdb CLI.
// Run: node scripts/demo-rows.ts
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { compareCtes, cteQuery } from "../src/cte.ts";
import { compareQuery, type Row } from "../src/query.ts";
import { after, before, forDuckdb, tables } from "../web/sample.ts";

/** The query's rows. The CLI prints decimals as strings; dbt show returns them as numbers, so they become numbers. */
function run(sql: string): Row[] {
  const out = execFileSync("duckdb", ["-json", "-c", tables + forDuckdb(sql)], { encoding: "utf8" }).trim();
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
