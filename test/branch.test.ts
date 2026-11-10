import assert from "node:assert/strict";
import { test } from "node:test";
import { branchChoices, gitRef, refLabel } from "../src/branch.ts";

const refs = [
  { type: 0, name: "main" },
  { type: 0, name: "dev" },
  { type: 0, name: "qa" },
  { type: 1, name: "origin/HEAD" },
  { type: 1, name: "origin/qa" },
  { type: 1, name: "origin/main" },
  { type: 2, name: "v1.0" },
  { type: 0 },
];

test("branchChoices lists local then remote branches, without the current branch, remote HEADs or tags", () => {
  assert.deepEqual(branchChoices(refs, "dev"), ["main", "qa", "origin/main", "origin/qa"]);
});

test("branchChoices puts the last-used branch first, unless it is gone or checked out", () => {
  assert.deepEqual(branchChoices(refs, "dev", "origin/qa"), ["origin/qa", "main", "qa", "origin/main"]);
  assert.deepEqual(branchChoices(refs, "dev", "gone"), ["main", "qa", "origin/main", "origin/qa"]);
  assert.deepEqual(branchChoices(refs, "qa", "qa"), ["dev", "main", "origin/main", "origin/qa"]);
});

test("refLabel names a branch or a short commit, not HEAD or the index", () => {
  const q = (ref: string) => JSON.stringify({ path: "/p/orders.sql", ref });
  assert.equal(refLabel(q("qa")), "qa");
  assert.equal(refLabel(q("origin/qa")), "origin/qa");
  assert.equal(refLabel(q("0123456789abcdef0123456789abcdef01234567")), "0123456");
  for (const ref of ["", "~", "HEAD"]) assert.equal(refLabel(q(ref)), undefined);
  assert.equal(refLabel("not json"), undefined);
});

test("gitRef reads any ref, the index included", () => {
  for (const ref of ["qa", "HEAD", "~", ""]) assert.equal(gitRef(JSON.stringify({ ref })), ref);
  for (const query of ["not json", "null", JSON.stringify({ path: "/p/orders.sql" })]) assert.equal(gitRef(query), undefined);
});
