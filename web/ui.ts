/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/* What the landing page's live demo (web/demo.ts) and playground (web/playground.ts) both draw: coloured SQL, a line
 * diff, where the extension puts its buttons, the sidebar's list, and the results panel. */
import { parse, type Status } from "../src/cte.ts";
import { attach } from "../src/grid.ts";
import { RESULTS_CSS } from "../src/results.ts";

export type Side = "left" | "right";
export type Act = "preview" | "compare";

// The sidebar's marks and words for each status (src/tree.ts).
const MARK: Record<Status, string> = { changed: "~", added: "+", removed: "−", affected: "↓", same: "" };
const NOTE: Record<Status, string> = { changed: "changed", added: "new", removed: "removed", affected: "reads a changed CTE", same: "" };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Keywords bold, Jinja muted, strings tinted, comments faded: enough colour to read SQL. */
export function highlight(line: string): string {
  let out = "";
  let last = 0;
  for (const m of line.matchAll(/(--.*$)|(\{\{.*?\}\}|\{%.*?%\})|('(?:[^']|'')*')|\b(with|as|select|from|where|group|order|by|left|inner|join|on|using|and|or|not|in|union|all|except|case|when|then|else|end|distinct|limit)\b/gi)) {
    out += esc(line.slice(last, m.index));
    out += m[1] ? `<em>${esc(m[1])}</em>` : m[2] ? `<u>${esc(m[2])}</u>` : m[3] ? `<s>${esc(m[3])}</s>` : `<b>${m[4]}</b>`;
    last = m.index + m[0].length;
  }
  return out + esc(line.slice(last));
}

export interface DiffRow {
  l?: number;
  r?: number;
  changed?: boolean;
}

/** Side-by-side rows of a line diff (longest common subsequence): a removed and an added line share a row. */
export function diffRows(a: string[], b: string[]): DiffRow[] {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows: DiffRow[] = [];
  let dels: number[] = [];
  let adds: number[] = [];
  const flush = () => {
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ l: dels[k], r: adds[k], changed: true });
    dels = [];
    adds = [];
  };
  for (let i = 0, j = 0; i < a.length || j < b.length; ) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      flush();
      rows.push({ l: i++, r: j++ });
    } else if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) dels.push(i++);
    else adds.push(j++);
  }
  flush();
  return rows;
}

/** Line index → the CTE whose name starts there ("" for the final select): where the extension puts its CodeLens. */
export function lensLines(sql: string): Map<number, string> {
  const { withStart, ctes } = parse(sql);
  const lineOf = (offset: number) => sql.slice(0, offset).split("\n").length - 1;
  const out = new Map(ctes.map((c) => [lineOf(c.start), c.name] as const));
  if (!sql.trim()) return out;
  const last = ctes.at(-1);
  const finalAt = last ? sql.slice(last.bodyEnd).search(/\S/) : -1;
  out.set(lineOf(last && finalAt >= 0 ? last.bodyEnd + finalAt : Math.max(withStart, sql.search(/\S/))), "");
  return out;
}

export const button = (act: Act, side: Side, name: string, text: string, label: string) =>
  `<button type="button" data-act="${act}" data-side="${side}" data-name="${esc(name)}" title="${esc(label)}">${text}</button>`;

/** The sidebar's list: every CTE of both sides, marked, with ← → ⇄ (shown on hover). */
export function sidebarList(statuses: { name?: string; status: Status }[]): string {
  return statuses
    .map(({ name, status }, i) => {
      const key = name ?? "";
      const label = name ?? "(whole query)";
      const btns = [
        status !== "added" && button("preview", "left", key, "←", `Preview ${label}, left (old)`),
        status !== "removed" && button("preview", "right", key, "→", `Preview ${label}, right (new)`),
        status !== "added" && status !== "removed" && button("compare", "right", key, "⇄", `Compare ${label} on both sides`),
      ];
      return `<li class="cd-${status}" data-name="${esc(key)}" style="--i:${i}"><span class="cd-mark">${MARK[status]}</span><span class="cd-name">${esc(label)}</span><em>${NOTE[status]}</em><span class="cd-side__btns">${btns.filter(Boolean).join("")}</span></li>`;
    })
    .join("");
}

/** "2 changed · 1 new", as the sidebar's message says it. */
export function summary(statuses: { status: Status }[]): string {
  const count = (s: Status) => statuses.filter((x) => x.status === s).length;
  const note = (s: Status) => (count(s) > 1 ? NOTE[s].replace("reads", "read") : NOTE[s]); // "2 read a changed CTE"
  return (["changed", "added", "removed", "affected"] as Status[]).filter(count).map((s) => `${count(s)} ${note(s)}`).join(" · ") || "No CTE changed.";
}

// Rows rise in one after another, like the rest of the page.
const MOTION = `@media (prefers-reduced-motion: no-preference) {
  h2, .stats, .verdict, .warn, .scroll, pre { animation: rise .3s cubic-bezier(.2,.8,.2,1) both; }
  .stats { animation-delay: .05s } .verdict, .warn { animation-delay: .1s } .scroll { animation-delay: .14s }
  table:not([data-sorted]) tbody tr { animation: rise .3s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(.18s + var(--i, 0) * 40ms); }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } } }
.sql { margin: 0; font: var(--vscode-editor-font-size)/1.6 var(--vscode-editor-font-family); white-space: pre; }
.sql b { font-weight: 600; } .sql u { text-decoration: none; color: var(--vscode-descriptionForeground); }
.sql s { text-decoration: none; color: var(--vscode-editorWarning-foreground); } .sql em { color: var(--vscode-descriptionForeground); }`;

/** The results view inside `host` (a shadow root keeps the extension's CSS to itself). */
export function resultsPanel(host: HTMLElement): (html: string) => void {
  const shadow = host.attachShadow({ mode: "open" });
  return (html) => {
    shadow.innerHTML = `<style>${RESULTS_CSS}${MOTION}</style>${html}`;
    shadow.querySelectorAll<HTMLElement>("tbody tr").forEach((tr, i) => tr.style.setProperty("--i", String(i)));
    attach(shadow);
  };
}
