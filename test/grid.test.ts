import assert from "node:assert/strict";
import { test } from "node:test";
import { compareText, hideRule, matches, nextSorts, order, type Key } from "../src/grid.ts";

test("a header click sorts ascending, then descending, then not at all", () => {
  const asc = nextSorts([], 2);
  assert.deepEqual(asc, [{ col: 2, desc: false }]);
  const desc = nextSorts(asc, 2);
  assert.deepEqual(desc, [{ col: 2, desc: true }]);
  assert.deepEqual(nextSorts(desc, 2), []);
});

test("a click on another column sorts by it first and keeps the earlier sort as the tie-breaker", () => {
  const two = nextSorts(nextSorts([], 1), 3);
  assert.deepEqual(two, [{ col: 1, desc: false }, { col: 3, desc: false }]);
  // Clicking the tie-breaker again makes it the first sort, ascending.
  assert.deepEqual(nextSorts(two, 1), [{ col: 3, desc: false }, { col: 1, desc: false }]);
});

test("order sorts numbers by value, text by reading order, NULL last both ways", () => {
  const rows: Key[][] = [[10], [null], [9], [-1]];
  assert.deepEqual(order(rows, [{ col: 0, desc: false }]), [3, 2, 0, 1]);
  assert.deepEqual(order(rows, [{ col: 0, desc: true }]), [0, 2, 3, 1]);
  assert.deepEqual(order([["row10"], ["Row2"], ["2024-01-05"], ["2023-12-31"]], [{ col: 0, desc: false }]), [3, 2, 1, 0]);
  assert.ok(compareText("a", "B") < 0);
});

test("order breaks ties with the earlier sorts, then keeps the original order", () => {
  const rows: Key[][] = [
    ["b", "2024-02-01"],
    ["a", "2024-02-01"],
    ["a", "2024-01-01"],
    ["a", "2024-01-01"],
  ];
  // Sorted by date, ties by key: the earlier sort is the tie-breaker.
  assert.deepEqual(order(rows, [{ col: 0, desc: false }, { col: 1, desc: false }]), [2, 3, 1, 0]);
  assert.deepEqual(order(rows, []), [0, 1, 2, 3]);
});

test("a row passes the filter when a cell contains it, case aside", () => {
  assert.ok(matches(["11", "Ada", "2024-01-04"], "ada"));
  assert.ok(matches(["11", "Ada", "2024-01-04"], " 2024-01 "));
  assert.ok(!matches(["11", "Ada"], "grace"));
  assert.ok(matches(["11", "NULL"], "null"), "NULL reads as it shows");
  assert.ok(matches(["11"], "  "), "an empty filter passes every row");
});

test("hideRule hides the picked columns by cell position, and nothing when none are picked", () => {
  assert.equal(hideRule([2, 4]), ".scroll tr > :nth-child(3), .scroll tr > :nth-child(5) { display: none; }");
  assert.equal(hideRule([]), "");
});
