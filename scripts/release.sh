#!/usr/bin/env bash
# Packages the current version, tags it, creates the GitHub release with the .vsix attached, and publishes to Open VSX
# (Cursor, Windsurf, VSCodium) when OVSX_PAT is in .env. The VS Code Marketplace is published by
# .github/workflows/publish-vscode.yml (Trusted Publishing); the script says when a run is due.
# Usage: bump `version` in package.json, add a CHANGELOG.md entry, commit, then run scripts/release.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

version=$(node -p 'require("./package.json").version')
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "error: uncommitted changes" >&2; exit 1; }
node -e 'process.exit(+process.versions.node.split(".")[0] >= 22 ? 0 : 1)' || { echo "error: needs Node 22+" >&2; exit 1; }

rm -f ./*.vsix
npm ci --no-audit --no-fund
npm run -s typecheck
npm test
npm run -s package
vsix=$(ls ./*.vsix)

git tag -a "v$version" -m "cte-diff v$version"
git push origin "v$version"
gh release create "v$version" "$vsix" --title "cte-diff v$version" --generate-notes

if [ -n "${OVSX_PAT:-}" ]; then
  node_modules/.bin/ovsx publish "$vsix" -p "$OVSX_PAT" --skip-duplicate
else
  echo "note: OVSX_PAT isn't set in .env, so the extension wasn't published to Open VSX"
fi
on_marketplace=$(curl -s -X POST https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery \
  -H "Content-Type: application/json" -H "Accept: application/json;api-version=7.2-preview.1" \
  -d '{"filters":[{"criteria":[{"filterType":7,"value":"MarkPhamm.cte-diff"}]}],"flags":1}' |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const e=JSON.parse(s).results[0].extensions;console.log(e.length?e[0].versions[0].version:"")})' ||
  true)
if [ "$on_marketplace" != "$version" ]; then
  echo "action: publish $version to the VS Code Marketplace: gh workflow run publish-vscode.yml"
fi
