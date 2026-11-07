# Development

Node 22 or later: Node runs the `.ts` files directly, with no build step.

```sh
npm install
npm test                  # unit tests (node --test)
npm run typecheck
npm run test:integration  # in a real VS Code, downloaded to .vscode-test
npm run package           # builds cte-diff-<version>.vsix
```

Release: bump `version` in `package.json`, add a `CHANGELOG.md` entry, commit, then run `scripts/release.sh`.

## Screenshots and footage

The README's Compare Files still, and the footage for the demo video, come from the packaged extension in a real VS Code. `npm run capture` packages the extension and builds a scratch dbt-duckdb project from `web/sample.ts`. `orders.sql` is committed as the old query, then rewritten, so a git diff has HEAD on the left and the working tree on the right. `orders_v1.sql` stays the old query. `orders_v2.sql` is the new query. The capture then previews `payments` on the left and the right (`git.mp4`), and compares `payments` across the two files (`files.mp4`).

```sh
npm run capture                          # compare-files.png, and out/capture/git.mp4 and files.mp4
node scripts/capture.ts stills           # Power User stills, CTE Diff not installed
```

It needs ffmpeg, the duckdb CLI and a dbt with dbt-duckdb: set `CTE_DIFF_DBT`, or set up `examples/duckdb`'s venv (see its README). Rerun it after any change to what the sidebar, the CodeLens or the results look like.

`npm run render` in `videos/cte-diff-demo` writes `renders/cte-diff-demo.mp4`. `ship.sh` reads that file and writes the web mp4, the poster and, through `gifs.sh`, the README's opening GIF. The Use it loops (`demo-diff`, `demo-marks`, `demo-preview`, `demo-compare`, `demo-final`) are the previous film. `gifs.sh` does not recut them.

## This site

The site is MkDocs Material, with the landing page in `overrides/home.html` and the playground page in `overrides/playground.html`. The landing page's live demo (`web/demo.ts`) and the playground (`web/playground.ts`) bundle the extension's own parser and results view (`src/cte.ts`, `src/query.ts`, `src/results.ts`). Both run the extension's SQL over the made-up tables in `web/sample.ts`: the demo from `web/demo-rows.json`, generated on DuckDB; the playground live, on DuckDB in the browser (duckdb-wasm).

```sh
npm run site:js                        # builds docs/javascripts/playground.js and demo.js
node scripts/demo-rows.ts              # regenerates web/demo-rows.json (needs the duckdb CLI)
python3 -m venv .venv && .venv/bin/pip install -r requirements-docs.txt
.venv/bin/mkdocs serve
```

`.github/workflows/pages.yml` builds the site on every pull request and deploys it to GitHub Pages from `main`.
