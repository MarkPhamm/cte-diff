import assert from "node:assert/strict";
import test from "node:test";
import { showColumns, showRow } from "../web/sample.ts";

test("the playground reads BIGINT and DECIMAL columns as text, so a value a double would round keeps its digits", () => {
  const cols = [
    { column_name: "id", column_type: "BIGINT" },
    { column_name: "amount", column_type: "DECIMAL(38,17)" },
    { column_name: "n", column_type: "INTEGER" },
    { column_name: "day", column_type: "DATE" },
  ];
  assert.equal(showColumns(cols), `"id"::varchar as "id", "amount"::varchar as "amount", "n", "day"::varchar as "day"`);
  const read = (row: Record<string, unknown>) => showRow(row, cols);
  assert.deepEqual(read({ id: "9007199254740993", amount: "1.23456789012345678", n: 3, day: "2024-01-04" }), {
    id: "9007199254740993",
    amount: "1.23456789012345678",
    n: 3,
    day: "2024-01-04",
  });
  assert.deepEqual(read({ id: "9007199254740992", amount: "5.00000000000000000", n: 1, day: null }), { id: 9007199254740992, amount: 5, n: 1, day: null });
  assert.deepEqual(read({ id: "42", amount: null, n: null, day: null }), { id: 42, amount: null, n: null, day: null });
});
