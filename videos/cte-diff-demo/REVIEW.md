# Review: cte-diff demo

## Calls

One film, silent, 28 seconds. A spring camera follows the cursor and settles on each result; every title holds 0.5 s plus 0.3 s a word (the 12-row title 1.8 s, the 9-row 2 s, the last line 2.1 s). The open is two stills of dbt Power User 0.67: Execute CTE is on the right editor of a git diff and absent on the left. The live half previews payments on HEAD (12 rows) and on the working tree (9), then compares payments across orders_v1.sql and orders_v2.sql (three failed payments, only in the old file). The storyline not built is the previous one: sidebar marks, then order_payments, then final's columns. HyperFrames plan usage: unknown (the CLI reported `unsupported_harness`).

## Measured

`npx hyperframes check --json` (0.9.19): 0 errors. Contrast 16/16. Layout clean. Draft render read at 4 fps, the three seams at 15 fps (4.2, 14.1, 22.9), and stills at 4.3, 4.55, 4.75, 8.6, 13.0, 20.5. The first stills-to-footage dissolve ghosted (Power User's layout differs); it is a blur swap now. Sound was measured, not heard: there is none.

## Kept on purpose

- `film_silent` / `audio_none`: the plan approved a silent film.
- `nested_media_start_basis_ambiguous` on the later clips: those `data-start` values are composition-local.

## Weakest shot

The left still still shows Power User's "Get Started" tab above the diff. The payments block under it has no Execute CTE, which is the point of the shot. The result tables sit at 1.9x, UI text about 25 px, a pixel under the 26 px floor; 2x would crop the 12-row badge.

## P0

None open.
