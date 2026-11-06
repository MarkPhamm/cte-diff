# cte-diff demo: storyboard

One continuous take of the real extension (`npm run capture` writes `out/capture/review.mp4` and its marks; copy both
to `assets/footage/`). Each scene plays the next stretch of it, so the screen never jumps; the camera, the titles and the
playback rate change at the cuts. Footage times below are seconds into `review.mp4`.

| # | Scene | Film | Footage | What happens | Title |
|---|---|---|---|---|---|
| 1 | hook | 0.0-6.2 | 1.0-7.2 at 1x | Source Control; orders.sql opens in a diff with its buttons | "A diff shows what the SQL changed." / "It can't show what the data did." |
| 2 | marks | 6.2-11.6 | 7.2-12.6 at 1x | CTE Diff opens; punch on its marks: changed, new, removed, reads a changed CTE | "CTE Diff marks every CTE" / "even ones reading a changed CTE" |
| 3 | preview | 11.6-17.2 | 12.6-13.6 at 1x, 13.6-16.95 at 2.5x, 16.95-20.2 at 1x | ▶ Preview on payments (the new `where`), its 9 rows | "Preview any CTE's rows" |
| 4 | compare | 17.2-24.9 | 20.2-23.6 at 1.5x, 23.6-24.1 at 1x, 24.1-27.2 at 2.5x, 27.2-30.9 at 1x | ⇄ Compare on order_payments, whose SQL is unchanged: 3 changed rows, old above new | "order_payments didn't change." / "Its rows did." |
| 5 | final | 24.9-32.3 | 30.9-33.95 at 1.2x, 33.95-37.55 at 3x, 37.55-41.2 at 1x | ⇄ on final from the sidebar: a column added, one dropped | "Compare from the sidebar" / "Columns match by name" |
| 6 | end | 32.3-38.3 | none | the mark and wordmark, the install command, the links | `⌘P ext install MarkPhamm.cte-diff` · ctediff.dev · VS Code Marketplace · Open VSX |

A later scene (0.8, "Review a PR in one pass"): re-record with Compare all, and insert it between 5 and 6.
