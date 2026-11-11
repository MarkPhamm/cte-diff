# cte-diff

VS Code extension: preview a dbt CTE's rows, and compare one CTE across both sides of a diff, by running `dbt show --inline`. Scripts are in `package.json`; dev, site and release steps are in `docs/development.md`.

## Before calling work done

Run `npm run typecheck && npm test`. Tests need Node 22+ (Node runs the `.ts` files directly, no build step). Changes to the CodeLens, sidebar or panel also need `npm run test:integration` (downloads VS Code; CI runs it under `xvfb-run`).

## Layout rules the code doesn't state

- **Pure modules**: `src/cte.ts` (parser), `src/query.ts` (SQL building, `dbt show` output parsing), `src/results.ts` (the results view's HTML and CSS), `src/grid.ts` (the results view's script: sorting, filtering, hiding and pinning columns, copying, saving, row detail), `src/dbt.ts` (running dbt) import nothing from `vscode`, so `node --test` loads them directly. Keep logic there and test it in `test/`; the other `src/` files are thin VS Code wiring.
- `src/cte.ts`, `src/query.ts`, `src/results.ts` and `src/grid.ts` are also bundled for the browser into the docs site (`web/playground.ts`, `web/demo.ts`); `src/grid.ts` also runs in the results webview, as `out/view.js` (`src/view.ts`). They stay free of `node:` imports.
- `web/sample.ts` holds the site's example and its made-up DuckDB tables. The hero demo's rows (`web/demo-rows.json`) come from running the extension's SQL on them: `node scripts/demo-rows.ts` (needs the `duckdb` CLI); rerun it after changing `web/sample.ts` or the comparison SQL. The playground runs the same SQL live, on duckdb-wasm loaded from jsDelivr (pinned in `web/playground.ts`).
- TypeScript is erasable-only (`erasableSyntaxOnly`): type annotations, no `enum`, `namespace` or parameter properties. Relative imports carry the `.ts` extension.
- Comparison SQL (`src/query.ts`) runs on BigQuery, DuckDB, Redshift and Snowflake; `byAdapter` emits each warehouse's full query and dbt's Jinja picks one. Check a change to it against DuckDB for real: `examples/duckdb` has a dbt-duckdb project (see its README).
- A new command goes into `package.json` `contributes.commands`; a new shipped file goes into `.vscodeignore` as a `!` line. `test/package.test.ts` fails otherwise.

## Style

- Comments: a one-line `/** */` saying what or why, in plain sentences, on exported functions and non-obvious fields.
- User-facing change: add a line under the next version in `CHANGELOG.md`, written for extension users.
- Commit subject: `Area: what changed`, plain sentence, no Conventional Commits prefix (e.g. `Sidebar: the CTEs of the open SQL or diff, marked changed / new / removed / affected`).
