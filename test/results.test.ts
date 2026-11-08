import assert from "node:assert/strict";
import { test } from "node:test";
import { comparisonHtml, errorHtml, rowsHtml, setupHtml, unsupportedHtml } from "../src/results.ts";

test("rowsHtml shows the run's files, target and time under the heading", () => {
  assert.match(rowsHtml("x", [], 100, "orders.sql · target dev · 1.2 s"), /<h2>x<\/h2><p class="meta muted">orders.sql · target dev · 1.2 s<\/p>/);
  assert.doesNotMatch(rowsHtml("x", [], 100), /meta/, "the site's demo passes no meta");
});

test("errorHtml says whether dbt failed or the run never started", () => {
  assert.match(errorHtml("boom"), /<h2 class="bad">dbt failed<\/h2>/);
  assert.match(errorHtml("No dbt_project.yml", "Couldn't run"), /<h2 class="bad">Couldn&#39;t run<\/h2>/);
});

test("unsupportedHtml says what works and links an issue asking for the warehouse", () => {
  const html = unsupportedHtml("postgres", ["BigQuery", "DuckDB", "Redshift", "Snowflake"]);
  assert.match(html, /Comparisons run on BigQuery, DuckDB, Redshift and Snowflake\. <b>▶ Preview<\/b> works on postgres\./);
  assert.match(html, /href="https:\/\/github\.com\/MarkPhamm\/cte-diff\/issues\/new\?title=Compare%20on%20postgres"/);
});

test("comparisonHtml without counts (Redshift) still says whether the sides match", () => {
  assert.match(comparisonHtml("a", { rows: [] }, 100), /Row counts unavailable[\s\S]*No differing rows/);
  assert.match(
    comparisonHtml("a", { rows: [{ side: "left", row: { id: 1 } }] }, 100),
    /Row counts unavailable[\s\S]*The sides differ/,
  );
});

test("setupHtml shows dbt debug's output only when it failed", () => {
  assert.match(setupHtml([["Project", "/p"]], true, "noise"), /<th>Project<\/th><td>\/p<\/td>[\s\S]*passed/);
  assert.doesNotMatch(setupHtml([], true, "noise"), /noise/);
  assert.match(setupHtml([], false, "Could not find profile"), /failed[\s\S]*Could not find profile/);
});

test("comparisonHtml lists a changed row as a pair with its changed cell marked", () => {
  const html = comparisonHtml(
    "revenue",
    {
      counts: { left: 4, right: 4, only_left: 1, only_right: 1 },
      rows: [
        { side: "left", row: { customer_id: 1, revenue: 120 } },
        { side: "right", row: { customer_id: 1, revenue: 160 } },
      ],
    },
    100,
  );
  assert.match(html, /The sides differ: 1 changed row\./);
  assert.match(html, /matched on customer_id/);
  assert.match(html, /<tr class="l"><td class="side">−<\/td><td class="num">1<\/td><td class="chg num">120<\/td><\/tr>/);
  assert.match(html, /<tr class="r"><td class="side">\+<\/td><td class="num">1<\/td><td class="chg num">160<\/td><\/tr>/);
});

test("comparisonHtml says when both sides match", () => {
  const html = comparisonHtml("a", { counts: { left: 2, right: 2, only_left: 0, only_right: 0 }, rows: [] }, 100);
  assert.match(html, /Both sides return the same rows/);
  assert.doesNotMatch(html, /<table/);
});

test("rowsHtml escapes values and marks NULLs", () => {
  const html = rowsHtml("x", [{ a: "<b>", b: null }], 100);
  assert.match(html, /&#60;b&#62;/);
  assert.match(html, /<td class="null">NULL<\/td>/);
});
