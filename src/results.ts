/* The results view's HTML and CSS: a preview's rows, a comparison's paired rows. No `vscode` or `node:` import, so the
 * extension's panel (src/panel.ts) and the docs site's live demo (web/demo.ts) draw the same view. */
import { cutFrom, pairRows, type Comparison, type Row } from "./query.ts";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (x: number) => x.toLocaleString("en-US");
const plural = (k: number, word: string) => `${n(k)} ${word}${k === 1 ? "" : "s"}`;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** A cell; `changed` marks a value that differs from the row's other version. */
function cell(r: Row, c: string, changed = false): string {
  const cls = changed ? ["chg"] : [];
  if (!(c in r)) return '<td class="absent" title="Not a column on this side"></td>';
  const v = r[c];
  if (v === null || v === undefined) return `<td class="${["null", ...cls].join(" ")}">NULL</td>`;
  if (typeof v === "number") cls.push("num");
  const attr = cls.length ? ` class="${cls.join(" ")}"` : "";
  return `<td${attr}>${esc(typeof v === "object" ? JSON.stringify(v) : String(v))}</td>`;
}

/** Column names in first-seen order across all rows. */
function columns(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) seen.add(k);
  return [...seen];
}

/** A table under a sticky header; a column of numbers is right-aligned, header included. A header sorts the rows when
 * clicked; the toolbar above filters them, hides and pins columns, copies and saves (src/grid.ts). `pins` start pinned. */
function table(rows: Row[], cols: string[], first: string, body: string, pins: string[] = []): string {
  const numeric = (c: string) => rows.some((r) => typeof r[c] === "number") && rows.every((r) => r[c] == null || typeof r[c] === "number");
  const head = cols.map((c) => `<th tabindex="0" title="Sort"${numeric(c) ? ' class="num"' : ""}>${esc(c)}</th>`).join("");
  // The column picker's boxes carry the column's cell index (the row number or −/+ is cell 0).
  const picker = cols
    .map(
      (c, i) =>
        `<label><input type="checkbox" checked value="${i + 1}">${esc(c)}</label>` +
        `<label class="muted" title="Keep ${esc(c)} in view when scrolling sideways"><input type="checkbox" data-pin value="${i + 1}"${pins.includes(c) ? " checked" : ""}>pin</label>`,
    )
    .join("");
  const tools = `<div class="tools"><input class="filter" type="search" placeholder="Filter rows" aria-label="Filter rows"><details class="cols"><summary>Columns</summary><div class="menu">${picker}</div></details><span class="shown muted" aria-live="polite"></span>` +
    '<button type="button" data-copy="md" title="The selected cells, or every row shown, as a Markdown table">Copy Markdown</button>' +
    '<button type="button" data-save="csv" title="Every row shown, as a CSV file">Save CSV</button>' +
    '<button type="button" data-save="json" title="Every row shown, as a JSON file">Save JSON</button></div>';
  return `${tools}<div class="scroll" tabindex="0"><table><thead><tr><th class="${first}"></th>${head}</tr></thead>${body}</table></div>`;
}

/** The view's heading: what ran, where and how long it took (`meta`), and the counts under it. */
const heading = (what: string, stats: string[], meta?: string) =>
  `<h2>${esc(what)}</h2>${meta ? `<p class="meta muted">${esc(meta)}</p>` : ""}<div class="stats">${stats.join("")}</div>`;
const stat = (text: string, cls = "") => `<span class="stat ${cls}">${text}</span>`;

export function runningHtml(what: string, command = "dbt show"): string {
  return `<div class="progress"></div><h2>${esc(what)}</h2><p class="muted">Running <code>${esc(command)}</code>…</p>`;
}

/** An error; `title` says whether dbt failed or the run never started. */
export function errorHtml(message: string, title = "dbt failed"): string {
  return `<h2 class="bad">${esc(title)}</h2><pre class="error">${esc(message)}</pre><p class="muted">The full log, with the SQL that ran, is in Output › CTE Diff (the log button in this view's title bar).</p>`;
}

export function cancelledHtml(what: string): string {
  return `<h2>${esc(what)}</h2><p class="muted">Cancelled. <b>Run Again</b> is in this view's title bar.</p>`;
}

/** A comparison on a warehouse it has no SQL for: what does work, and where to ask for it. */
export function unsupportedHtml(warehouse: string, supported: readonly string[]): string {
  const ask = `https://github.com/MarkPhamm/cte-diff/issues/new?title=${encodeURIComponent(`Compare on ${warehouse}`)}`;
  const names = supported.length > 1 ? `${supported.slice(0, -1).join(", ")} and ${supported[supported.length - 1]}` : supported.join("");
  return `<h2>Compare doesn't run on ${esc(warehouse)} yet</h2>
<p>Comparisons run on ${esc(names)}. <b>▶ Preview</b> works on ${esc(warehouse)}.</p>
<p><a href="${ask}">Ask for ${esc(warehouse)}</a>: the warehouses people ask for come next.</p>`;
}

/** What Check Setup found: each check's value, and dbt debug's verdict with its output when it failed. */
export function setupHtml(checks: [string, string][], ok: boolean, output: string): string {
  const rows = checks.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
  const verdict = ok
    ? '<p class="verdict"><span class="good">✓</span> <code>dbt debug</code> passed: dbt finds the project, its profile and the warehouse.</p>'
    : `<p class="verdict"><span class="bad">✗</span> <code>dbt debug</code> failed.</p><pre class="error">${esc(output)}</pre>`;
  return `<h2>Setup</h2><table class="setup">${rows}</table>${verdict}`;
}

/** A preview: the rows, numbered, with row and column counts. */
export function rowsHtml(what: string, rows: Row[], limit: number, meta?: string): string {
  const cols = columns(rows);
  let body = heading(what, [stat(plural(rows.length, "row")), stat(plural(cols.length, "column"))], meta);
  if (rows.length >= limit) body += `<p class="muted">The first ${plural(limit, "row")}; sorting and filtering act on these. Raise <code>cteDiff.limit</code> for more.</p>`;
  if (rows.length) {
    const trs = rows.map((r, i) => `<tr><td class="idx">${i + 1}</td>${cols.map((c) => cell(r, c)).join("")}</tr>`).join("");
    body += table(rows, cols, "idx", `<tbody>${trs}</tbody>`);
  } else body += '<p class="muted">No rows.</p>';
  return body;
}

/** A comparison: counts, a verdict, then changed rows as old/new pairs and the rows only on one side. */
export function comparisonHtml(what: string, c: Comparison, limit: number, meta?: string): string {
  const k = c.counts;
  const p = pairRows(c);
  const stats = k
    ? [
        stat(`Left ${plural(k.left, "row")}`),
        stat(`Right ${plural(k.right, "row")}`),
        stat(`Only left ${n(k.only_left)}`, k.only_left ? "l" : ""),
        stat(`Only right ${n(k.only_right)}`, k.only_right ? "r" : ""),
      ]
    : [];
  let body = heading(what, stats, meta);
  if (!k) body += '<p class="muted">Row counts unavailable.</p>';
  const identical = k ? !k.only_left && !k.only_right : c.rows.length === 0;
  if (identical) {
    const verdict = !k ? "No differing rows." : k.left === k.right ? "Both sides return the same rows." : "Same distinct rows; the counts differ only by duplicates.";
    body += `<p class="verdict"><span class="good">✓</span> ${verdict}</p>`;
  } else {
    const parts = [p.pairs.length && plural(p.pairs.length, "changed row"), p.left.length && `${n(p.left.length)} only left`, p.right.length && `${n(p.right.length)} only right`];
    body += `<p class="verdict"><span class="bad">✗</span> The sides differ${p.pairs.length ? `: ${parts.filter(Boolean).join(", ")}` : ""}.</p>`;
  }
  const lcols = columns(c.rows.filter((r) => r.side === "left").map((r) => r.row));
  const rcols = columns(c.rows.filter((r) => r.side === "right").map((r) => r.row));
  const onlyL = lcols.filter((x) => !rcols.includes(x));
  const onlyR = rcols.filter((x) => !lcols.includes(x));
  if (lcols.length && rcols.length && (onlyL.length || onlyR.length)) {
    body += `<p class="warn">The columns differ, so every row does. Only left: ${esc(onlyL.join(", ") || "none")}. Only right: ${esc(onlyR.join(", ") || "none")}.</p>`;
  }
  const total = cutFrom(c, limit);
  if (total !== undefined) {
    body += `<p class="muted">The first ${n(c.rows.length)}${k ? ` of ${n(total)}` : ""} differing rows; sorting and filtering act on these. Raise <code>cteDiff.limit</code> for more.</p>`;
  }
  if (c.rows.length) {
    const cols = [...p.key, ...columns(c.rows.map((r) => r.row)).filter((x) => !p.key.includes(x))];
    const width = cols.length + 1;
    const row = (side: "l" | "r", r: Row, other?: Row, pair?: number) =>
      `<tr class="${side}"${pair === undefined ? "" : ` data-pair="${pair}"`}><td class="side">${side === "l" ? "−" : "+"}</td>${cols.map((x) => cell(r, x, !!other && !same(r[x], other[x]))).join("")}</tr>`;
    const group = (label: string, trs: string) => (trs ? `<tbody><tr class="group"><td colspan="${width}">${label}</td></tr>${trs}</tbody>` : "");
    body += table(
      c.rows.map((r) => r.row),
      cols,
      "side",
      group(
        `${plural(p.pairs.length, "changed row")}, matched on ${esc(p.key.join(", "))}: old (−) above new (+)`,
        p.pairs.map(([l, r], i) => row("l", l, r, i) + row("r", r, l, i)).join(""),
      ) +
        group(`Only on the left (old): ${n(p.left.length)}`, p.left.map((r) => row("l", r)).join("")) +
        group(`Only on the right (new): ${n(p.right.length)}`, p.right.map((r) => row("r", r)).join("")),
      p.key, // pinned, so a wide row still shows which row it is
    );
  }
  return body;
}

/** The view's CSS, in VS Code's theme variables. `:host` lets the site use it inside a shadow root; there
 * `--results-max` caps the table's height. */
export const RESULTS_CSS = `
body, :host { position: relative; display: block; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
  color: var(--vscode-foreground); padding: 4px 12px 12px; }
h2 { font-size: 1.1em; font-weight: 600; margin: 6px 0 6px; font-family: var(--vscode-editor-font-family); }
p { margin: 6px 0; }
.meta { margin: -2px 0 8px; }
a { color: var(--vscode-textLink-foreground); }
.setup th { position: static; background: none; padding-left: 0; }
code { font-family: var(--vscode-editor-font-family); }
.stats { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.stat { padding: 1px 8px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.stat.l { background: var(--vscode-diffEditor-removedTextBackground); color: var(--vscode-foreground); }
.stat.r { background: var(--vscode-diffEditor-insertedTextBackground); color: var(--vscode-foreground); }
.verdict { font-weight: 600; }
.good { color: var(--vscode-testing-iconPassed, var(--vscode-gitDecoration-addedResourceForeground)); }
.bad { color: var(--vscode-errorForeground); }
.scroll { overflow: auto; max-height: var(--results-max, calc(100vh - 120px)); border: 1px solid var(--vscode-panel-border); }
table { border-collapse: collapse; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
th { position: sticky; top: 0; z-index: 1; background: var(--vscode-editorGroupHeader-tabsBackground); text-align: left; font-weight: 600; }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 0 0 6px; }
.shown { white-space: nowrap; }
.filter { width: 220px; min-width: 0; flex: 0 1 auto; padding: 3px 6px; font: inherit; color: inherit; background: var(--vscode-input-background, transparent);
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; }
.filter:focus, .cols summary:focus-visible { outline: 1px solid var(--vscode-focusBorder, var(--vscode-foreground)); outline-offset: -1px; }
.cols { position: relative; }
.cols summary, .tools button { padding: 3px 8px; font: inherit; color: inherit; background: var(--vscode-button-secondaryBackground, transparent);
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 2px; cursor: pointer; list-style: none; user-select: none;
  white-space: nowrap; }
.cols summary:hover, .tools button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-editorGroupHeader-tabsBackground)); }
.tools button:focus-visible { outline: 1px solid var(--vscode-focusBorder, var(--vscode-foreground)); outline-offset: -1px; }
.tools [data-copy] { margin-left: auto; }
.cols summary::-webkit-details-marker { display: none; }
.cols .menu { display: grid; grid-template-columns: 1fr auto; position: absolute; z-index: 3; top: calc(100% + 4px); left: 0; min-width: 180px; max-height: 260px; overflow: auto; padding: 4px 0;
  background: var(--vscode-menu-background, var(--vscode-sideBar-background)); color: var(--vscode-menu-foreground, inherit);
  border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, .16)); }
.cols label { display: flex; align-items: center; gap: 6px; padding: 2px 10px; white-space: nowrap; font-family: var(--vscode-editor-font-family); }
.cols input { accent-color: var(--vscode-button-background, auto); }
.cols label:hover { background: var(--vscode-list-hoverBackground, var(--vscode-editorGroupHeader-tabsBackground)); }
th[tabindex] { cursor: pointer; user-select: none; }
th[data-sort=asc]::after { content: " ▲"; } th[data-sort=desc]::after { content: " ▼"; }
th[data-sort]:not([aria-sort])::after { opacity: .45; } /* a tie-breaker: an earlier sort */
th, td { padding: 3px 8px; border-bottom: 1px solid var(--vscode-panel-border); white-space: pre; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.idx { color: var(--vscode-editorLineNumber-foreground); text-align: right; }
.null, .muted { color: var(--vscode-descriptionForeground); }
.null { font-style: italic; }
.absent { background: repeating-linear-gradient(135deg, transparent 0 4px, var(--vscode-panel-border) 4px 5px); }
.group td { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-descriptionForeground);
  background: var(--vscode-sideBar-background); padding-top: 6px; }
.side { font-weight: 700; text-align: center; }
tr.l .side { color: var(--vscode-gitDecoration-deletedResourceForeground); }
tr.r .side { color: var(--vscode-gitDecoration-addedResourceForeground); }
tr.l .chg { background: var(--vscode-diffEditor-removedTextBackground); }
tr.r .chg { background: var(--vscode-diffEditor-insertedTextBackground); }
.scroll td:not([colspan]) { max-width: 40ch; overflow: hidden; text-overflow: ellipsis; }
dialog { max-width: min(860px, 92vw); max-height: 84vh; padding: 8px 14px 12px; color: var(--vscode-foreground);
  background: var(--vscode-panel-background, var(--vscode-editor-background, Canvas));
  border: 1px solid var(--vscode-panel-border); box-shadow: 0 4px 16px var(--vscode-widget-shadow, rgba(0, 0, 0, .25)); }
dialog::backdrop { background: rgba(0, 0, 0, .3); }
dialog header { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }
dialog header h2 { margin: 0; }
dialog header button { margin-left: auto; font: inherit; color: inherit; background: none; border: 0; cursor: pointer; font-size: 1.2em; }
.detail th { position: static; background: none; padding-left: 0; vertical-align: top; }
.detail td { white-space: pre-wrap; word-break: break-word; vertical-align: top; }
.detail td.old.chg { background: var(--vscode-diffEditor-removedTextBackground); }
.detail td.new.chg { background: var(--vscode-diffEditor-insertedTextBackground); }
.scroll:focus { outline: none; }
.scroll:focus-visible { outline: 1px solid var(--vscode-focusBorder, var(--vscode-foreground)); outline-offset: -1px; }
.scroll td.sel { background: var(--vscode-editor-selectionBackground, rgba(0, 95, 184, .18)); }
.warn { color: var(--vscode-editorWarning-foreground); }
.error { color: var(--vscode-errorForeground); white-space: pre-wrap; }
.progress { position: absolute; top: 0; left: 0; right: 0; height: 2px; overflow: hidden; }
.progress::after { content: ""; position: absolute; width: 30%; height: 100%; background: var(--vscode-progressBar-background);
  animation: slide 1.2s ease-in-out infinite; }
@keyframes slide { from { left: -30%; } to { left: 100%; } }
@media (prefers-reduced-motion: reduce) { .progress::after { animation: none; width: 100%; opacity: .5; } }
`;
