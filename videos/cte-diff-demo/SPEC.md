# cte-diff demo: spec

GOAL:    a dbt developer watching muted on the site or the README gets "a diff shows the SQL change; CTE Diff shows
         what it did to the rows, CTE by CTE, from the diff I already have", and leaves with `ext install MarkPhamm.cte-diff`.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, H.264; web copy <= 6 MB.
TIME:    38.3 s x 30 = 1149 frames. Silent (the plan approved a silent film, as qdbd's).
LOOK:    the site's own sheet (docs/stylesheets/extra.css): ground paper #f7f9f8, flat, no grid, no grain, no vignette;
         ink #19211e, secondary #5f6563; one accent, teal #027567, on one word per shot at most; the logo's red
         #d23415 and teal #028574 only in the mark.
         titles Geist 600, 64 px (5.9% of the height), tracking -0.03em, left at x = 96, in the band y 74-150;
         code identifiers in titles Geist Mono 500.
         the window: VS Code (Light Modern) recorded at 2880 x 1800, shown 1728 px wide at x = 96, its title bar
         cropped, top corners 14 px, ring 1 px rgba(25,33,30,.12), shadow 0 12px 32px -16px rgba(25,33,30,.22).
OBJECTS: the real extension in a real VS Code (`npm run capture`), the site's jaffle_shop orders change, the cte-diff
         mark from media/logo/cte-diff.svg (parentheses, a grey line, a red line, a teal line), the wordmark in Geist.
MOTION:  words arrive with a 6 px blur -> 0 in 0.13 s, 0.067 s apart, no translate; titles still once landed; leave in
         0.16 s. Camera power2.inOut 0.45-0.6 s, then holds while the UI acts; punch-ins 1.55-1.9x so UI text is
         >= 26 px. Waits for dbt play at 2.5-3x. One exit: the window whips left (0.2 s, power3.in) into the end card.
SHOTS:
  01 hook     0.0-6.2   Source Control, the change opens in a diff (real). "A diff shows what the SQL changed."
                        then "It can't show what the data did." (data in accent). Camera at 1x: the workspace.
  02 marks    6.2-11.6  click CTE Diff: the sidebar marks every CTE; punch 1.9x on the list.
                        "CTE Diff marks every CTE", then "even ones reading a changed CTE" (accent).
  03 preview 11.6-17.2  punch 1.6x on payments' lens and its new where line; click; dbt at 2.5x; the rows;
                        punch 1.7x on the table. "Preview any CTE's rows".
  04 compare 17.2-24.9  scroll to order_payments at 1.5x; punch 1.7x on its unchanged SQL; click Compare; the pairs
                        old above new; punch 1.9x. "order_payments didn't change." then "Its rows did." (rows accent).
  05 final   24.9-32.3  punch 1.8x on the sidebar: hover final, click ⇄; dbt at 3x; the columns-differ line and the
                        hatched cells, 1.55x. "Compare from the sidebar", then "Columns match by name" (accent).
                        The window whips left.
  06 end     32.3-38.3  the mark performed (parentheses draw, three lines slide in), the wordmark wipes in, then
                        `⌘P ext install MarkPhamm.cte-diff` and ctediff.dev · VS Code Marketplace · Open VSX; hold 3 s.
BANNED:  the defaults in the skill's spec.md; a dark void; a title over a dimmed screenshot; three cards in a row;
         invented UI or rows; emoji or icon glyphs in our own titles; the logo docked in a corner.
QA:      2.0, 5.0, 8.5, 13.0, 15.5, 19.6, 22.5, 26.0, 29.5, 31.0, 34.0, 37.5: titles readable at 360 px wide,
         UI text >= 26 px in punch-ins, no jump at the cuts, every row shown is the extension's real output.
