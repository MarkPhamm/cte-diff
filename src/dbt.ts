/* Runs `dbt show --inline` in a dbt project. No `vscode` import. */
import { execFile, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { dbtError, parseCompiled, parseShow, type Row } from "./query.ts";

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

/** KEY=VALUE lines of a .env file (`export `, quotes and # comments allowed). dbt projects often keep profile
 * values there, and VS Code doesn't load it. */
export function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const v = m[2];
    const q = v[0];
    env[m[1]] = (q === '"' || q === "'") && v.endsWith(q) && v.length > 1 ? v.slice(1, -1) : v.replace(/\s+#.*$/, "");
  }
  return env;
}

function projectEnv(dir: string): Record<string, string> {
  try {
    return parseEnv(fs.readFileSync(path.join(dir, ".env"), "utf8"));
  } catch {
    return {}; // no .env
  }
}

/** The environment dbt runs in: the project's .env fills in what VS Code's environment lacks. DBT_STATIC_ANALYSIS: dbt
 * Fusion would otherwise type-check the SQL first, which fails on tables outside the project and adds time; dbt-core
 * ignores it. dbt-core colours its logs unless DBT_USE_COLORS is off, and the panel would show the escape codes. */
const envFor = (dir: string) => ({ ...projectEnv(dir), ...process.env, DBT_STATIC_ANALYSIS: "off", NO_COLOR: "1", DBT_USE_COLORS: "false" });

const notFound = (dbt: string) => `dbt not found at "${dbt}". Set cteDiff.dbtPath to your dbt executable.`;

/** The arguments every dbt command here ends with: `--target`, then the cteDiff.dbtArgs setting's, such as `--vars`. */
const settingArgs = (o: Omit<ShowOptions, "limit">) => [...(o.target ? ["--target", o.target] : []), ...(o.dbtArgs ?? [])];

/** `dbt debug` in the project: whether dbt finds the project, its profile and the warehouse, and the end of its output. */
export function debug(o: Omit<ShowOptions, "limit">): Promise<{ ok: boolean; output: string }> {
  const args = ["debug", ...settingArgs(o)];
  o.log?.(`$ cd ${o.projectDir} && ${o.dbt} ${args.join(" ")}`);
  return new Promise((resolve) => {
    execFile(o.dbt, args, { cwd: o.projectDir, env: envFor(o.projectDir), maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      o.log?.(stderr.trim() ? `${stdout}\n${stderr}` : stdout);
      if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") resolve({ ok: false, output: notFound(o.dbt) });
      else resolve({ ok: !err, output: dbtError(stdout, stderr) });
    });
  });
}

export interface ShowOptions {
  dbt: string;
  projectDir: string;
  limit: number;
  target?: string;
  /** Appended to every dbt command, after `--target`. */
  dbtArgs?: string[];
  log?: (line: string) => void;
}

let running: ChildProcess | undefined;

/** dbt's output for `args`, run in the project. A new call kills the one still running: dbt runs in one project share
 * target/, and the user has moved on anyway. */
function runDbt(args: string[], o: Omit<ShowOptions, "limit">, signal?: AbortSignal): Promise<{ stdout: string; stderr: string; failed: boolean }> {
  running?.kill();
  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = execFile(o.dbt, args, { cwd: o.projectDir, env: envFor(o.projectDir), maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (running === child) running = undefined;
        o.log?.(stderr.trim() ? `${stdout}\n${stderr}` : stdout);
        if (signal?.aborted || child.killed) return reject(new Error("Cancelled"));
        if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") return reject(new Error(notFound(o.dbt)));
        resolve({ stdout, stderr, failed: err !== null });
      });
    } catch (e) {
      // Spawn throws, rather than calling back, when an argument (the SQL) is over the OS's limit.
      if ((e as NodeJS.ErrnoException).code !== "E2BIG") throw e;
      const kib = Math.round(Math.max(...args.map((a) => Buffer.byteLength(a))) / 1024);
      return reject(new Error(`dbt could not start: the query is ${kib} KiB, over the operating system's limit on one command-line argument (128 KiB on Linux).`));
    }
    running = child;
    signal?.addEventListener("abort", () => child.kill());
  });
}

/** The rows of `sql`. */
export function show(sql: string, o: ShowOptions, signal?: AbortSignal): Promise<Row[]> {
  const args = ["show", "-q", "--inline", sql, "--output", "json", "--limit", String(o.limit), ...settingArgs(o)];
  o.log?.(`$ cd ${o.projectDir} && ${o.dbt} ${["show -q --inline <sql> --output json --limit", o.limit, ...settingArgs(o)].join(" ")}\n${sql}\n`);
  // shortcut: the SQL is one command-line argument, which Linux caps at 128 KiB and Windows at ~32K characters for the
  // whole command line; run it from a temp model file if models that big are common.
  return runDbt(args, o, signal).then(({ stdout, stderr, failed }) => {
    const rows = failed ? undefined : parseShow(stdout);
    if (rows) return rows;
    throw new Error(dbtError(stdout, stderr));
  });
}

/** The SQL dbt renders for `sql`: Jinja, refs, sources and macros resolved, with nothing run on the warehouse. It
 * parses the whole project, as show does, so the same failures apply. */
export function compile(sql: string, o: Omit<ShowOptions, "limit">, signal?: AbortSignal): Promise<string> {
  const args = ["compile", "--inline", sql, "--log-format", "json", ...settingArgs(o)];
  o.log?.(`$ cd ${o.projectDir} && ${o.dbt} ${["compile --inline <sql> --log-format json", ...settingArgs(o)].join(" ")}\n${sql}\n`);
  return runDbt(args, o, signal).then(({ stdout, stderr }) => {
    const compiled = parseCompiled(stdout);
    if (compiled !== undefined) return compiled;
    throw new Error(dbtError(stdout, stderr));
  });
}
