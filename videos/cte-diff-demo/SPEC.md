# cte-diff demo: spec

GOAL:    a dbt developer watching muted on the site gets two things: Execute CTE only runs on the right of a git
         diff, and CTE Diff previews payments on HEAD (12 rows) and on the working tree (9); then two files,
         orders_v1.sql and orders_v2.sql, and the three failed payments are only in the old file.
         Leaves with `ext install MarkPhamm.cte-diff`.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, H.264; web copy <= 6 MB.
TIME:    38.0 s x 30 = 1140 frames. Silent (the plan approved a silent film).
LOOK:    the site's own sheet (docs/stylesheets/extra.css): ground paper #f7f9f8, flat, no grid, no grain, no vignette;
         ink #19211e, secondary #5f6563; one accent, teal #027567, on one word per shot at most; the logo's red
         #d23415 and teal #028574 only in the mark.
         titles Geist 600, 64 px (5.9% of the height), tracking -0.03em, left at x = 96, in the band y 74-150;
         the window: VS Code (Light Modern) recorded at 2880 x 1800, shown 1728 px wide at x = 96, its title bar
         cropped, top corners 14 px, ring 1 px rgba(25,33,30,.12), shadow 0 12px 32px -16px rgba(25,33,30,.22).
OBJECTS: two stills of dbt Power User with CTE Diff absent (assets/stills); the real extension in a real VS Code
         (`npm run capture`), git.mp4 and files.mp4; the cte-diff mark from the end card; the wordmark in Geist.
MOTION:  words arrive with a 6 px blur -> 0 in 0.13 s, 0.067 s apart, no translate; titles still once landed; leave in
         0.16 s. The two stills do not leave their titles; the cut does. Camera power2.inOut 0.5-0.55 s, then holds
         while the UI acts. The stills open already punched. Waits for dbt play at 2.5x. One exit: the window whips
         left (0.2 s, power3.in) into the end card.
SHOTS:
  01 still-left  0.0-2.0   Left editor, no Execute CTE. "No Execute CTE on the left." (left accent). Punch 2.05x.
  02 still-right 2.0-4.0   Right editor, Execute CTE present. "It only exists on the right." (right accent). Punch 2.05x.
  03 head        4.0-13.5  git diff of orders.sql, already open. Punch 2.8x on the new where line, right editor only. No title.
                           Click ▶ Preview on the left. dbt at 2.5x. "12 rows on HEAD." (12 accent). Punch 1.6x
                           on the row badge.
  04 tree        13.5-20.3 Click ▶ Preview on the right. dbt at 2.5x. "9 rows in the working tree." (9 accent).
                           Punch 1.6x on the row badge.
  05 slots       20.3-24.5 Sidebar, Old orders_v1.sql, New orders_v2.sql. Punch 1.85x. Click Open the diff.
                           "Two files. Two logics." (logics accent).
  06 compare     24.5-32.0 Punch 1.65x on where status = 'success'. No title on the line. Click ⇄ Compare sides.
                           dbt at 2.5x. "Three failed payments." then "Only in the old file." (old accent).
                           Punch 1.55x on the three failed rows. The window whips left.
  07 end         32.0-38.0 the mark performed, the wordmark, `⌘P ext install MarkPhamm.cte-diff`,
                           ctediff.dev · VS Code Marketplace · Open VSX. Hold through 38.
BANNED:  the defaults in the skill's spec.md; a dark void; a title over a dimmed screenshot; three cards in a row;
         invented UI or rows; emoji or icon glyphs in our own titles; the logo docked in a corner.
QA:      1.2, 3.2, 6.5, 9.2, 16.5, 22.0, 28.2, 30.5, 35.0: titles readable at 360 px wide,
         UI text >= 26 px in punch-ins, the 12 / 9 / 3 counts match the capture, every row shown is real output.
