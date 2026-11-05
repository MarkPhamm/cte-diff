# Development

```sh
npm install
npm test            # unit tests (node --test)
npm run typecheck
npm run package     # builds cte-diff-<version>.vsix
```

Release: bump `version` in `package.json`, add a `CHANGELOG.md` entry, commit, then run `scripts/release.sh`.

## This site

The site is MkDocs Material, with the landing page in `overrides/home.html`. Its live demo (`web/demo.ts`) and playground (`web/playground.ts`) bundle the extension's own parser and results view (`src/cte.ts`, `src/query.ts`, `src/results.ts`). The demo's rows are `web/demo-rows.json`, from running the extension's SQL on DuckDB over made-up tables.

```sh
npm run site:js                        # builds docs/javascripts/playground.js and demo.js
node scripts/demo-rows.ts              # regenerates web/demo-rows.json (needs the duckdb CLI)
python3 -m venv .venv && .venv/bin/pip install -r requirements-docs.txt
.venv/bin/mkdocs serve
```

`.github/workflows/pages.yml` builds the site on every pull request and deploys it to GitHub Pages from `main`.
