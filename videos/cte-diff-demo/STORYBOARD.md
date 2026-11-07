# cte-diff demo: storyboard

Three captures (`npm run capture` writes `out/capture/git.mp4`, `files.mp4` and `branch.mp4`, and copies them to `assets/footage/`;
`node scripts/capture.ts branch` copies only `branch.mp4`, so the cuts tuned to the other two hold).
The opening stills are a separate shoot (`node scripts/capture.ts stills`): dbt Power User, CTE Diff not installed.
The screen jumps between the stills, the git diff, the file comparison, and the branch comparison. Footage times are seconds into that clip.

| # | Scene | Film | Footage | What happens | Title |
|---|---|---|---|---|---|
| 1 | stills | 0.0-4.7 | still | Left editor of a git diff, no Execute CTE above payments. Pan to the right editor, where it is. Pull out to both. | "No Execute CTE on the left." / "It only exists on the right." |
| 2 | head | 4.4-14.6 | git 0.2-3.68 at 1.5x, 3.68-5.0 at 3x, 5.0-7.3 at 1x, 10.25-11.38 at 1.5x, 11.38-16.12 at 3x, 16.12-18.93 at 1x | Blur in on the same diff with CTE Diff. The camera follows the cursor onto the where line and to ▶ Preview on the left, settles on 12 rows, holds both ▶ Preview buttons while the cursor crosses, settles on 9 rows. | "12 rows on HEAD." / "9 rows in the working tree." |
| 3 | files | 14.4-23.1 | files 1.6-7.17 at 1.5x, 7.17-9.13 at 3x, 9.13-13.46 at 1x | Blur in on the whole window. Open the diff, both files, ⇄ Compare sides, three failed payments only in the old file. Blur out. | "Two files. Two logics." / "Three failed payments." / "Only in the old file." |
| 4 | branch | 22.9-32.0 | branch 1.0-4.93 at 1.5x, 4.93-9.15 at 1.2x, 9.15-10.48 at 3x, 10.48-13.0 at 1x | Blur in on the whole window. ⑂ on orders.sql, pick qa (main, qa listed), the diff opens as orders.sql (qa) ↔ orders.sql, ⇄ Compare sides on order_payments, 3 changed totals. Whip left. | "Or another branch." / "qa on the left." / "Your new logic on the right." / "Three totals changed." |
| 5 | end | 32.0-36.9 | none | the mark and wordmark, the install command, the links | `⌘P ext install MarkPhamm.cte-diff` · ctediff.dev · VS Code Marketplace · Open VSX |
