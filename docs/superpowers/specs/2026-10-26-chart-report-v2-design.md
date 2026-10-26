# Paid chart report V2: design

Date: 2026-10-26. Source: owner notes after reading V1 as a customer (`birth_chart_service_notatki.txt`, not committed) and the decisions in the 2026-10-26 session.

## Product decisions
- The report is the paid product. The ebook and the chart tool are free hooks. A buyer never needs the ebook.
- The report must give clearly more than "free tool + free ebook". The new value is the answer to "why am I like this".
- `tools/report/library.json` is the report's own closed meaning list. New, deeper meanings live only there (not in the free ebook). Core meanings stay the same as the ebook, so the two products never contradict.
- The report never names the ebook or "Read Your Own Chart" as its source.
- Platform rule (Gumroad): reflection, not prediction. No "you will", no guaranteed outcomes, no advice. Sell it as a personal report, not as AI access.
- The shop (order form, Gumroad, ping, email, delete) is a SEPARATE plan, after V2.

## V2 changes (from the owner's notes)
1. **New chapter "Why you are like this"**, right after "Start here". 7 questions, each with a heading, 3 to 6 sentences, and a small "From your chart:" line made by code from the cited facts:
   1. `why.who`: Who am I, and who am I growing into?
   2. `why.drives`: What drives me?
   3. `why.likes`: What do I like, and what pulls me in?
   4. `why.dislikes`: What do I not like?
   5. `why.drains`: What makes me feel bad? (what around me lowers my mood or breaks my plans)
   6. `why.needs`: What do I need around me to feel good, fulfilled and safe?
   7. `why.approach`: How do I approach life, and how do others first see me?
2. **New library meanings** (written by Claude, approved by the owner before use): per sign `drives`, `likes`, `dislikes`, `drains`, `needs`; per house `pulls`; per planet and point `short` (2 to 4 words for filled aspect sentences); per aspect `readAsYou`; `nextSteps.saturnReturn.practical`.
3. **Chart ruler**: code prints a step-by-step explanation (every sign has a boss planet; your Rising sign; its boss; where it sits). No "modern ruler" line.
4. **Red lines**: the wheel legend says what a clash is. A new box "Where you pull two ways" lists each red line as a filled sentence, with a short writer section `clash`.
5. **Bigger font**: body 12 pt, tables 10.5 pt, small text 9.5 pt.
6. **Aspect table**: the "what it means" column is filled with the planet words ("Sun (who you are) helps Mars (your energy) when you make the effort."). The explanation goes above the table.
7. **Saturn return**: the engine computes the real date windows. The report prints them (code), adds a practical meaning (library) and a reflection question (writer). Past returns get a look-back question, future ones a "may" sentence.
8. **Remove** "What to try next" (transits, synastry, progressions) and "Transit" from the glossary.

## Not in V2
- Writer-marked paragraph breaks (still 2 sentences per paragraph).
- Shop, payment, delivery, deletion.
