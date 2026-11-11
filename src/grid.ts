/// <reference lib="dom" />
/* What the results view does with the rows it holds: sort them by column. Works on the table src/results.ts draws, in
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

/** Wires the view's table under `root`, if it has one: a click (or Enter) on a column header sorts by it. In a
 * comparison, a changed row's old and new versions (`data-pair`) move together, sorted by the new one (by the old one
 * in a column only the old side has), and each group keeps its own rows. */
export function attach(root: ParentNode): void {
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

  function sortBy(col: number): void {
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
