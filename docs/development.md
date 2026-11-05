# Development

```sh
npm install
npm test            # unit tests (node --test)
npm run typecheck
npm run package     # builds cte-diff-<version>.vsix
```

Release: bump `version` in `package.json`, add a `CHANGELOG.md` entry, commit, then run `scripts/release.sh`.

## This site

The site is MkDocs Material, with the landing page in `overrides/home.html`. The playground on it bundles the extension's own parser (`src/cte.ts`, `src/query.ts`) from `web/playground.ts`.

```sh
npm run site:js                        # builds docs/javascripts/playground.js
python3 -m venv .venv && .venv/bin/pip install -r requirements-docs.txt
.venv/bin/mkdocs serve
```

`.github/workflows/pages.yml` builds the site on every pull request and deploys it to GitHub Pages from `main`.
