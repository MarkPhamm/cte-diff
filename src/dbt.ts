/* Runs `dbt show --inline` in a dbt project. No `vscode` import. */
import { execFile, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { dbtError, parseShow, type Row } from "./query.ts";

/** The nearest folder at or above `file`'s folder that holds a dbt_project.yml. */
export function projectDirOf(file: string): string | undefined {
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "dbt_project.yml"))) return dir;
    if (path.dirname(dir) === dir) return undefined;
  }
}

/** `setting`, else the first dbt that exists: the project's or workspace's virtualenv, then where installers put it
 * (VS Code started from the Dock may not have them on PATH), else plain `dbt` from PATH. */
export function findDbt(setting: string, dirs: string[], platform = process.platform, home = os.homedir()): string {
  if (setting) return setting;
  const exe = platform === "win32" ? "dbt.exe" : "dbt";
  const bin = platform === "win32" ? "Scripts" : "bin";
  const candidates = [
    ...dirs.flatMap((d) => [".venv", "venv"].map((v) => path.join(d, v, bin, exe))),
    path.join(home, ".local", "bin", exe),
    "/opt/homebrew/bin/dbt",
    "/usr/local/bin/dbt",
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? "dbt";
}

export interface ShowOptions {
  dbt: string;
  projectDir: string;
  limit: number;
  target?: string;
  log?: (line: string) => void;
}

let running: ChildProcess | undefined;

/** The rows of `sql`. A new call kills the one still running: dbt runs in one project share target/, and the user
 * has moved on anyway. */
export function show(sql: string, o: ShowOptions, signal?: AbortSignal): Promise<Row[]> {
  running?.kill();
  const args = ["show", "-q", "--inline", sql, "--output", "json", "--limit", String(o.limit)];
  if (o.target) args.push("--target", o.target);
  o.log?.(`$ cd ${o.projectDir} && ${o.dbt} show -q --inline <sql> --output json --limit ${o.limit}${o.target ? ` --target ${o.target}` : ""}\n${sql}\n`);
  return new Promise((resolve, reject) => {
    // DBT_STATIC_ANALYSIS: dbt Fusion would otherwise type-check the SQL first, which fails on tables outside the
    // project and adds time; dbt-core ignores it.
    const env = { ...process.env, DBT_STATIC_ANALYSIS: "off", NO_COLOR: "1" };
    // shortcut: the SQL goes on the command line, which Windows caps at ~32K characters; use a temp file if that bites.
    const child = execFile(o.dbt, args, { cwd: o.projectDir, env, maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (running === child) running = undefined;
      o.log?.(stderr.trim() ? `${stdout}\n${stderr}` : stdout);
      if (signal?.aborted || child.killed) return reject(new Error("Cancelled"));
      if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") {
        return reject(new Error(`dbt not found at "${o.dbt}". Set cteDiff.dbtPath to your dbt executable.`));
      }
      const rows = err ? undefined : parseShow(stdout);
      if (rows) resolve(rows);
      else reject(new Error(dbtError(stdout, stderr)));
    });
    running = child;
    signal?.addEventListener("abort", () => child.kill());
  });
}
