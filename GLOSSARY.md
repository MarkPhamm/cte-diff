# cte-diff

A VS Code extension that shows what a dbt change does to the data, one CTE at a time. It runs each CTE through `dbt show` on the user's own warehouse.

## Running a CTE

**Preview**:
A CTE's rows on one side, or the whole query's rows.
_Avoid_: run, execute, show, Preview CTE

**Compare**:
A CTE run on both sides in one query. It returns the rows that only one side has, plus each side's row count. The result is a **comparison**.
_Avoid_: diff (the editor's text diff), data diff

**Side**:
One of the two versions of the SQL. In a git diff the left side is HEAD and the right side is the working tree. In a file comparison the left side is the old file and the right side is the new file.
_Avoid_: base, pane, half, before/after

**Supported warehouse**:
A warehouse that Compare has SQL for. Preview runs on every warehouse dbt supports.
_Avoid_: adapter (in text for users)

## A diff

**Git diff**:
One SQL path opened as a diff. The left side is a committed version: HEAD by default, or a branch's. The right side is the working tree.
_Avoid_: both sides of the working tree, branch diff

**HEAD**:
The committed version of a file on the current branch. The default left side of a git diff.
_Avoid_: old side, original

**Branch**:
The branch picked for a git diff's left side, such as `qa` while working on `dev`. Its latest commit is used, not the commit where the current branch forked from it.
_Avoid_: base branch, target (a dbt target is a warehouse connection)

**Working tree**:
The version of a file in the working directory, including uncommitted edits. The right side of a git diff.
_Avoid_: new side, modified

**File comparison**:
Two SQL paths opened as a diff. They are not two versions of one path.
_Avoid_: two-file diff, file diff

**Old**:
The left file of a file comparison, and the Compare Files slot that holds it.
_Avoid_: before, original file

**New**:
The right file of a file comparison, and the Compare Files slot that holds it.
_Avoid_: after, modified file

**Execute CTE**:
dbt Power User's lens on a CTE. On a git diff that lens is only on the right editor. CTE Diff's button is ▶ Preview.
_Avoid_: Preview CTE

## Reading results

**Mark**:
The sidebar's label for a CTE, found by comparing the text of both sides. It is one of **changed**, **new**, **removed** or **reads a changed CTE**.
_Avoid_: status, affected

**Id column**:
A column named like a key (`id`, `*_id`, `*_key`, `*_pk`, `*_sk`). It pairs the old and new versions of a changed row.
_Avoid_: key, primary key

**Verdict**:
The comparison's one-line answer: the sides are the same, they differ, or they differ only by duplicates.
_Avoid_: result, status
