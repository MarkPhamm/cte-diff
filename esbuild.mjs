// Bundles the extension (and, for development, the integration test suite) into out/.
import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");
const site = process.argv.includes("--site");
const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: !production,
  minify: production,
  logLevel: "info",
};
const builds = site
  ? // The docs site's playground: the parser, bundled for the browser.
    [{ entryPoints: ["web/playground.ts"], outfile: "docs/javascripts/playground.js", bundle: true, platform: "browser", format: "iife", target: "es2020", minify: true, logLevel: "info" }]
  : [{ ...common, entryPoints: ["src/extension.ts"], outfile: "out/extension.js" }];
if (!production && !site) builds.push({ ...common, entryPoints: ["test/integration/suite.ts"], outfile: "out/test/suite.js" });

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
