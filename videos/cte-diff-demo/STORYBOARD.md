# cte-diff demo: storyboard

Two captures (`npm run capture` writes `out/capture/git.mp4` and `files.mp4`, and copies both to `assets/footage/`).
The opening stills are a separate shoot (`node scripts/capture.ts stills`): dbt Power User, CTE Diff not installed.
The screen jumps between the stills, the git diff, and the file comparison. Footage times are seconds into that clip.

| # | Scene | Film | Footage | What happens | Title |
|---|---|---|---|---|---|
| 1 | still-left | 0.0-2.0 | still | Left editor of a git diff. No Execute CTE above payments. | "No Execute CTE on the left." |
| 2 | still-right | 2.0-4.0 | still | The same diff, right editor. Execute CTE is there. | "It only exists on the right." |
| 3 | head | 4.0-14.0 | git 0.2-3.68 at 1x, 3.68-4.99 at 2.5x, a short hold, then 10.25-11.38 at 1x, 11.38-16.12 at 2.5x | The camera tracks the cursor onto the where line, to ▶ Preview on the left, then across to ▶ Preview on the right. 12 rows, then 9. | "12 rows on HEAD." / "9 rows in the working tree." |
| 4 | files | 14.0-22.0 | files 1.45-7.17 at 1x, 7.17-9.13 at 2.5x, then a short hold | The cursor goes to Open the diff, then to ⇄ Compare sides. Three failed payments, only in the old file. | "Two files. Two logics." / "Three failed payments." / "Only in the old file." |
| 5 | end | 22.0-28.0 | none | the mark and wordmark, the install command, the links | `⌘P ext install MarkPhamm.cte-diff` · ctediff.dev · VS Code Marketplace · Open VSX |
