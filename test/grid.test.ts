import assert from "node:assert/strict";
import { test } from "node:test";
import { compareText, csv, fileName, hideRule, json, markdown, matches, nextSorts, numericKey, order, pinRule, pretty, tsv, type Grid, type Key } from "../src/grid.ts";

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

const grid: Grid = {
  cols: ["side", "id", "note", "amount"],
  rows: [
    [{ text: "left", kind: "text" }, { text: "1", kind: "num" }, { text: 'say "hi", then\nleave', kind: "text" }, { text: "NULL", kind: "null" }],
    [{ text: "right", kind: "text" }, { text: "1", kind: "num" }, { text: "a|b", kind: "text" }, { text: "", kind: "absent" }],
  ],
};

test("json keeps the digits of a number a double would round", () => {
  const g: Grid = { cols: ["id", "n"], rows: [[{ text: "9007199254740993", kind: "num" }, { text: "12.5", kind: "num" }]] };
  assert.match(json(g), /"id": "9007199254740993"/);
  assert.deepEqual(JSON.parse(json(g)), [{ id: "9007199254740993", n: 12.5 }]);
});

test("csv quotes what needs it and leaves NULL and a missing column empty", () => {
  assert.equal(csv(grid), 'side,id,note,amount\r\nleft,1,"say ""hi"", then\nleave",\r\nright,1,a|b,\r\n');
});

test("tsv keeps each value on one line, with or without the header", () => {
  assert.equal(tsv(grid), "side\tid\tnote\tamount\nleft\t1\tsay \"hi\", then leave\t\nright\t1\ta|b\t");
  assert.equal(tsv({ cols: ["id"], rows: [[{ text: "7", kind: "num" }]] }, false), "7");
});

test("markdown escapes pipes, shows NULL, right-aligns numbers", () => {
  assert.equal(
    markdown(grid),
    ["| side | id | note | amount |", "| --- | ---: | --- | --- |", '| left | 1 | say "hi", then leave | NULL |', "| right | 1 | a\\|b |  |"].join("\n"),
  );
});

test("json keeps numbers and NULL as values and leaves out a missing column", () => {
  assert.deepEqual(JSON.parse(json(grid)), [
    { side: "left", id: 1, note: 'say "hi", then\nleave', amount: null },
    { side: "right", id: 1, note: "a|b" },
  ]);
});

test("fileName takes the CTE's name from the heading", () => {
  assert.equal(fileName("order_payments (orders.sql)", false, "csv"), "order_payments.csv");
  assert.equal(fileName("final", true, "json"), "final-compare.json");
  assert.equal(fileName("the whole query (a b.sql)", false, "csv"), "the_whole_query.csv");
  assert.equal(fileName("…", false, "csv"), "results.csv");
});

test("csv and tsv keep text that starts like a formula as text; numbers and json are untouched", () => {
  const g: Grid = {
    cols: ["note", "n"],
    rows: [
      [{ text: '=HYPERLINK("http://x","y")', kind: "text" }, { text: "-22", kind: "num" }],
      [{ text: "@SUM(A1)", kind: "text" }, { text: "1", kind: "num" }],
      [{ text: "+1 555", kind: "text" }, { text: "2", kind: "num" }],
    ],
  };
  assert.equal(csv(g), `note,n\r\n"'=HYPERLINK(""http://x"",""y"")",-22\r\n'@SUM(A1),1\r\n'+1 555,2\r\n`);
  assert.equal(tsv(g, false).split("\n")[0], `'=HYPERLINK("http://x","y")\t-22`);
  assert.equal(JSON.parse(json(g))[0].note, '=HYPERLINK("http://x","y")');
});

test("pinRule keeps each pinned column at its offset, its header above the cells", () => {
  const css = pinRule([{ col: 0, left: 0 }, { col: 2, left: 31.5 }]);
  assert.match(css, /\.scroll :where\(tr > :nth-child\(1\)\) \{ position: sticky; left: 0px;/);
  assert.match(css, /\.scroll :where\(tr > :nth-child\(3\)\) \{ position: sticky; left: 31\.5px;/);
  assert.match(css, /\.scroll th:nth-child\(3\) \{ z-index: 2;/);
  assert.equal(pinRule([]), "");
});

test("pretty lays out a JSON object or array and leaves anything else alone", () => {
  assert.equal(pretty('{"a":1,"b":[2]}'), '{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
  assert.equal(pretty("[1]"), "[\n  1\n]");
  assert.equal(pretty("{not json"), "{not json");
  assert.equal(pretty("Ada"), "Ada");
});

test("order sorts integers beyond 2^53 by their exact values", () => {
  const rows: Key[][] = [[numericKey("9007199254740993")], [numericKey("9007199254740992")], [null], [numericKey("5")], [numericKey("-9007199254740993")], [numericKey("1.5")]];
  assert.deepEqual(order(rows, [{ col: 0, desc: false }]), [4, 5, 3, 1, 0, 2]);
  assert.deepEqual(order(rows, [{ col: 0, desc: true }]), [0, 1, 3, 5, 4, 2]);
});

test("order sorts fractions beyond 15 digits by their exact values", () => {
  const k = (t: string) => numericKey(t);
  const rows: Key[][] = [[k("0.123456789012345679")], [k("0.123456789012345678")], [k("-0.123456789012345679")], [k("-0.123456789012345678")], [k("0.50")], [k("0.5")], [null], [k("1e-7")]];
  assert.deepEqual(order(rows, [{ col: 0, desc: false }]), [2, 3, 7, 1, 0, 4, 5, 6]);
  assert.deepEqual(order(rows, [{ col: 0, desc: true }]), [4, 5, 0, 1, 7, 3, 2, 6]);
});
