/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/* The landing page's playground: two editable queries, coloured, their changed lines tinted, ▶ Preview and ⇄ Compare
 * on each CTE as in the extension. The sidebar and the results panel are the live demo's (web/ui.ts). Rows come from
 * running the extension's own SQL on DuckDB in the browser (duckdb-wasm from jsDelivr, loaded once the playground is
 * near the screen) over web/sample.ts's made-up tables, and rerun as you type. The SQL tab shows that SQL for Snowflake
 * or DuckDB. Bundled by `npm run site:js` into docs/javascripts/playground.js. */
import { compareCtes, cteQuery, type Status } from "../src/cte.ts";
import { compareQuery, forAdapter, readComparison, type Row } from "../src/query.ts";
import { comparisonHtml, rowsHtml, runningHtml } from "../src/results.ts";
import { after, before, forDuckdb, tables } from "./sample.ts";
import { button, diffRows, esc, highlight, lensLines, resultsPanel, sidebarList, summary, type Act, type Side } from "./ui.ts";

const DUCKDB = "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/+esm";
const LH = 20; // editor line height, px: the coloured copy, the gutter and the buttons line up with the textarea by it
const PAD = 10;

/** The duckdb-wasm calls the playground makes. */
interface Conn {
  query(sql: string): Promise<{ toArray(): { toJSON(): Row }[] }>;
}

let engine: Promise<Conn> | undefined;
/** DuckDB in the browser, with the made-up tables: loaded on first use, again after a failure. */
function duck(onState: (s: string) => void): Promise<Conn> {
  engine ??= (async () => {
    onState("loading");
    const url = DUCKDB; // a variable, so the bundler leaves the import to the browser
    const duckdb = await import(url);
    const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
    const worker = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" }));
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(worker));
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker);
    const conn: Conn = await db.connect();
    for (const stmt of tables.split(";").filter((s) => s.trim())) await conn.query(stmt);
    onState("ready");
    return conn;
  })().catch((e) => {
    engine = undefined;
    onState("failed");
    throw e;
  });
  return engine;
}

/** The rows of `sql` as dbt show would give them: numbers as numbers, dates and the rest as text. */
async function rowsOf(conn: Conn, sql: string): Promise<Row[]> {
  await conn.query(`create or replace temp table __result as ${sql}`);
  const cols = (await conn.query("describe __result")).toArray().map((r) => r.toJSON() as { column_name: string; column_type: string });
  const pick = cols.map(({ column_name, column_type }) => {
    const q = `"${column_name.replace(/"/g, '""')}"`;
    if (/^(INTEGER|SMALLINT|TINYINT|DOUBLE|FLOAT|VARCHAR|BOOLEAN)$/.test(column_type)) return q;
    return /^(BIGINT|HUGEINT|UBIGINT|UINTEGER|USMALLINT|UTINYINT|DECIMAL|REAL)/.test(column_type) ? `${q}::double as ${q}` : `${q}::varchar as ${q}`;
  });
  return (await conn.query(`select ${pick.join(", ") || "*"} from __result`)).toArray().map((r) => r.toJSON());
}

const root = document.getElementById("qp");
if (root) {
  const editor = (side: Side, label: string) =>
    `<div class="qp-ed" data-side="${side}"><div class="qp-ed__head">${label}</div><div class="qp-ed__body">` +
    `<div class="qp-gutter" aria-hidden="true"><div></div></div><div class="qp-code"><pre class="qp-hl" aria-hidden="true"><div></div></pre>` +
    `<textarea spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="${label}"></textarea><div class="qp-lenses"><div></div></div></div></div></div>`;
  root.innerHTML =
    `<div class="cd-win__bar"><i></i><i></i><i></i><span>old.sql ↔ new.sql</span><b class="qp-engine"></b></div>` +
    `<div class="qp-editors">${editor("left", "Old (left)")}${editor("right", "New (right)")}</div>` +
    `<div class="cd-win__body qp-body"><aside class="cd-side"><div class="cd-side__head"><b>CTE Diff</b> old.sql ↔ new.sql</div><p class="cd-side__msg"></p><ul class="cd-side__list"></ul>` +
    `<button class="qp-reset" type="button">Reset the example</button></aside>` +
    `<section class="cd-panel" aria-label="Results"><div class="cd-panel__tabs" role="tablist"><button type="button" role="tab" data-tab="rows">Rows</button><button type="button" role="tab" data-tab="sql">SQL</button>` +
    `<span class="qp-adapter" role="group" aria-label="Warehouse the SQL is for"><button type="button" data-adapter="snowflake">Snowflake</button><button type="button" data-adapter="duckdb">DuckDB</button></span>` +
    `<em class="cd-panel__title"></em></div><div class="cd-panel__body" aria-live="polite"></div></section></div>`;

  const eds = Object.fromEntries(
    [...root.querySelectorAll<HTMLElement>(".qp-ed")].map((ed) => [
      ed.dataset.side as Side,
      {
        text: ed.querySelector("textarea")!,
        hl: ed.querySelector<HTMLElement>(".qp-hl > div")!,
        gutter: ed.querySelector<HTMLElement>(".qp-gutter > div")!,
        lenses: ed.querySelector<HTMLElement>(".qp-lenses > div")!,
      },
    ]),
  ) as Record<Side, { text: HTMLTextAreaElement; hl: HTMLElement; gutter: HTMLElement; lenses: HTMLElement }>;
  const list = root.querySelector<HTMLElement>(".cd-side__list")!;
  const msg = root.querySelector<HTMLElement>(".cd-side__msg")!;
  const title = root.querySelector<HTMLElement>(".cd-panel__title")!;
  const engineEl = root.querySelector<HTMLElement>(".qp-engine")!;
  const show = resultsPanel(root.querySelector<HTMLElement>(".cd-panel__body")!);

  let sel: { act: Act; side: Side; name: string } = { act: "compare", side: "right", name: "order_payments" };
  let tab: "rows" | "sql" = "rows";
  let adapter = "duckdb";
  let statusOf = new Map<string, Status>();
  let near = false; // the playground has come near the screen: DuckDB may load
  let latest = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const ENGINE: Record<string, string> = { loading: "DuckDB: loading…", ready: "DuckDB in your browser", failed: "DuckDB: failed to load" };
  const setEngine = (s: string) => {
    engineEl.textContent = ENGINE[s] ?? "";
    engineEl.dataset.state = s;
  };

  /** Colours both editors, tints their changed lines, and puts the buttons on each CTE; refreshes the sidebar. */
  function paint(): void {
    const L = eds.left.text.value.split("\n");
    const R = eds.right.text.value.split("\n");
    const rows = L.length * R.length <= 250_000 ? diffRows(L, R) : []; // shortcut: no tint on very long pastes
    const changed = { left: new Set(rows.filter((r) => r.changed).map((r) => r.l)), right: new Set(rows.filter((r) => r.changed).map((r) => r.r)) };
    const statuses = compareCtes(eds.left.text.value, eds.right.text.value);
    statusOf = new Map(statuses.map((s) => [s.name ?? "", s.status]));
    if (!statusOf.has(sel.name) || !can(sel)) sel = { act: "compare", side: "right", name: "" };
    for (const side of ["left", "right"] as Side[]) {
      const ed = eds[side];
      const lines = side === "left" ? L : R;
      ed.hl.innerHTML = lines.map((t, i) => `<div class="${changed[side].has(i) ? (side === "left" ? "del" : "add") : ""}">${highlight(t) || " "}</div>`).join("");
      ed.gutter.innerHTML = lines.map((_, i) => `<div>${i + 1}</div>`).join("");
      ed.lenses.innerHTML = [...lensLines(ed.text.value)]
        .map(([i, name]) => {
          const label = name || "the whole query";
          const both = statusOf.get(name) !== "added" && statusOf.get(name) !== "removed";
          return `<span class="qp-lens" style="top:${PAD + i * LH}px">${button("preview", side, name, name ? "▶ Preview" : "▶ Preview query", `Preview ${label}, ${side === "left" ? "old" : "new"}`)}${both ? button("compare", side, name, "⇄ Compare sides", `Compare ${label} on both sides`) : ""}</span>`;
        })
        .join("");
    }
    msg.textContent = summary(statuses);
    list.innerHTML = sidebarList(statuses);
    mark();
  }

  /** Whether the CTE is on the side(s) the action needs. */
  function can(s: typeof sel): boolean {
    const st = statusOf.get(s.name);
    if (s.act === "compare") return st !== "added" && st !== "removed";
    return s.side === "left" ? st !== "added" : st !== "removed";
  }

  /** Highlights what is selected: the sidebar row, the button that ran, the tab, the adapter. */
  function mark(): void {
    list.querySelectorAll<HTMLElement>("li").forEach((li) => li.classList.toggle("cd-sel", li.dataset.name === sel.name));
    root!.querySelectorAll<HTMLElement>(".qp-lens button").forEach((b) => {
      const d = b.dataset;
      b.classList.toggle("cd-hit", d.name === sel.name && d.act === sel.act && (sel.act === "compare" || d.side === sel.side));
    });
    root!.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => {
      b.classList.toggle("on", b.dataset.tab === tab);
      b.setAttribute("aria-selected", String(b.dataset.tab === tab));
    });
    root!.querySelectorAll<HTMLElement>("[data-adapter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.adapter === adapter)));
    root!.classList.toggle("qp--sql", tab === "sql");
  }

  /** The SQL the extension sends through dbt show for the selection, before dbt renders it. */
  function sqlOf(s: typeof sel): string {
    const name = s.name || undefined;
    const side = (which: Side) => {
      try {
        return cteQuery(eds[which].text.value, name);
      } catch {
        throw new Error(`The ${which} side has no CTE named ${s.name}.`);
      }
    };
    return s.act === "compare" ? compareQuery(side("left"), side("right")) : side(s.side);
  }

  async function run(): Promise<void> {
    const my = ++latest;
    const label = sel.name || "the whole query";
    title.textContent = `${sel.act === "compare" ? "Compare" : "Preview"}: ${label}`;
    const what = sel.act === "compare" ? label : `${label} (${sel.side === "left" ? "old" : "new"}.sql)`;
    let sql: string;
    try {
      sql = sqlOf(sel);
    } catch (e) {
      return show(`<h2 class="bad">${esc(what)}</h2><pre class="error">${esc((e as Error).message)}</pre>`);
    }
    if (tab === "sql") return show(`<pre class="sql">${forAdapter(sql, adapter).split("\n").map(highlight).join("\n")}</pre>`);
    if (!near) return;
    show(runningHtml(what) + (engineEl.dataset.state === "ready" ? "" : '<p class="muted">Loading DuckDB into your browser, once (about 7 MB)…</p>'));
    try {
      const rows = (await rowsOf(await duck(setEngine), forDuckdb(sql))).slice(0, 100); // dbt show --limit 100
      if (my !== latest) return;
      show(sel.act === "compare" ? comparisonHtml(what, readComparison(rows), 100) : rowsHtml(what, rows, 100));
    } catch (e) {
      if (my !== latest) return;
      show(
        `<h2 class="bad">DuckDB failed</h2><pre class="error">${esc((e as Error).message ?? String(e))}</pre>` +
          `<p class="muted">Here only <code>ref()</code> and <code>source()</code> render, over <code>stg_orders</code>, <code>stg_payments</code> and <code>stg_customers</code>. In VS Code, dbt renders all of it and runs it on your warehouse.</p>`,
      );
    }
  }

  const select = (s: typeof sel) => {
    sel = s;
    mark();
    void run();
  };

  root.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>("button[data-act]");
    if (act) return select({ act: act.dataset.act as Act, side: act.dataset.side as Side, name: act.dataset.name! });
    const tb = t.closest<HTMLElement>("[data-tab]");
    if (tb) {
      tab = tb.dataset.tab as typeof tab;
      mark();
      return void run();
    }
    const ad = t.closest<HTMLElement>("[data-adapter]");
    if (ad) {
      adapter = ad.dataset.adapter!;
      mark();
      return void run();
    }
    const li = t.closest<HTMLElement>(".cd-side__list li");
    if (li) {
      // Scroll both editors to the CTE, as clicking it in the sidebar does.
      for (const side of ["left", "right"] as Side[]) {
        const at = [...lensLines(eds[side].text.value)].find(([, n]) => n === li.dataset.name)?.[0];
        if (at !== undefined) eds[side].text.scrollTo({ top: at * LH, behavior: "smooth" });
      }
      const name = li.dataset.name!;
      return select(can({ act: "compare", side: "right", name }) ? { act: "compare", side: "right", name } : { act: "preview", side: statusOf.get(name) === "added" ? "right" : "left", name });
    }
  });

  for (const side of ["left", "right"] as Side[]) {
    const ed = eds[side];
    ed.text.addEventListener("scroll", () => {
      ed.hl.style.transform = `translate(${-ed.text.scrollLeft}px, ${-ed.text.scrollTop}px)`;
      ed.gutter.style.transform = ed.lenses.style.transform = `translateY(${-ed.text.scrollTop}px)`;
    });
    ed.text.addEventListener("input", () => {
      paint();
      clearTimeout(timer);
      timer = setTimeout(() => void run(), 450);
    });
  }
  root.querySelector(".qp-reset")!.addEventListener("click", () => {
    eds.left.text.value = before;
    eds.right.text.value = after;
    sel = { act: "compare", side: "right", name: "order_payments" };
    paint();
    void run();
  });

  eds.left.text.value = before;
  eds.right.text.value = after;
  paint();
  show(`<p class="muted">Click <b>▶ Preview</b> or <b>⇄ Compare sides</b> on a CTE. The rows come from DuckDB, running in your browser.</p>`);
  title.textContent = "Compare: order_payments";
  new IntersectionObserver(
    (es, io) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      near = true;
      void run();
    },
    { rootMargin: "300px 0px" },
  ).observe(root);
}
