# Review: cte-diff demo

## Calls

One film, silent, 28 seconds. The camera tracks the cursor. The 12-row and 9-row titles stay up for about a second. The open is two stills of dbt Power User 0.67: Execute CTE is on the right editor of a git diff and absent on the left. The live half previews payments on HEAD (12 rows) and on the working tree (9), then compares payments across orders_v1.sql and orders_v2.sql (three failed payments, only in the old file). The storyline not built is the previous one: sidebar marks, then order_payments, then final's columns. HyperFrames plan usage: unknown (the CLI reported `unsupported_harness`).

## Measured

`npx hyperframes check --json` (0.9.19): 0 errors. Contrast 16/16. Layout clean. Snapshots at 1.2, 3.2, 6.0, 9.2, 17.0, 21.5, 28.5, 30.8, 35.0, and the end frame. Sound was measured, not heard: there is none.

## Kept on purpose

- `film_silent` / `audio_none`: the plan approved a silent film.
- `nested_media_start_basis_ambiguous` on the later clips: those `data-start` values are composition-local.

## Weakest shot

The left still still shows Power User's "Get Started" tab above the diff. The payments block under it has no Execute CTE, which is the point of the shot. The 12-row and 9-row punches show the badges and the failed rows leaving.

## P0

None open.
