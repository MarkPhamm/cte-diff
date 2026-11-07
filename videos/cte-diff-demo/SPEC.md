# cte-diff demo: spec

GOAL:    a dbt developer watching muted on the site gets two things: Execute CTE only runs on the right of a git
         diff, and CTE Diff previews payments on HEAD (12 rows) and on the working tree (9); then two files,
         orders_v1.sql and orders_v2.sql, and the three failed payments are only in the old file.
         Leaves with `ext install MarkPhamm.cte-diff`.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, H.264; web copy <= 6 MB.
TIME:    28.0 s x 30 = 840 frames. Silent (the plan approved a silent film).
LOOK:    the site's own sheet (docs/stylesheets/extra.css): ground paper #f7f9f8, flat, no grid, no grain, no vignette;
         ink #19211e, secondary #5f6563; one accent, teal #027567, on one word per shot at most; the logo's red
         #d23415 and teal #028574 only in the mark.
         titles Geist 600, 64 px (5.9% of the height), tracking -0.03em, left at x = 96, in the band y 74-150;
         the window: VS Code (Light Modern) recorded at 2880 x 1800, shown 1728 px wide at x = 96, its title bar
         cropped, top corners 14 px, ring 1 px rgba(25,33,30,.12), shadow 0 12px 32px -16px rgba(25,33,30,.22).
OBJECTS: two stills of dbt Power User with CTE Diff absent (assets/stills); the real extension in a real VS Code
         (`npm run capture`), git.mp4 and files.mp4; the cte-diff mark from the end card; the wordmark in Geist.
MOTION:  words arrive with a 6 px blur -> 0 in 0.13 s, 0.067 s apart, no translate; titles still once landed; leave in
         0.16 s. A title holds 0.5 s + 0.3 s a word. The camera is a critically damped spring (omega 7, about 0.7 s to
         settle) chasing look-at keys: it follows the pointer, holds one framing while the UI works, and settles on
         each result at 1.9x (UI text about 25 px). Cursor travel plays at 1.5x, dbt waits at 3x, results at 1x.
         Seams: a pan from the left editor to the right; a blur swap (out 0.15 s, in 0.15 s) from the stills to the
         footage; a pull-out to the whole window, then a 0.25 s blur swap into the file comparison; one exit, the
         window whips left (0.2 s, power3.in) into the end card.
SHOTS:
  01 stills      0.0-4.7   Power User stills punched 2.05x on the left payments. "No Execute CTE on the left." (left
                           accent). At 2.2 the camera pans to Execute CTE on the right editor. "It only exists on the
                           right." (right accent). It pulls out to both editors (1.2x), then blurs out.
  02 head        4.4-14.6  The same diff with CTE Diff blurs in. The camera rides the pointer up to the new where line,
                           then to ▶ Preview on the left. It settles on the table: "12 rows on HEAD." (12 accent),
                           1.8 s. It pulls back to both ▶ Preview buttons and holds while the pointer crosses and dbt
                           runs. The same table, 9 rows: "9 rows in the working tree." (9 accent), 2 s. Pull-out.
  03 files       14.4-23.1 The whole window blurs into the file view. Push in on Open the diff, back out to both
                           files: "Two files. Two logics." Follow the pointer to ⇄ Compare sides, settle on the
                           result: "Three failed payments." then "Only in the old file." The window whips left.
  04 end         23.1-28.0 the mark performed, the wordmark, `⌘P ext install MarkPhamm.cte-diff`,
                           ctediff.dev · VS Code Marketplace · Open VSX. Hold through 28.
BANNED:  the defaults in the skill's spec.md; a dark void; a title over a dimmed screenshot; three cards in a row;
         invented UI or rows; emoji or icon glyphs in our own titles; the logo docked in a corner.
QA:      1.2, 3.5, 4.5, 8.6, 10.5, 13.0, 15.5, 17.0, 19.5, 21.5, 26.0: titles readable at 360 px wide,
         UI text >= 26 px in punch-ins, the 12 / 9 / 3 counts match the capture, every row shown is real output.
