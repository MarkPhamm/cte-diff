/* A git: side of a diff compiles in a copy of the dbt project as that side's commit, or the index, has it, so dbt
 * renders it with that side's macros instead of the working tree's. No `vscode` import. */
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gitRef } from "./branch.ts";
import { compile, type ShowOptions } from "./dbt.ts";

type Options = Omit<ShowOptions, "limit">;

/** One side of a diff: a file:, untitled: or git: URI. */
type Side = { scheme: string; query: string; fsPath: string };

/** git's exit code and output for `args`, run in `cwd`; code -1 when git didn't run. */
function git(args: string[], cwd: string, o: Options, signal?: AbortSignal, env?: Record<string, string>): Promise<{ code: number; stdout: string; stderr: string }> {
  o.log?.(`$ cd ${cwd} && git ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, signal, env: env && { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (stderr.trim()) o.log?.(stderr.trim());
      if (signal?.aborted) return reject(new Error("Cancelled"));
      resolve({ code: err ? (typeof err.code === "number" ? err.code : -1) : 0, stdout, stderr });
    });
  });
}

/** `f`'s result on a copy of the dbt project as the git: side at `uri` has it, when the project differs there from the
 * working tree's in more than the file itself, such as a macro. Undefined, with nothing copied, when it doesn't, or when
 * the side isn't at a commit or the index: the open project serves. The copy is removed afterwards. */
export async function inCopy<T>(uri: Side, o: Options, f: (projectDir: string) => Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
  const ref = uri.scheme === "git" ? gitRef(uri.query) : undefined;
  if (ref === undefined || ref.startsWith("-")) return undefined; // git would read it as an option
  const index = ref === "" || ref === "~"; // the index, as Source Control's diffs name it
  const run = (args: string[], env?: Record<string, string>) => git(args, o.projectDir, o, signal, env);
  const file = `:(exclude)${path.relative(o.projectDir, uri.fsPath).split(path.sep).join("/")}`;
  const diff = await run(["diff", "--quiet", ...(index ? [] : [`${ref}^{commit}`]), "--", ".", file]);
  if (diff.code !== 0 && diff.code !== 1) return undefined; // not a repository, or the ref isn't a commit
  // Untracked SQL, such as a new macro, counts too; not other files, such as the .user.yml dbt writes.
  if (diff.code === 0 && !(await run(["ls-files", "--others", "--exclude-standard", "--", "*.sql", file])).stdout.trim()) return undefined;
  const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cte-diff-"));
  try {
    const env = index ? undefined : { GIT_INDEX_FILE: path.join(tmp, "index") };
    const step = async (args: string[]) => {
      const r = await run(args, env);
      if (r.code) throw new Error(`git ${args[0]} failed: ${r.stderr.trim()}`);
    };
    if (!index) await step(["read-tree", `${ref}^{commit}`]);
    // Run in the project's folder, checkout-index writes only that folder, at its path in the repository.
    await step(["checkout-index", "--all", `--prefix=${path.join(tmp, "tree")}/`]);
    const dir = path.join(tmp, "tree", (await run(["rev-parse", "--show-prefix"])).stdout.trim());
    // The open project's profile serves (envFor), never one the ref commits, which could point at another host.
    fs.rmSync(path.join(dir, "profiles.yml"), { force: true });
    // shortcut: links dbt_packages, the default packages-install-path; read dbt_project.yml if a project sets another.
    const packages = path.join(o.projectDir, "dbt_packages");
    if (fs.existsSync(packages) && !fs.existsSync(path.join(dir, "dbt_packages"))) fs.symlinkSync(packages, path.join(dir, "dbt_packages"), "junction");
    return await f(dir);
  } finally {
    // rm removes the link, not the open project's packages.
    await fs.promises.rm(tmp, { recursive: true, force: true }).catch((e: Error) => o.log?.(`Couldn't remove ${tmp}: ${e.message}`));
  }
}

/** The profile a dbt_project.yml's `profile:` line names, when it is a plain name rather than Jinja. */
export const profileName = (yml: string) => yml.match(/^profile:\s*["']?([\w.-]+)["']?\s*(?:#.*)?$/m)?.[1];

/** The SQL dbt compiles for `sql` on the git: side at `uri`, in a copy of the project as that side has it (inCopy);
 * undefined when the open project serves. The open project's .env, profile and target apply, so it reads the same
 * relations as the other side, and a ref's dbt_project.yml can't switch it to another profile, such as prod. */
export const compileAt = (uri: Side, sql: string, o: Options, signal?: AbortSignal): Promise<string | undefined> =>
  inCopy(
    uri,
    o,
    (dir) => {
      const profile = profileName(fs.readFileSync(path.join(o.projectDir, "dbt_project.yml"), "utf8"));
      const dbtArgs = [...(profile ? ["--profile", profile] : []), ...(o.dbtArgs ?? [])];
      return compile(sql, { ...o, projectDir: dir, profileDir: o.projectDir, dbtArgs }, signal);
    },
    signal,
  );

/** `sql` for the open project to run as the side at `uri`: as is, or compiled with that side's macros (compileAt) in a
 * raw block, so dbt doesn't render it again. */
export async function sideSql(uri: Side, sql: string, o: Options, signal?: AbortSignal): Promise<string> {
  const compiled = await compileAt(uri, sql, o, signal);
  return compiled === undefined ? sql : `{% raw %}${compiled}{% endraw %}`;
}
