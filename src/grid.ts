/// <reference lib="dom" />
/* What the results view does with the rows it holds: sort them by column, filter them, hide columns, copy and save them. Works on the table src/results.ts draws, in
 * place. No `vscode` or `node:` import: the extension's webview (src/view.ts) and the docs site (web/ui.ts) attach it. */

/** One column's sort; a list's last entry sorts first, the earlier ones break ties. */
export interface Sort {
  col: number;
  desc: boolean;
}

/** A cell's sort key: a number in a numeric column, its text otherwise, null for NULL or a column the row lacks. */
export type Key = string | number | null;

/** Text order as people read it: case aside, and digits by value, so `row2` comes before `row10`. */
export const compareText = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

/** The sorts after a click on column `col`: ascending first, then descending, then off. A click on another column makes
 * it the first sort and keeps the earlier ones as tie-breakers. */
export function nextSorts(sorts: Sort[], col: number): Sort[] {
  const last = sorts.at(-1);
  const rest = sorts.filter((s) => s.col !== col);
  if (last?.col !== col) return [...rest, { col, desc: false }];
  return last.desc ? rest : [...rest, { col, desc: true }];
}

/** The indexes of `rows` in sorted order; ties, and no sorts at all, keep the original order. NULL sorts last either way. */
export function order(rows: Key[][], sorts: Sort[]): number[] {
  return rows
    .map((_, i) => i)
    .sort((a, b) => {
      for (let k = sorts.length - 1; k >= 0; k--) {
        const { col, desc } = sorts[k];
        const x = rows[a][col];
        const y = rows[b][col];
        if (x === y) continue;
        if (x === null) return 1;
        if (y === null) return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : compareText(String(x), String(y));
        if (c) return desc ? -c : c;
      }
      return a - b;
    });
}

/** Whether a row whose cells read `texts` passes `filter`: some cell contains it, case aside. An empty filter passes all. */
export function matches(texts: string[], filter: string): boolean {
  const f = filter.trim().toLowerCase();
  return !f || texts.some((t) => t.toLowerCase().includes(f));
}

/** A cell as the view shows it: its text, and whether it is a number, NULL, or a column the row lacks. */
export interface Cell {
  text: string;
  kind: "text" | "num" | "null" | "absent";
}

/** Rows taken out of the view, under their column names. */
export interface Grid {
  cols: string[];
  rows: Cell[][];
}

/** What the extension (src/view.ts) or the site (web/ui.ts) does with text the view hands out. */
export interface Host {
  copy(text: string): void;
  /** Saves `text` as a file, named `name` unless the user picks another. */
  save(name: string, text: string): void;
}

/** A cell for CSV and TSV, which end up in spreadsheets. NULL and a missing column are empty. Text that a spreadsheet
 * would run as a formula (`=`, `+`, `-`, `@`, a tab or a return first) gets a leading `'`, so it stays text (OWASP's
 * CSV injection advice); numbers stay as they are. */
const plain = (c: Cell) =>
  c.kind === "null" || c.kind === "absent" ? "" : c.kind === "text" && /^[=+\-@\t\r]/.test(c.text) ? `'${c.text}` : c.text;
const csvField = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const oneLine = (s: string) => s.replace(/[\t\r\n]+/g, " ");

/** Tab-separated values, which paste into a spreadsheet's cells; `header` adds the column names. */
export const tsv = (g: Grid, header = true): string =>
  [...(header ? [g.cols] : []), ...g.rows.map((r) => r.map(plain))].map((r) => r.map(oneLine).join("\t")).join("\n");

/** RFC 4180 CSV with a header row. */
export const csv = (g: Grid): string => [g.cols, ...g.rows.map((r) => r.map(plain))].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";

/** A Markdown table, for a pull request or an issue: NULL shows as NULL, a column of numbers is right-aligned. */
export function markdown(g: Grid): string {
  const cell = (s: string) => oneLine(s).replace(/\|/g, "\\|");
  const numeric = g.cols.map((_, c) => g.rows.some((r) => r[c].kind === "num") && g.rows.every((r) => r[c].kind !== "text"));
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [
    line(g.cols.map(cell)),
    line(numeric.map((n) => (n ? "---:" : "---"))),
    ...g.rows.map((r) => line(r.map((c) => (c.kind === "absent" ? "" : cell(c.text))))),
  ].join("\n");
}

/** A JSON array of row objects: numbers as numbers, NULL as null, a column the row lacks left out. */
export function json(g: Grid): string {
  const value = (c: Cell) => (c.kind === "num" ? Number(c.text) : c.kind === "null" ? null : c.text);
  const rows = g.rows.map((r) => Object.fromEntries(g.cols.flatMap((name, i) => (r[i].kind === "absent" ? [] : [[name, value(r[i])]]))));
  return JSON.stringify(rows, null, 2) + "\n";
}

/** A file name for the rows of the view headed `heading`: the CTE's name, `-compare` for a comparison. */
export function fileName(heading: string, comparison: boolean, ext: string): string {
  const name = heading.split(" (")[0].replace(/[^\w.-]+/g, "_").replace(/^[_.]+|_+$/g, "") || "results";
  return `${name}${comparison ? "-compare" : ""}.${ext}`;
}

/** CSS that hides the table's columns at cell indexes `cols`. A group's label row has one cell, so it stays. */
export const hideRule = (cols: number[]): string =>
  cols.length ? `${cols.map((c) => `.scroll tr > :nth-child(${c + 1})`).join(", ")} { display: none; }` : "";

/** Wires the view's table under `root`, if it has one: a click (or Enter) on a column header sorts by it. In a
 * comparison, a changed row's old and new versions (`data-pair`) move together, sorted by the new one (by the old one
 * in a column only the old side has), and each group keeps its own rows. The filter box keeps the rows with a cell
 * that contains its text, in the columns shown; a pair stays when either version matches, and a group with no match
 * hides. Columns lists the columns with a box to hide each. A click selects a cell, Shift-click a block, a click on
 * the row number or −/+ a row; Cmd/Ctrl-C copies the selection. The toolbar copies Markdown and saves CSV or JSON
 * through `host`. */
export function attach(root: Document | ShadowRoot, host: Host): void {
  const table = root.querySelector<HTMLTableElement>(".scroll table");
  if (!table) return;
  const heads = [...table.querySelectorAll<HTMLTableCellElement>("thead th")];
  const bodies = [...table.tBodies].map((tbody) => {
    const units: HTMLTableRowElement[][] = [];
    for (const tr of tbody.rows) {
      if (tr.classList.contains("group")) continue;
      const prev = units.at(-1);
      if (tr.dataset.pair && prev?.[0].dataset.pair === tr.dataset.pair) prev.push(tr);
      else units.push([tr]);
    }
    return { tbody, units };
  });
  const key = (td: HTMLTableCellElement, numeric: boolean): Key =>
    td.classList.contains("null") || td.classList.contains("absent") ? null : numeric ? Number(td.textContent) : (td.textContent ?? "");
  let sorts: Sort[] = [];
  const hidden = new Set<number>();
  const comparison = heads[0].classList.contains("side");
  const shownRows = () =>
    [...table.tBodies].flatMap((tbody) => (tbody.hidden ? [] : [...tbody.rows].filter((tr) => !tr.hidden && !tr.classList.contains("group"))));
  const shownCols = () => heads.map((_, c) => c).filter((c) => c && !hidden.has(c));
  const cellOf = (td: HTMLTableCellElement): Cell => {
    const kind = (["absent", "null", "num"] as const).find((k) => td.classList.contains(k)) ?? "text";
    return { text: td.textContent ?? "", kind };
  };
  /** The rows and columns as a Grid; `side` adds a comparison's left/right column. */
  const gridOf = (rows: HTMLTableRowElement[], cols: number[], side: boolean): Grid => {
    const withSide = side && comparison;
    return {
      cols: [...(withSide ? ["side"] : []), ...cols.map((c) => heads[c].textContent ?? "")],
      rows: rows.map((tr) => [
        ...(withSide ? [{ text: tr.classList.contains("l") ? "left" : "right", kind: "text" as const }] : []),
        ...cols.map((c) => cellOf(tr.cells[c])),
      ]),
    };
  };

  let block: { rows: HTMLTableRowElement[]; cols: number[] } | undefined;
  let anchor: { tr: HTMLTableRowElement; col: number } | undefined;
  function select(next?: { rows: HTMLTableRowElement[]; cols: number[] }): void {
    for (const td of table!.querySelectorAll(".sel")) td.classList.remove("sel");
    block = next;
    if (next) for (const tr of next.rows) for (const c of next.cols) tr.cells[c].classList.add("sel");
  }

  function sortBy(col: number): void {
    select();
    sorts = nextSorts(sorts, col);
    heads.forEach((th, c) => {
      const s = sorts.find((x) => x.col === c);
      th.dataset.sort = s ? (s.desc ? "desc" : "asc") : "";
      if (s && s === sorts.at(-1)) th.setAttribute("aria-sort", s.desc ? "descending" : "ascending");
      else th.removeAttribute("aria-sort");
    });
    table!.dataset.sorted = "";
    for (const { tbody, units } of bodies) {
      const cell = (u: HTMLTableRowElement[], c: number) => {
        const td = u.at(-1)!.cells[c];
        return td.classList.contains("absent") ? u[0].cells[c] : td;
      };
      const keys = units.map((u) => heads.map((th, c) => (c ? key(cell(u, c), th.classList.contains("num")) : null)));
      for (const i of order(keys, sorts)) tbody.append(...units[i]);
    }
  }

  const filter = root.querySelector<HTMLInputElement>(".tools .filter");
  const shown = root.querySelector(".tools .shown");
  function refilter(): void {
    if (!filter) return;
    select();
    let kept = 0;
    let total = 0;
    for (const { tbody, units } of bodies) {
      let any = false;
      for (const u of units) {
        // Not the first cell: a row number or −/+ would match a digit or a sign.
        const texts = u.flatMap((tr) => [...tr.cells].filter((_, c) => c && !hidden.has(c)).map((td) => td.textContent ?? ""));
        const keep = matches(texts, filter.value);
        for (const tr of u) tr.hidden = !keep;
        any ||= keep;
        kept += Number(keep);
        total++;
      }
      tbody.hidden = !any;
    }
    if (shown) shown.textContent = filter.value.trim() ? `${kept} of ${total} rows` : "";
  }
  filter?.addEventListener("input", refilter);

  const picker = root.querySelector<HTMLDetailsElement>(".tools .cols");
  if (picker) {
    const style = table.ownerDocument.createElement("style");
    table.after(style);
    const summary = picker.querySelector("summary")!;
    picker.addEventListener("change", (e) => {
      const box = e.target as HTMLInputElement;
      if (box.checked) hidden.delete(Number(box.value));
      else hidden.add(Number(box.value));
      select();
      style.textContent = hideRule([...hidden]);
      summary.textContent = hidden.size ? `Columns (${hidden.size} hidden)` : "Columns";
      refilter();
    });
    // The menu closes on Escape or a click elsewhere in the view.
    picker.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !picker.open) return;
      picker.open = false;
      summary.focus();
    });
    root.addEventListener("click", (e) => {
      if (!picker.contains(e.target as Node)) picker.open = false;
    });
  }

  const scroll = table.parentElement!; // focusable, so a click in it gets Cmd/Ctrl-C
  table.addEventListener("click", (e) => {
    const td = (e.target as Element).closest("td");
    const tr = td?.parentElement as HTMLTableRowElement | undefined;
    if (!td || !tr || tr.classList.contains("group")) return;
    const col = td.cellIndex;
    const rows = shownRows();
    const cols = shownCols();
    const [r0, r1] = anchor ? [rows.indexOf(anchor.tr), rows.indexOf(tr)].sort((a, b) => a - b) : [-1, -1];
    if (e.shiftKey && anchor && r0 >= 0) {
      const byRow = !col || !anchor.col;
      const [c0, c1] = [cols.indexOf(anchor.col), cols.indexOf(col)].sort((a, b) => a - b);
      select({ rows: rows.slice(r0, r1 + 1), cols: byRow || c0 < 0 ? cols : cols.slice(c0, c1 + 1) });
      // Shift-click also selects text. A caret, not no selection: with none, the browser fires no copy event.
      getSelection()?.collapse(td, 0);
    } else {
      anchor = { tr, col };
      select({ rows: [tr], cols: col ? [col] : cols });
    }
  });
  scroll.addEventListener("keydown", (e) => {
    if (e.key === "Escape") select();
  });
  scroll.addEventListener("copy", (e) => {
    if (!block || getSelection()?.toString()) return; // text selected by dragging copies as text
    e.clipboardData?.setData("text/plain", tsv(gridOf(block.rows, block.cols, false), false));
    e.preventDefault();
  });

  const heading = root.querySelector("h2")?.textContent ?? "";
  root.querySelector(".tools")?.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("button");
    if (b?.dataset.copy) {
      host.copy(markdown(gridOf(block?.rows ?? shownRows(), block?.cols ?? shownCols(), true)));
      const label = (b.dataset.label ??= b.textContent ?? "");
      b.textContent = "Copied";
      setTimeout(() => (b.textContent = label), 1200);
    }
    const ext = b?.dataset.save;
    if (ext) {
      const g = gridOf(shownRows(), shownCols(), true);
      host.save(fileName(heading, comparison, ext), ext === "csv" ? csv(g) : json(g));
    }
  });

  heads.forEach((th, c) => {
    if (!c) return; // the row-number or side column
    th.addEventListener("click", () => sortBy(c));
    th.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      sortBy(c);
    });
  });
}
