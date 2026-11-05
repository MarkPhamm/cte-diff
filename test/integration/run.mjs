// Runs test/integration/suite.ts inside a real VS Code on a scratch dbt project folder. No dbt or warehouse needed.
import { runTests } from "@vscode/test-electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const ext = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ws = fs.mkdtempSync(path.join(os.tmpdir(), "cte-diff-"));
fs.mkdirSync(path.join(ws, "models"));
fs.writeFileSync(path.join(ws, "dbt_project.yml"), "name: t\n");
fs.writeFileSync(path.join(ws, "models", "old.sql"), "with a as (select 1 x),\nb as (select * from a),\ngone as (select 2)\nselect * from b\n");
fs.writeFileSync(path.join(ws, "models", "new.sql"), "with a as (select 1 x),\nb as (select x + 1 as x from a),\nnew_one as (select 3)\nselect * from b\n");
delete process.env.ELECTRON_RUN_AS_NODE;
await runTests({
  extensionDevelopmentPath: ext,
  extensionTestsPath: path.join(ext, "out", "test", "suite.js"),
  launchArgs: [ws, "--disable-extensions", "--disable-workspace-trust"],
});
