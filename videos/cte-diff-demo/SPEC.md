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
         0.16 s. The two stills do not leave their titles; the cut does. The camera tracks the cursor: linear
         between measured pointer samples, and it only leaves the pointer for the length of a result title.
         The stills open already punched. Waits for dbt play at 2.5x. One exit: the window whips
         left (0.2 s, power3.in) into the end card.
SHOTS:
  01 still-left  0.0-2.0   Left editor, no Execute CTE. "No Execute CTE on the left." (left accent). Punch 2.05x.
  02 still-right 2.0-4.0   Right editor, Execute CTE present. "It only exists on the right." (right accent). Punch 2.05x.
  03 head        4.0-14.0  The camera stays on the cursor. It rides the pointer up to the new where line,
                           across to ▶ Preview on the left, and later across to ▶ Preview on the right.
                           dbt at 2.5x. "12 rows on HEAD." is on for about a second, then the pointer moves
                           and the camera goes with it. "9 rows in the working tree." (9 accent), same length.
  04 files       14.0-22.0 The pointer travels to Open the diff, then across the file diff to ⇄ Compare sides.
                           "Two files. Two logics." dbt at 2.5x. "Three failed payments." then
                           "Only in the old file." The window whips left.
  05 end         22.0-28.0 the mark performed, the wordmark, `⌘P ext install MarkPhamm.cte-diff`,
                           ctediff.dev · VS Code Marketplace · Open VSX. Hold through 28.
BANNED:  the defaults in the skill's spec.md; a dark void; a title over a dimmed screenshot; three cards in a row;
         invented UI or rows; emoji or icon glyphs in our own titles; the logo docked in a corner.
QA:      1.2, 3.2, 5.2, 7.3, 8.6, 10.2, 13.2, 15.5, 18.5, 21.2, 25.0: titles readable at 360 px wide,
         UI text >= 26 px in punch-ins, the 12 / 9 / 3 counts match the capture, every row shown is real output.
