# Ebook changes TODO (from beginner testing)

Owner rule: nothing on this list may get lost. Add new items at the bottom. Mark done with the date and commit.
Code: `tools/ebook/build_v2.py`, `tools/ebook/page17.py`. Rebuild steps are in `docs/HANDOFF-tools-and-ebook-v2.md`.

Status key: OPEN / DONE

## 1. Page 16: Big Three sentences have no guidance (OPEN)
- Found: 2026-10-25, beginner test, step 8 of `D:\poligon\chart_stepbystep.txt`.
- Problem: page 16 shows only "My core self is…", "I feel safe when…", "People first see me as…". A beginner does not know what to write. The formula on page 5 is Planet + Sign + House, but the Big Three show the sign only.
- Wanted change: add a short hint under the Big Three on page 16. Tell the reader to look up the sign in pages 7-14 and finish the sentence with 3 to 6 words. Add one short example.
- Also check: does the tool download (pages 16-18, `TOOL_BUILD`) need the same hint? Does page 5 need a Big Three example?
- Interim fix (not ebook): step 8 in `chart_stepbystep.txt` now explains it with 3 examples.

## 2. Worksheet makes the reader scroll the whole ebook (OPEN)
- Found: 2026-10-25, beginner test (owner has ADHD), step 8.
- Problem: to write one planet sentence the reader must find the planet meaning, the sign meaning and the house meaning on different ebook pages. Too much scrolling. Owner got lost.
- Problem: "write one sentence per planet" is not clear. Reader asks: every planet? (Yes: 13 rows on page 16.)
- Idea A: the tool prints the keywords in each row (planet word + sign word + house word, like page 5 examples). Reader only joins them into a sentence.
- Idea B: make only Big Three + 3 planets required. The other rows are "optional, later".
- Decision: pending (owner).

## 3. Reader takes the element words, not the sign words (OPEN)
- Found: 2026-10-25, beginner test, Big Three on page 16.
- Problem: owner used page 7 element words ("Mind, ideas, connection" = Air, "Feelings, gut instinct" = Water). The right words are the sign keywords on pages 8-9 (for example Gemini: "Curious · chatty · loves variety").
- Problem: even with words, the reader cannot turn a list of words into a sentence. They need a fill-in pattern, not a free sentence.
- Problem: "I feel safe when…" needs a situation, but the sign keywords are adjectives ("Kind · dreamy · creative"). The words do not fit the start. Reader must invent the "when" part. Use the "Gift:" line or change the prompt (for example "I feel safe when I can be…").
- Idea: page 16 Big Three hint names pages 8-9 exactly.

## 4. Hard words in the house list, page 11 (OPEN)
- Found: 2026-10-25, beginner test. Owner did not understand "higher study" (9th house).
- Wanted change: use plain words, for example "university, courses, learning deep subjects". Check all 12 house lines for other hard words.

## 5. Page 17: reader does not see that the meaning is on the same page (OPEN)
- Found: 2026-10-25, beginner test, step 9 ("The meaning is printed on the page" — which page?).
- Problem: the meaning line under each point name does not look like the thing to use. Page 17 also sends the reader to page 5 again (more scrolling).
- Wanted change: label the line, for example "WHAT IT MEANS:".

## 6. The DEGREE column is never explained (OPEN)
- Found: 2026-10-25, beginner test. Owner asked: why skip the degree, where is it explained?
- Fact: no ebook page says what a degree is or why it is on the worksheet. Degrees are used only on page 6 (planets within 5° of an angle) and page 12 (aspects, orbs).
- Wanted change (item 6): one short line on page 15 or 16, for example: "Degree: the exact spot in the sign, 0° to 29°. You do not need it for your sentence. You need it to find aspects (page 12)."

## 7. Page 18 aspects: "what it means for me" is not clear (OPEN)
- Found: 2026-10-25, beginner test, step 10.
- Problem: the reader must join the "read it as" line from page 12 with two planet meanings from page 10. Again 2 pages and a free sentence. The step text does not name page 12.
- Wanted change: the tool fills the "read it as" pattern with the two planet words, for example "Sun (who I am) helps Mars (my energy) when I make the effort." Reader only adds "for me this means…". Step text must name page 12.
## 8. TOOL BUG: Midheaven house is always "10" (OPEN)
- Found: 2026-10-25, while building the paid report.
- Fact: `worksheet.js` sets `midheaven.house = '10'` for every chart. In Whole Sign houses the MC can fall in house 9, 10 or 11. Owner's test chart: Rising Aquarius, MC 4° Sagittarius = whole-sign house 11, but the worksheet prints 10.
- Wanted change: print the real whole-sign house of the MC, or leave the box empty and explain on page 16. Ebook page 4 says "MC is the top of the chart"; add one line that in Whole Sign the MC is not always in house 10.

## 7b. (note for item 7)
- Note: the file name in the tool is `my-chart-worksheet.pdf`. Owner first called it `my-chart-print.pdf`. Check that the print button gives a different, clear file name. Put the sentence pattern on page 17 itself. Same keyword idea as item 2 (tool fills the sign and house words). Give a pattern: "My core self is [word] and [word]." Better: the tool fills the sign keywords next to each Big Three line.

## 9. Page 6: the chart ruler text is hard to understand (OPEN)
- Found: 2026-10-26, owner read the paid report V1 as a customer. The report uses the ebook page 6 text.
- Problem: "The planet that rules your Rising sign. Its sign and house show where your energy tends to go." The owner did not understand it. Why does a planet "rule" a sign? What do I do with it?
- Wanted change: explain in steps. 1) Each sign has one boss planet (list it). 2) Find the boss of your Rising sign. 3) Look where that planet sits: its sign and house is where your energy goes first. Add one example. Explain "modern ruler" in one line or remove it.

## 10. Page 12 and tool page 18: "A helps B" is too abstract (OPEN)
- Found: 2026-10-26, owner read the paid report V1. The aspect table prints "A helps B when I make the effort." with "Read 'A' and 'B' as the two planets in the row" at the end.
- Problem: same as item 7, now seen again in the report. The reader does not know how to read the table.
- Wanted change: same fix as item 7 (the tool fills A and B with the planet words). Also explain the table columns before the table, not after.

## 11. Page 20: "next steps" give no practical value (OPEN)
- Found: 2026-10-26, owner read the paid report V1. The report copies the page 20 texts.
- Problem: Saturn return says only "at about age 29". The reader asks: what does this mean for me, what do I do with it? Progressions: the reader does not understand how to read them.
- Wanted change: Saturn return: add what it means in practice (one or two lines) and tell the reader how to find their own dates (ages about 29, 58, 87). Progressions: explain in plain words with one example, or remove.

## 12. REPORT: "Patterns in your chart" gives no value (DONE 2026-10-27, commit 06b2ce2)
- Found: 2026-10-27, owner read the paid report V2.2 as a customer.
- Problem: the section only points back to other parts of the report. It adds nothing new and wastes a page.
- Wanted change (V3): remove the section as its own page. A pattern that adds new information moves into the chapter it belongs to. Otherwise leave it out.
