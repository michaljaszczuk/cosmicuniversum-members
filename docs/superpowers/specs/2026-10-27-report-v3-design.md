# Chart report V3: birth rune, life path number, love, work

Date: 2026-10-27. Owner approved the scope in chat ("1, idziemy w V3: runy + miłość + praca", plus numerology).
Builds on V2.2 (`docs/HANDOFF-chart-report.md`, commit 5b44a7f).

## Why

- The report answers "who am I, why am I like this". A buyer who asks this is often in a change of life. Their next questions are "what do I need in love?" and "what work suits me?". The natal chart can answer both without another person's data.
- The owner's Meta audience reacts very well to reels about runes and life path numbers. People say the life path meanings are "100% accurate". A rune and a number in the report give a link from the reels to the paid product.
- The owner's rule: do not make up data. Every value must come from a named method and a checked source.

## Goals

1. New chapter "Your birth rune": the rune, what it means, its gift, its shadow, and "How to work with your rune".
2. New chapter "Your life path number": the number, the method used, what it means, its gift, its shadow.
3. New part "Where they agree": the code finds themes that the Sun sign, the rune and the number share. The writer writes only about shared themes. When nothing is shared, the report says so plainly.
4. Two new questions in the chart reading: "What do I need in love?" and "What work suits me?".
5. One small practical step at the end of each Big Three answer group (Sun, Moon, Rising).
6. Remove "Patterns in your chart" as its own section (TODO item 12).

## Non-goals

- No hour rune (see "Decided facts").
- No synastry and no partner data.
- No forecasts, transits, "this year" texts or dates in the future. Gumroad bans predictions.
- No career, money, health or relationship advice. Say "what tends to suit you", never "you should".
- No I Ching in V3 (later, maybe as a paid extra).
- No other numerology numbers (expression, soul urge and so on). They need the birth name, which is more personal data.

## Anti-goals (a failure even if it works)

- The report claims the chart, the rune and the number "say the same thing" when the library tags do not match. Reason: the systems are independent. Only the rune follows the Sun.
- "Activate your rune" texts that read as ritual magic or promise results. Etsy bans rituals. The Gumroad rule is not known. Use reflection habits only.
- The report hides that the rune calendar is modern. It must say "a modern runic calendar (Nigel Pennick, 20th century)".
- Any repeat. The owner's rule "nie powtarzaj się" applies to all new text (the 4-word repeat check in `validate.py`).
- A heading at a page bottom with its text on the next page.

## Decided facts (from research, 2026-10-27)

### Birth rune

- System: the runic half-months of Nigel Pennick. 24 Elder Futhark runes. Each rune rules about 15 days. The year starts with Fehu on 29 June.
- Table to use (one rune per day, from Pagan Pages, "based on Pennick's chart, simplified so that only one rune rules any given day"):

| Dates | Rune |
|---|---|
| Jun 29 – Jul 13 | Fehu |
| Jul 14 – Jul 28 | Uruz |
| Jul 29 – Aug 12 | Thurisaz |
| Aug 13 – Aug 28 | Ansuz |
| Aug 29 – Sep 12 | Raidho |
| Sep 13 – Sep 27 | Kenaz |
| Sep 28 – Oct 12 | Gebo |
| Oct 13 – Oct 27 | Wunjo |
| Oct 28 – Nov 12 | Hagalaz |
| Nov 13 – Nov 27 | Nauthiz |
| Nov 28 – Dec 12 | Isa |
| Dec 13 – Dec 27 | Jera |
| Dec 28 – Jan 12 | Eihwaz |
| Jan 13 – Jan 27 | Perthro |
| Jan 28 – Feb 11 | Algiz |
| Feb 12 – Feb 26 | Sowilo |
| Feb 27 – Mar 13 | Tiwaz |
| Mar 14 – Mar 29 | Berkano |
| Mar 30 – Apr 13 | Ehwaz |
| Apr 14 – Apr 28 | Mannaz |
| Apr 29 – May 13 | Laguz |
| May 14 – May 28 | Ingwaz |
| May 29 – Jun 13 | Othala |
| Jun 14 – Jun 28 | Dagaz |

- Rune names: use the spellings in this table everywhere.
- The input is the local birth date from the customer form (not UTC).
- Edge days: Vogue Scandinavia gives the same calendar, but its first day of each rune is also the last day of the rune before (it uses "before or after sunrise" on that day), and in February it differs by 1–2 days (Algiz to 13 Feb, Sowilo 13–27 Feb). The code holds both tables. If the Vogue table gives another rune, or two runes, for the birth date, the report adds one line: "You were born on a day where calendars differ. Some give you <other rune>." The main chapter always uses the Pagan Pages table rune. No sunrise maths.
- Hour rune: dropped. Only one source has it (Vogue Scandinavia, no book cited). It is not clear whether it uses clock time or sun time. That breaks the "100% sure" rule.
- Example: 1 October → Gebo, not an edge day.

### Life path number

- Method (the most common one): reduce the month, the day and the year each to one digit, or keep them if they are 11, 22 or 33. Add the three results. Reduce the sum until it is 1–9, 11, 22 or 33.
- Possible results: 1–9, 11, 22, 33.
- The report prints the method in one plain line and the sum steps, for example "10 → 1, 1 → 1, 1973 → 20 → 2. 1 + 1 + 2 = 4."
- Reason for the method line: about 14% of dates give a different number when all digits are added at once. A customer who checks another website must see why.
- Example: 1973-10-01 → 4. (Adding all digits at once would give 22.)

### Meanings (library)

- Rune meanings: our own plain text. Base them on the Old English, Norwegian and Icelandic rune poems (public domain) and on the common modern meanings. Never copy a modern book.
- Number meanings: our own plain text, cross-checked against at least 2 numerology sources for each number.
- The owner approves every new meaning before it goes live (as for the red lines).

## Library changes (`tools/report/library.json`)

New sections:

- `rune.<Name>` for all 24 runes. Fields: `glyph` (the Unicode rune, U+16A0 block), `means`, `gift`, `shadow`, `practice` (2–3 reflection habits: a daily question, a journal line, keeping the rune in view), `themes` (2–4 tags from the theme list).
- `lifePath.<n>` for 1–9, 11, 22, 33. Fields: `means`, `gift`, `shadow`, `themes`. 11, 22 and 33 also get `base` (2, 4 or 6) and one line on what the master number adds.
- `theme`: the fixed list of theme tags with one plain-word label each. About 12–16 tags, for example partnership, structure, freedom, care, insight, creation, courage, change, growth. The builder writes the final list. Every tag must be used by at least one sign, one rune and one number.

New fields on each of the 12 signs:

- `themes`: 2–4 tags (used for the Sun sign in "Where they agree").
- `love`: what this sign needs in love (used for the Venus sign).
- `partner`: what kind of partner draws you (used for the Descendant sign = 7th house sign).
- `work`: work that tends to suit you (used for the MC sign).
- `workday`: how you like your daily work (used for the 6th house sign).
- `step`: one small practical thing to try this week (used for the Sun, Moon and Rising sign). Reflection or a habit, no advice.

All new texts follow the existing text rules (reading level, banned words, no "will", no predictions) and the repeat check against the old fields.

## Facts changes (`tools/report/facts.mjs`)

- `birthRune`: `{rune, from, to, edge: null | {other, change}}`, from the table above.
- `lifePath`: `{number, steps: {month, day, year}, sum, method: "reduce-parts"}`.
- `agree`: the theme tags shared by at least 2 of: the Sun sign, the birth rune, the life path number. Each entry: `{theme, by: ["sun", "rune", "number"]}`. Computed by code from the library tags.
- `descendantSign` and the 6th house sign, if not in FACTS yet.

## Report changes (`tools/report/build_report.py`)

New order (the builder may adjust only for page fit):

1. Cover, Start here
2. Big Three (as V2.2) + one "Try this week" line under each of the Sun, Moon and Rising groups (code prints `lib:sign.<sign>.step`).
3. Love: h2 "Love: what you need". Questions: `love.needs` "What do I need in love?", `love.draws` "Who am I drawn to?".
4. Work: h2 "Work: what suits you". Questions: `work.suits` "What work suits me?", `work.daily` "How do I like to work day to day?".
5. Your birth rune: big glyph, name, dates, the "modern calendar" line, the edge line if needed. Code prints `means`, `gift`, `shadow`. Writer section `rune` (2–4 sentences, links the rune to this chart only through cited facts). Code prints "How to work with your rune" from `practice`.
6. Your life path number: big number, the method line and the steps. Code prints `means`, `gift`, `shadow`. Writer section `lifePath` (2–4 sentences).
7. Where they agree: the code prints each shared theme with the labels of who shares it. Writer section `agree` (2–4 sentences, cites `fact:agree`). If `agree` is empty, code prints one fixed line: "Your Sun, your rune and your number each show a different side of you." and the writer writes `agree` about the difference, citing all three.
8. Your chart in detail: chart at a glance, planets, points, balance, moon phase, retrograde, angles, aspects (as V2.2).
9. For later (as V2.2).

Removed: the "Patterns in your chart" section. A pattern that adds something new moves into the Big Three or the aspects part as one line. Otherwise it is left out. The pattern facts stay in FACTS.

## Writer, validator, tests

- `PROMPT.md`: new sections and their sources:
  - `love.needs`: `lib:sign.<Venus sign>.love`, the Venus house fact. Not the Moon `.needs` and not the Venus `.likes` (the Big Three already use them).
  - `love.draws`: `lib:sign.<Descendant sign>.partner`, planets in the 7th house.
  - `work.suits`: `lib:sign.<MC sign>.work`, planets in the 10th house.
  - `work.daily`: `lib:sign.<6th house sign>.workday`, planets in the 6th house.
  - `rune`, `lifePath`, `agree` as above.
  - Each answer: 2–5 sentences, at least 2 sources, each sentence cites at least one fact.
  - Remove `pattern.<n>` from the job ticket.
- `validate.py`: add the new sections to `REQUIRED`. Reject a rune name or a number in the text that FACTS do not hold (same as signs and houses). The `agree` section may only name themes that are in `fact:agree`, or none when it is empty.
- Tests (demo data only, never real birth data):
  - rune table: every day of a leap year maps to exactly one rune; known dates (29 Jun → Fehu, 1 Oct → Gebo, 12 Feb → Sowilo, 28 Jun → Dagaz, 31 Dec → Eihwaz, 29 Feb → Tiwaz); edge line on 28 Sep (Vogue: Kenaz or Gebo) and on 12 Feb (Vogue: Algiz); no edge line on 1 Oct.
  - life path: 1973-10-01 → 4; a date with a master number part; a sum that gives 11, 22 or 33; 29 Feb.
  - agree: shared tags only; empty case.
  - library: all 24 runes and 12 numbers have every field; every tag is in `theme`; text rules on all new fields.
  - build: the new chapters are present; no "Patterns in your chart"; layout rules (no heading at a page bottom) still pass.

## Owner approval steps

1. The builder writes the new library texts into a check file, like `D:\poligon\V2_red_line_examples_CHECK.txt`: `D:\poligon\V3_meanings_CHECK.txt`.
2. The owner reads and approves or changes them.
3. Only then the texts go into `library.json` with "approved on <date>" in `_about`.
4. The builder makes `D:\poligon\Michal_birth-chart_V3.pdf` from the private sample. Real birth data never enters git.

## Left to the builder

- The final theme list and the tags of each sign, rune and number (owner approves them with the meanings).
- Page layout of the rune and number pages (glyph size, colours), inside the existing style. Check that the report fonts have the runic glyphs (U+16A0–U+16FF). If not, embed a free font with them (for example Noto Sans Runic, SIL OFL) or draw the rune.
- The exact wording of fixed code lines, inside the text rules.

## Sources

- Rune table: [Pagan Pages, Runic Divination (Pennick-based table)](https://paganpages.org/emagazine/2009/06/01/runic-divination-3/), cross-checked with [Vogue Scandinavia birth runes](https://www.voguescandinavia.com/articles/learn-how-to-read-your-viking-birth-runes).
- Pennick's half-months: [The Pagan Book of Days (chapter "The Runic Half-Months")](https://www.innertraditions.com/books/the-pagan-book-of-days).
- Life path method: [Pardesco](https://numerology.pardesco.com/life-path/how-to-calculate/), [Bonnie Sorsby](https://bonniesorsby.com/life-path-number-meaning-calculator/), [method difference dataset](https://huggingface.co/datasets/vk0/life-path-number-distribution).
