/* Comparing a file with a branch: which branches to offer, and how a git: URI's ref reads in a heading. */

/** A git ref as VS Code's Git extension lists it: type 0 is a local branch, 1 a remote one, 2 a tag. */
export type Ref = { type: number; name?: string };

/** The branches to pick from: the last-used one first, then local, then remote. Leaves out tags, the current branch and remote HEADs. */
export function branchChoices(refs: Ref[], current?: string, last?: string): string[] {
  const names = (type: number) =>
    refs
      .filter((r) => r.type === type && r.name && r.name !== current && !r.name.endsWith("/HEAD"))
      .map((r) => r.name!)
      .sort((a, b) => a.localeCompare(b));
  const all = [...names(0), ...names(1)];
  return last && all.includes(last) ? [last, ...all.filter((n) => n !== last)] : all;
}

/** The ref a git: URI's query names, to show in place of "git"; undefined for HEAD, the index, or no ref. */
export function refLabel(query: string): string | undefined {
  let ref: unknown;
  try {
    ref = JSON.parse(query).ref;
  } catch {
    return undefined;
  }
  if (typeof ref !== "string" || ["", "~", "HEAD"].includes(ref)) return undefined;
  return /^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref;
}
