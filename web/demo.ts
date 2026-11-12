/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/* The landing page's live demo: the extension's sidebar, the diff of web/sample.ts with its ▶ Preview and ⇄ Compare
 * sides buttons, and the results panel below, drawn with the extension's own code (src/cte.ts, src/results.ts). The rows
 * are web/demo-rows.json: the extension's SQL run on DuckDB over made-up tables (scripts/demo-rows.ts).
 * A scripted cursor plays three chapters; moving the mouse over the window hands control to the visitor. Phones,
 * touch screens and reduced motion get no cursor: the window opens on a comparison, ready to click. */
import { compareCtes } from "../src/cte.ts";
import { readComparison, type Row } from "../src/query.ts";
import { comparisonHtml, rowsHtml, runningHtml } from "../src/results.ts";
import demoRows from "./demo-rows.json" with { type: "json" };
import { after, before } from "./sample.ts";
import { button, diffRows, highlight, lensLines, resultsPanel, sidebarList, summary, type Act, type Side } from "./ui.ts";

const ROWS = demoRows as Record<Side | "compare", Record<string, Row[]>>;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const root = document.getElementById("cd-demo");
if (root) {
  const statuses = compareCtes(before, after);
  const statusOf = new Map(statuses.map((s) => [s.name ?? "", s.status]));
  const both = (name: string) => !["added", "removed"].includes(statusOf.get(name)!);

  // The sidebar: every CTE of both sides, marked, with ← → ⇄ on hover.
  const sidebar = `<aside class="cd-side"><div class="cd-side__head"><b>CTE Diff</b> orders.sql</div><p class="cd-side__msg">${summary(statuses)}</p><ul class="cd-side__list">${sidebarList(statuses)}</ul></aside>`;

  // The diff, with the CodeLens row above each CTE and the final select.
  const L = before.replace(/\n$/, "").split("\n");
  const R = after.replace(/\n$/, "").split("\n");
  const rows = diffRows(L, R);
  const lensL = lensLines(before);
  const lensR = lensLines(after);
  const lens = (side: Side, name: string | undefined) =>
    name === undefined
      ? "<span></span>"
      : `<span class="cd-lens">${button("preview", side, name, name ? "▶ Preview" : "▶ Preview query", `Preview ${name || "the whole query"}`)}${both(name) ? ` | ${button("compare", side, name, "⇄ Compare sides", `Compare ${name || "the whole query"} on both sides`)}` : ""}</span>`;
  const line = (n: number | undefined, lines: string[], cls: string) =>
    n === undefined ? '<span class="cd-fill"></span>' : `<span class="${cls}"><i>${n + 1}</i>${highlight(lines[n])}</span>`;
  const removals = rows.filter((r) => r.changed && r.l !== undefined).length;
  const additions = rows.filter((r) => r.changed && r.r !== undefined).length;
  let diff = `<div class="cd-row cd-row--head"><span class="cd-count cd-count--rm">${removals} removals</span><span class="cd-count cd-count--add">${additions} additions</span></div>`;
  let tint = 0;
  for (const row of rows) {
    const ln = row.l === undefined ? undefined : lensL.get(row.l);
    const rn = row.r === undefined ? undefined : lensR.get(row.r);
    if (ln !== undefined || rn !== undefined) diff += `<div class="cd-row cd-row--lens">${lens("left", ln)}${lens("right", rn)}</div>`;
    const style = row.changed ? ` style="--i:${tint++}"` : "";
    diff += `<div class="cd-row"${style}>${line(row.l, L, row.changed ? "cd-del" : "")}${line(row.r, R, row.changed ? "cd-add" : "")}</div>`;
  }

  root.querySelector(".cd-win__body")!.innerHTML = `${sidebar}<div class="cd-main"><div class="cd-diff" tabindex="0" aria-label="The diff of orders.sql">${diff}</div>
<section class="cd-panel" aria-label="Results"><div class="cd-panel__tabs"><span>Problems</span><span>Output</span><span>Terminal</span><span class="on">CTE Diff</span><em class="cd-panel__title"></em></div><div class="cd-panel__body" aria-live="polite"></div></section></div>`;

  const pane = root.querySelector<HTMLElement>(".cd-diff")!;
  const tabTitle = root.querySelector<HTMLElement>(".cd-panel__title")!;
  const show = resultsPanel(root.querySelector<HTMLElement>(".cd-panel__body")!);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  show(`<p class="muted">Click <b>▶ Preview</b> above a CTE to see its rows here. <b>⇄ Compare sides</b> runs the CTE on both sides and lists the rows that differ.</p>`);

  const select = (name: string) =>
    root.querySelectorAll(".cd-side__list li").forEach((li) => li.classList.toggle("cd-sel", (li as HTMLElement).dataset.name === name));
  /** Scrolls the diff so the CTE's buttons show, the way clicking it in the sidebar does. */
  const reveal = (name: string, side: Side = "right") => {
    const b = root.querySelector<HTMLElement>(`.cd-lens [data-side="${side}"][data-name="${CSS.escape(name)}"]`) ??
      root.querySelector<HTMLElement>(`.cd-lens [data-name="${CSS.escape(name)}"]`);
    const row = b?.closest<HTMLElement>(".cd-row");
    if (row) pane.scrollTo({ top: row.offsetTop - 34, behavior: reduce ? "auto" : "smooth" });
    return b;
  };

  let latest = 0;
  async function run(act: Act, side: Side, name: string): Promise<void> {
    const my = ++latest;
    const label = name || "the whole query";
    select(name);
    root!.querySelectorAll(".cd-lens button").forEach((b) => b.classList.remove("cd-hit"));
    root!.querySelectorAll(`.cd-lens [data-act="${act}"][data-name="${CSS.escape(name)}"]${act === "preview" ? `[data-side="${side}"]` : ""}`).forEach((b) => b.classList.add("cd-hit"));
    tabTitle.textContent = `${act === "compare" ? "Compare" : "Preview"}: ${label}`;
    const what = act === "compare" ? label : `${label} (orders.sql, ${side === "left" ? "old" : "new"})`;
    show(runningHtml(what));
    await wait(reduce ? 0 : 650);
    if (my !== latest) return;
    show(act === "compare" ? comparisonHtml(what, readComparison(ROWS.compare[name]), 100) : rowsHtml(what, ROWS[side][name], 100));
  }

  root.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const b = target.closest<HTMLButtonElement>("button[data-act]");
    if (b) return void run(b.dataset.act as Act, b.dataset.side as Side, b.dataset.name!);
    const li = target.closest<HTMLElement>(".cd-side__list li");
    if (li) {
      select(li.dataset.name!);
      reveal(li.dataset.name!);
    }
  });

  // ---------------------------------------------------------------- the scripted cursor
  const overlay = root.querySelector<HTMLElement>(".cd-overlay")!;
  const cursor = overlay.querySelector<SVGElement>(".cd-cursor")!;
  const state = root.querySelector<HTMLElement>(".cd-state")!;
  const chapters = [...document.querySelectorAll<HTMLElement>(".cd-chapters li")];
  const still = reduce || window.matchMedia("(max-width: 760px), (hover: none)").matches;
  class Stop {}
  let token = 0;
  let x = 0;
  let y = 0;
  const sleep = (ms: number, my: number) =>
    new Promise<void>((res, rej) => setTimeout(() => (my === token && root.isConnected ? res() : rej(new Stop())), ms));
  async function moveTo(el: Element, my: number): Promise<void> {
    const f = root!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const [nx, ny] = [r.left - f.left + Math.min(r.width / 2, 40), r.top - f.top + r.height / 2];
    const t = Math.min(1000, 320 + Math.hypot(nx - x, ny - y) * 0.8);
    cursor.style.transitionDuration = `${t}ms`;
    cursor.style.transform = `translate(${nx}px, ${ny}px)`;
    [x, y] = [nx, ny];
    await sleep(t + 80, my);
  }
  async function click(el: HTMLElement, my: number): Promise<void> {
    await moveTo(el, my);
    const ripple = document.createElement("div");
    ripple.className = "cd-ripple";
    [ripple.style.left, ripple.style.top] = [`${x}px`, `${y}px`];
    overlay.append(ripple);
    setTimeout(() => ripple.remove(), 600);
    el.click();
  }
  const lensButton = (act: Act, side: Side, name: string) =>
    root!.querySelector<HTMLElement>(`.cd-lens [data-act="${act}"][data-side="${side}"][data-name="${name}"]`)!;

  /** Each chapter: what the cursor does, then the time its card's progress bar runs. */
  const PLAY: [number, (my: number) => Promise<void>][] = [
    [7, async (my) => {
      reveal("payments");
      await sleep(500, my);
      await click(lensButton("preview", "right", "payments"), my);
    }],
    [8, async (my) => {
      reveal("order_payments");
      await sleep(600, my);
      await click(lensButton("compare", "right", "order_payments"), my);
    }],
    [9, async (my) => {
      const li = root!.querySelector<HTMLElement>('.cd-side__list li[data-name="final"]')!;
      await moveTo(li.querySelector(".cd-name")!, my);
      li.classList.add("cd-hover");
      await sleep(500, my);
      await click(li.querySelector<HTMLElement>('[data-act="compare"]')!, my);
      await sleep(1200, my);
      li.classList.remove("cd-hover");
      reveal("final");
    }],
  ];
  async function tour(from: number): Promise<void> {
    const my = ++token;
    try {
      for (let k = from; ; k = (k + 1) % PLAY.length) {
        chapters.forEach((c, i) => {
          c.classList.toggle("on", i === k);
          c.classList.toggle("done", i < k);
          if (i === k) c.setAttribute("aria-current", "step");
          else c.removeAttribute("aria-current");
          c.style.setProperty("--dur", `${PLAY[i][0]}s`);
        });
        const t0 = performance.now();
        await PLAY[k][1](my);
        await sleep(Math.max(0, PLAY[k][0] * 1000 - (performance.now() - t0)), my);
      }
    } catch (e) {
      if (!(e instanceof Stop)) throw e;
    } finally {
      root!.querySelectorAll(".cd-hover").forEach((li) => li.classList.remove("cd-hover"));
    }
  }

  if (still) {
    reveal("order_payments");
    void run("compare", "right", "order_payments");
  } else {
    let resume: ReturnType<typeof setTimeout> | undefined;
    let next = 0;
    root.classList.add("live");
    document.querySelector(".cd-chapters")?.classList.add("live");
    root.addEventListener("mouseenter", () => {
      clearTimeout(resume);
      next = (chapters.findIndex((c) => c.classList.contains("on")) + 1) % PLAY.length;
      token++;
      root.classList.add("mine");
      state.textContent = "Your turn";
      chapters.forEach((c) => {
        c.classList.remove("on", "done");
        c.removeAttribute("aria-current");
      });
    });
    root.addEventListener("mouseleave", () => {
      resume = setTimeout(() => {
        root.classList.remove("mine");
        state.textContent = "Playing";
        void tour(next);
      }, 2500);
    });
    chapters.forEach((c, i) =>
      c.addEventListener("click", () => {
        clearTimeout(resume);
        root.classList.remove("mine");
        state.textContent = "Playing";
        void tour(i);
      }),
    );
    [x, y] = [root.clientWidth * 0.55, root.clientHeight * 0.45];
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    new IntersectionObserver((es, io) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      setTimeout(() => !root.classList.contains("mine") && void tour(0), 1400);
    }, { threshold: 0.35 }).observe(root);
  }
}
