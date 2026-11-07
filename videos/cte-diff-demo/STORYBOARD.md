# cte-diff demo: storyboard

Two captures (`npm run capture` writes `out/capture/git.mp4` and `files.mp4`, and copies both to `assets/footage/`).
The opening stills are a separate shoot (`node scripts/capture.ts stills`): dbt Power User, CTE Diff not installed.
The screen jumps between the stills, the git diff, and the file comparison. Footage times are seconds into that clip.

| # | Scene | Film | Footage | What happens | Title |
|---|---|---|---|---|---|
| 1 | still-left | 0.0-2.0 | still | Left editor of a git diff. No Execute CTE above payments. | "No Execute CTE on the left." |
| 2 | still-right | 2.0-4.0 | still | The same diff, right editor. Execute CTE is there. | "It only exists on the right." |
| 3 | head | 4.0-13.5 | git 0.2-3.68 at 1x, 3.68-4.99 at 2.5x, 4.99-10.49 at 1x | Punch the new `where`. ▶ Preview on the left (HEAD). 12 rows, failed payments included. | "12 rows on HEAD." |
| 4 | tree | 13.5-20.3 | git 10.7-11.38 at 1x, 11.38-16.12 at 2.5x, 16.12-20.34 at 1x | ▶ Preview on the right (working tree). 9 rows, all success. | "9 rows in the working tree." |
| 5 | slots | 20.3-24.5 | files 0.35-1.59, 1.59-2.94, 2.94-4.55, all at 1x | Compare Files already set: Old orders_v1.sql, New orders_v2.sql. Click Open the diff. | "Two files. Two logics." |
| 6 | compare | 24.5-32.0 | files 4.55-5.91 at 1.25x, 5.91-7.17 at 1x, 7.17-9.13 at 2.5x, 9.13-13.50 at 1x | Punch the filter. ⇄ Compare sides on payments. Three failed payments, only on the old side. | "Three failed payments." / "Only in the old file." |
| 7 | end | 32.0-38.0 | none | the mark and wordmark, the install command, the links | `⌘P ext install MarkPhamm.cte-diff` · ctediff.dev · VS Code Marketplace · Open VSX |
