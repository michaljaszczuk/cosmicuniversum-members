# Chart tools and "Read Your Own Chart" v2 — design

Date: 2026-10-21. Owner: the ebook's author (owns all rights to the ebook).
Status: draft for owner approval. Nothing is built yet.

## 1. Intent and why

The ebook *Read Your Own Chart* (19 pages, English, A4) teaches a beginner to read a birth chart.
Step 2 on page 2 ("Make your chart") sends the reader to "any free birth chart website". That
is the weak point of the whole book. Other sites use different words, different layouts, extra
terms and often a different house system. New readers get lost exactly there.

We replace that step with our own tools on the owner's site, `cosmicuniversum.com`:

1. **Chart worksheet tool** at `/tools`. The reader enters birth date, time and place. The tool
   returns the ebook's own worksheet pages, already filled with their chart data, to print or save.
2. **2027 sky calendar** at `/tools`. A web version of ebook page 18 that shows every date in the
   reader's own time zone.
3. **Ebook v2.** The ebook gains one page ("My chart, part 2"), so the worksheet can hold every
   point the book teaches. The new PDFs go live on the site.

The guiding rule, set by the owner: **the tools and the ebook must match 1:1.** The tool computes
exactly what the ebook teaches, in the ebook's words and order, and writes it into the ebook's own
pages. The second rule: **readability above everything else.**

## 2. Goals

- A reader with the ebook open can get a correct chart in under a minute and never leave the book's vocabulary.
- Every value the worksheet asks for is filled in correctly.
- The reader's birth data never leaves their device.
- The calendar shows correct dates in the reader's own time zone, with no hand arithmetic.
- The tools bring in search visitors and lead them to the free workbook (`/free`).

## 3. Non-goals

- Placidus or any other house system. **Whole Sign only** (owner's decision).
- Writing any text for the reader. The "My sentence" lines, "Chart story", "My intention for this
  workbook" and all other writing boxes stay **empty**. That is the reader's job (owner's decision).
- Transits, synastry, progressions (ebook page 20 only names them).
- Accounts, saving charts on a server, analytics on birth data.
- An email gate or paywall. The tools are public (owner's decision).
- Languages other than English.
- Any use of Swiss Ephemeris code or data (see constraints).

## 4. Anti-goals (a failure even if it "works")

- Any value that disagrees with the ebook's own rules (page numbers, orbs, houses, element counts).
- A filled page that is harder to read than the blank one.
- Birth data in a URL, a log, an analytics event, a cookie or a server request.
- Silent wrong answers: a missing birth time, a polar-latitude chart or an ambiguous local time must
  be shown to the reader plainly, never guessed quietly.
- A new ebook page that looks like a different book.

## 5. Decisions already made by the owner

| Topic | Decision |
|---|---|
| Where the maths runs | In the reader's browser (the "Option B" design). No Python server. |
| Who can use the tools | Everyone, public, at `/tools`. |
| House system | Whole Sign only. |
| Output | The filled-in worksheet pages, to print or save. |
| What the tool writes | Data only. Sentences, story, intentions stay empty. |
| Extra points on the worksheet | Add a **new page 17, "My chart, part 2"** (South Node, Black Moon Lilith, Part of Fortune, Vertex). Ebook grows to 20 pages. |
| Calendar | 2027 only, times in the reader's own time zone. |
| Ebook on the site | The new ebook replaces the old one on the owner's Cloudflare site. |
| Source of the ebook | **None. Only the PDFs exist.** |

## 6. Constraints

- **Site:** Cloudflare Pages, static files plus small JS functions (`C:/Users/micha/Downloads/cosmicuniversum-members`,
  repo `michaljaszczuk/cosmicuniversum-members`, private). Deploy with `npx wrangler pages deploy public --project-name cosmicuniversum --branch main`.
  No server-side Python. Existing pages use `/assets/style.css` and `/assets/consent.js`.
- **Licences:** permissive only. The sister repo `daily-oracle-repo` forbids Swiss Ephemeris and
  anything derived from it (AGPL), and records this in `LICENSES.md`. The same rule applies here.
  Planet data comes from NASA JPL (DE440s, public domain). The ebook's page 18 cites Swiss Ephemeris
  as its source; our computation must not.
- **Privacy:** birth data stays in the browser. Libraries are self-hosted (no CDN). The site's
  consent banner and Facebook pixel exist; they may record that a tool was used, never what was typed.
  The privacy page needs a short new paragraph (owner to approve wording).
- **Look and feel:** same fonts and colours as the ebook and the site (Marcellus, the navy and gold
  palette, element colours: fire red, earth green, air yellow, water blue). Mobile first.
- **Embedded fonts in the ebook PDFs:** Marcellus, Liberation Sans, DejaVu Sans, Noto Sans Symbols 2.
  Planet and sign glyphs come from the symbol fonts.

## 7. What exists today

- **Ebook PDFs** in `private-files/` (git-ignored) and in Cloudflare R2 (bucket `cosmic-members-files`,
  keys under `read-your-own-chart/`): a **digital** version (148 typing fields, named like
  `p16_cell_13`, `p17_box_6`), a **print** version and a plain version (no fields).
  Page size 595.92 × 842.88 pt. The PDFs were last written by pypdf, so the source is lost.
- **Site pages:** `/`, `/free` (Sender.net signup for the free workbook), `/workbook` (PDF
  download links served by `functions/api/workbook/[key].js`), `/privacy`.
- **Reference maths** in `daily-oracle-repo` (Python): Skyfield and the JPL DE440s file give
  planet positions; `src/astrology.py` has Ascendant and Whole Sign houses; `src/timezones.py`
  and `src/geocode.py` handle zones and places; `tests/fixtures/reference_charts.json` holds
  published reference charts. This repo is the **test oracle**. It is not shipped to the browser.

## 8. What the tool must compute (everything the worksheet pages ask for)

All items follow the ebook page given. Tropical zodiac, geocentric apparent positions.

**Page 16, "My chart"** (existing, unchanged layout)
- Name, birth date, birth place, birth time (the reader types name; the tool fills the rest).
- Big Three: Sun sign, Moon sign, Rising sign.
- Table: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, North Node,
  Chiron, Midheaven. Each row: sign, degree, house, retrograde mark (℞).
  Midheaven's house is printed as 10 and stays 10.
- Chart ruler (the planet that rules the Rising sign) with its sign and house. Pages 8-9 give Scorpio,
  Aquarius and Pisces an old and a modern ruler. The tool uses the old (traditional) ruler for the
  filled field and names the modern one beside it on screen. *Builder: confirm with the owner.*

**Page 17, "My chart, part 2"** (new)
- South Node, Black Moon Lilith, Part of Fortune, Vertex: sign, degree, house.
- Same typing-field style as page 16, with a larger sentence line per point.
- The page also shows a short "how to find it" line per point, using the page 13 wording.

**Page 18, "My balance & story"** (old page 17)
- Counts for fire, earth, air, water and for cardinal, fixed, mutable.
- Strongest and weakest element. Moon phase (the 8 phases on page 14).
- Three tightest aspects (planet A, aspect, planet B, orb). The "What it means for me" box stays empty.
- Patterns found (stellium, T-square, grand trine, grand cross, yod, kite), as a short list.
- Chart story box stays empty.

**On screen only (not in the PDF), same ebook words**
- Retrograde, aspects (major and minor), the 7-step reading order from page 6 as a checklist
  of facts (Big Three, chart ruler, balance, crowded areas, planets near the angles within about 5°,
  tightest aspects, lunar nodes). It states facts only; no interpretation text.
- A short "how this chart was made" panel: tropical zodiac, Whole Sign houses, mean node, mean Lilith.

### Conventions (the builder must apply these; items marked ◆ are the writer's own calls, owner may change them)

- ◆ **Elements and modes** count Sun to Saturn plus the Ascendant, so the numbers add up to 8,
  exactly as page 15 says. No Ascendant → they add up to 7, and the page says so.
  The page 15 tip "count Sun, Moon and Ascendant twice (total 11)" is offered as a switch, off by default.
- ◆ **Aspects** are computed between the 10 planets plus Ascendant and Midheaven. The "three tightest"
  list uses the five major aspects only. Minor aspects (page 12) show on screen.
- ◆ **Orbs:** page 12 gives ranges (for example conjunction 8–10°). Use the larger value when the
  Sun or Moon is involved, the smaller value otherwise. Shown to the reader.
- ◆ **Patterns** use the major-aspect orbs. T-square: one opposition plus two squares. Grand trine,
  grand cross, yod (two sextiles plus a quincunx), kite (grand trine plus an opposition to one corner,
  sextiles to the other two). Stellium: 3 or more planets in one sign (under Whole Sign this equals one house).
- ◆ **North Node:** mean node. **South Node:** exactly opposite. **Black Moon Lilith:** mean lunar apogee.
- ◆ **Part of Fortune:** Ascendant + Moon − Sun by day, Ascendant + Sun − Moon by night
  (day = Sun in houses 7–12).
- **Vertex:** the Ascendant formula for the colatitude, with the RAMC moved by 180°.
- **Retrograde:** decided by the planet's real motion. Sun and Moon never. The nodes get no ℞ mark.
- **Chiron:** needs data that DE440s lacks. Use JPL's public small-body data (asteroid 2060).
- **Houses:** Whole Sign. House 1 is the Ascendant's whole sign.
- **No birth time (page 15, tip 2):** use noon for planet positions; leave **houses, Rising, chart ruler,
  Midheaven, Vertex, Part of Fortune** blank; skip Ascendant in counts and aspects; and warn when the
  Moon changes sign that day (the Python repo already has this check).
- **Time:** local time plus place → UTC, using the correct historical offset and daylight saving.
  Ambiguous or non-existent local times (clock changes) are shown to the reader, with a choice.
  The reader may also type a UTC offset by hand.
- **Place:** search a city. The result carries latitude, longitude and the IANA time zone.
- **Polar latitudes** (about above 66°): the Ascendant can be undefined. Show a clear message.
- **Date range:** at least 1900–2100.

**Accuracy target:** every longitude within 0.01° (36 arc-seconds) of the DE440s result from the
Python oracle; Ascendant and Midheaven within 0.02°; sign and house identical.

## 9. The 2027 sky calendar

Same content as ebook page 18, as a web page.

- Per month: new moons, full moons (UTC minute, sign, degree), eclipses with type, and
  retrograde / direct stations with sign and degree.
- Shows every time in the reader's own time zone, detected automatically, with a city picker and
  correct summer time. The ebook's strip of city offsets is no longer needed on screen.
- "This month" view, the 12-month overview, and a "save to my calendar" file (`.ics`).
- ◆ The "My intention" column becomes a small note field per month, **saved only on the reader's device**.
- Every date is **recomputed from the JPL data**, then compared with the printed page 18.
  Any mismatch goes back to the owner. The owner decides which side is wrong and the ebook or the
  tool is fixed. The check output is kept in the repo.
- Eclipse types: lunar (penumbral, partial, total) and solar (partial, annular, total, hybrid),
  computed from geometry. Cross-check with NASA's eclipse tables.

## 10. Ebook v2

No source exists, so v2 is built from the current PDFs.

- **New page 17**, "My chart, part 2", in the same design as page 16 (same header badge style,
  fonts, colours, table look, footer). It is full-size and easy to write in (owner chose the larger page).
- **Renumber**: old pages 17, 18, 19 become 18, 19, 20. Fix the footer numbers, the contents
  (page 3), and **every in-text page reference** in the whole book (pages 2, 4, 5, 6, 7, 15 and any
  other; the builder must scan all text for "page", "pages" and "p."). Add the new page to the contents.
- **Update text that the tool replaces:** page 2 step 2 ("any free birth chart website… pick Placidus
  or Whole Sign") and page 15 ("a free website (page 2)") must point to the tool at
  `cosmicuniversum.com/tools` and say Whole Sign. Owner approves the exact wording first.
- **Form fields:** the digital version keeps its fields; add fields for the new page; keep names
  stable and listed in one mapping file (field → data item) used by the tool.
- **Three versions:** digital, print, plain. Only digital and print are on the site today.
- **Visual check:** unchanged pages must look identical. Render the old and new PDFs and compare.
- Page 18's footer note about its source ("Swiss Ephemeris") is the owner's to keep or reword.

## 11. How the reader uses the tool (flow)

1. Open `/tools`. Two cards: "Chart worksheet" and "2027 sky calendar".
2. Chart tool: type name (optional), date, time (or "I don't know my birth time"), place. Pick the city.
3. See the chart facts on screen in ebook words, with the page-16 Big Three first.
4. Button "Get my worksheet pages": downloads **pages 16, 17 and 18 of ebook v2** (My chart, My chart part 2,
   My balance & story), cut from the digital PDF and filled through its form fields. The fields stay
   editable, so the reader can type their sentences in Acrobat, Preview or a phone PDF app.
   A second button gives a **print version** of the same three pages with the values drawn into the
   page (not fields) and the writing lines left blank. It is a separate file, not the full print ebook.
5. A short note: "Your birth details never leave this device."

## 12. Parts the builder decides

- How planet positions reach the browser: precomputed tables made from DE440s (for example Chebyshev
  coefficients, few MB, loaded only when needed) or a published analytic series. Must meet the accuracy target.
- The city search data and where it lives (a bundled file or a small function). The data's licence
  must allow this use. Attribution if the licence needs it.
- The PDF library (must be permissive, self-hosted).
- The tool's page structure, build tooling, tests, file layout.
- How to rebuild or patch the PDF pages (redraw versus edit), as long as the visual check passes.

## 13. Verification

- A script in the Python repo writes expected results for a wide set of charts: dates across
  1900–2100, both hemispheres, high latitudes, daylight-saving edges, no-birth-time cases.
  The browser code is tested against it with the tolerances above.
- The existing published reference charts are re-used and extended.
- Calendar: compare all of 2027 to printed page 18 and to NASA eclipse tables.
- Filled PDFs: automated test fills a known chart, renders the page and checks key values by reading the
  fields back; owner reviews one printed sample.
- Accessibility and mobile: tools usable on a phone, keyboard friendly, readable contrast.

## 14. Rollout

1. Build tools on a Cloudflare preview deployment first. Nothing public until the owner approves.
2. Show the owner the new PDFs. Owner approves wording and layout.
3. **Back up the current PDFs in R2** under their old keys with a version suffix, then upload the new
   ones. The live email download changes for everyone at that moment.
4. Deploy `/tools`, update `/` to link to it, update the privacy page.

## 15. Open points for the owner (the builder check may add more)

- Approve the conventions marked ◆ in section 8 and 9.
- Approve the wording changes on ebook pages 2 and 15.
- Confirm the plain (no-fields) PDF version is still wanted.

## 16. Calls made after the builder check (writer's calls, owner may change them)

- **Output pages:** exactly pages 16, 17, 18 of v2 (see section 11). Two files: editable and print.
- **Field mapping:** the builder reverse-engineers it from the PDF (field names, positions, page) and keeps
  it in one mapping file with a test. No reference spec exists. The new page 17 is **redrawn** in the
  ebook's own fonts and style, and added to the PDF, not patched in by hand.
- **Wording changes (pages 2, 15, and the new page 17 text):** the builder uses placeholder wording and
  sends it to the owner for approval. Approval is needed before release, not before work starts.
- **Conventions marked ◆:** final for the build. They live in one config file shared by the browser code
  and the Python oracle script, so changing one later is a config change plus a re-run of the oracle.
- **Download budget:** the chart tool loads at most about 5 MB on first use (lazy-loaded, gzip).
  Cloudflare Pages' 25 MiB single-file limit is not a concern at that size.
- **City search:** bundled data served from the site itself. **No third-party geocoder.** Sending a city
  name to an outside service would count as sending birth data, which the privacy rule forbids.
- **Deploys:** Claude runs the Cloudflare preview deploys with the owner's logged-in `wrangler`.
  Claude does not touch the live R2 bucket or the live site until the owner says so for that step.
- **Calendar mismatches:** if the owner decides a printed date on page 18 is wrong, the correction ships
  in this v2 release, not a later one.
