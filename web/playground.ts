/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/* The landing page's playground: the extension's own parser marks each CTE of two queries, and shows the SQL the
 * extension would send through `dbt show`. Bundled by `npm run site:js` into docs/javascripts/playground.js. */
import { compareCtes, cteQuery, type Status } from "../src/cte.ts";
import { compareQuery, forAdapter } from "../src/query.ts";
import { after, before } from "./sample.ts";

// The sidebar's words for each status (src/tree.ts LOOK).
const NOTE: Record<Status, string> = { changed: "changed", added: "new", removed: "removed", affected: "reads a changed CTE", same: "" };
type Action = "left" | "right" | "compare";

const root = document.getElementById("qp");
if (root) {
  const left = root.querySelector<HTMLTextAreaElement>("#qp-left")!;
  const right = root.querySelector<HTMLTextAreaElement>("#qp-right")!;
  const list = root.querySelector<HTMLUListElement>(".qp-ctes")!;
  const summary = root.querySelector<HTMLElement>(".qp-summary")!;
  const actions = [...root.querySelectorAll<HTMLButtonElement>("[data-action]")];
  const adapters = [...root.querySelectorAll<HTMLButtonElement>("[data-adapter]")];
  let adapter = "snowflake"; // the compare SQL holds both adapters' Jinja; show what dbt renders for one
  const out = root.querySelector<HTMLElement>("#qp-sql")!;
  const reset = root.querySelector<HTMLButtonElement>(".qp-reset")!;
  let selected: string | undefined = "order_payments"; // undefined: the whole query
  let action: Action = "compare";

  const render = () => {
    const rows = compareCtes(left.value, right.value);
    if (!rows.some((r) => r.name === selected)) selected = undefined;
    const counts = (["changed", "added", "removed", "affected"] as Status[])
      .map((s) => [rows.filter((r) => r.status === s).length, NOTE[s]] as const)
      .filter(([n]) => n);
    summary.textContent = counts.length ? counts.map(([n, note]) => `${n} ${note}`).join(", ") : "No CTE changed.";

    list.replaceChildren(
      ...rows.map(({ name, status }) => {
        const li = document.createElement("li");
        const b = document.createElement("button");
        b.type = "button";
        b.className = `qp-cte qp-cte--${status}`;
        b.setAttribute("aria-pressed", String(name === selected));
        b.innerHTML = `<span class="qp-cte__mark" aria-hidden="true"></span><span class="qp-cte__name"></span><span class="qp-cte__note"></span>`;
        b.querySelector(".qp-cte__name")!.textContent = name ?? "(whole query)";
        b.querySelector(".qp-cte__note")!.textContent = NOTE[status];
        b.addEventListener("click", () => {
          selected = name;
          render();
        });
        li.append(b);
        return li;
      }),
    );

    // Like the sidebar's buttons: preview a side only where the CTE is, compare only where it is on both.
    const status = rows.find((r) => r.name === selected)?.status;
    const can: Record<Action, boolean> = { left: status !== "added", right: status !== "removed", compare: status !== "added" && status !== "removed" };
    if (!can[action]) action = can.compare ? "compare" : can.left ? "left" : "right";
    for (const b of actions) {
      const a = b.dataset.action as Action;
      b.disabled = !can[a];
      b.setAttribute("aria-pressed", String(a === action));
    }

    for (const b of adapters) b.setAttribute("aria-pressed", String(b.dataset.adapter === adapter));

    try {
      out.textContent =
        action === "compare"
          ? forAdapter(compareQuery(cteQuery(left.value, selected), cteQuery(right.value, selected)), adapter)
          : cteQuery(action === "left" ? left.value : right.value, selected);
    } catch (e) {
      out.textContent = `-- ${(e as Error).message}`;
    }
  };

  for (const b of actions)
    b.addEventListener("click", () => {
      action = b.dataset.action as Action;
      render();
    });
  for (const b of adapters)
    b.addEventListener("click", () => {
      adapter = b.dataset.adapter!;
      render();
    });
  reset.addEventListener("click", () => {
    left.value = before;
    right.value = after;
    selected = "order_payments";
    action = "compare";
    render();
  });
  left.addEventListener("input", render);
  right.addEventListener("input", render);
  left.value = before;
  right.value = after;
  render();
}
