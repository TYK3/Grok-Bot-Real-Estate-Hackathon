# Ground Truth: demo video rundown

**Length:** 4 min 51 s · 1920×1080 · 30 fps · narrated, with sound effects
**Output:** `out/ground-truth-demo.mp4` · **Source:** `src/` (Remotion) · **Narration:** `voice/lines.json`

## The use case

One home, **Kelso Villa**, goes through the whole product. The video follows two people:

- **An agency reviewer** gets three documents that disagree. The April brochure says £700,000 and 6 parking spaces, the October brochure says £600,000, and the measured survey says 5 spaces. The reviewer has to publish one correct record.
- **A renter or buyer** browses homes, asks Haven (the Grok voice agent) about Kelso Villa, searches by what is nearby and books a viewing. They never hear a disputed number.

## Voices

Free Microsoft Edge neural voices, generated with `edge-tts` (no account needed):

| Role | Voice | Notes |
|---|---|---|
| Narrator | `en-US-AvaNeural` | Soft, friendly, caring. Rate −3% |
| Haven | `en-GB-SoniaNeural` | The agent's lines in the call, search and booking scenes |
| Caller | `en-GB-RyanNeural` | The renter's questions |

## Scenes

| # | Time | Scene | What's on screen | Product feature |
|---|---|---|---|---|
| 1 | 0:00 | Hook | Three documents land; each conflicting value lights up as it is spoken | The problem |
| 2 | 0:20 | Problem | A generic chatbot answers "£700,000, with 6 parking spaces"; both are struck out, "Source: ?" | Why it matters |
| 3 | 0:31 | Reveal | Ground Truth mark over the landing page: "Every property fact, with its receipt"; the agency and renter sides | Brand |
| 4 | 0:48 | Part 01 | "The agency checks the facts" | |
| 5 | 0:50 | Upload | Three PDFs dropped into `/review`; scanned pages read with OCR in the browser | Upload, OCR, extraction |
| 6 | 1:03 | Compare | 78 facts, 10 differences, 6 that need a person; zoom to £600,000 vs £700,000 with page quotes | Evidence |
| 7 | 1:25 | Classify | Four kinds of disagreement: update, true conflict (parking), document error (185 sq m vs 2,700 sq ft), official record (EPC B vs C) | Classification |
| 8 | 1:51 | Decide | The engine recommends October's price; a person clicks Confirm; "Confirmed by a person" stamp | Human in the loop |
| 9 | 2:09 | Changelog | `/facts`: versioned record in Supabase, parking still being checked, price corrected with who checked it | Published record |
| 10 | 2:27 | Pipeline | Documents → extract and review → one record → listing site and Haven | Architecture |
| 11 | 2:37 | Part 02 | "The renter gets straight answers" | |
| 12 | 2:40 | Explore | 58 homes, filters and a live map | Browse |
| 13 | 2:50 | Property | Kelso Villa's verified facts; tap the price to see its source; parking "Under review" | Verified-only listing |
| 14 | 3:05 | Call | Acted call: Haven won't give a parking number, then gives the price with its document, date and page | Grok voice agent with citations |
| 15 | 3:44 | Nearby | "A 2-bed near a park, under £2,500 a month"; results ranked by walking time on the map | OpenStreetMap amenity search |
| 16 | 4:01 | Book | `/market` KPIs; a viewing booked by voice lands in Booked viewings | Bookings, market dashboard |
| 17 | 4:21 | Results | Measured: safe parking answer, cited price, 2–6 ms search, 1.7–3.5 s replies | Proof |
| 18 | 4:37 | Claim | "If the documents disagree, nobody says it out loud. Not until a person has checked." | The one idea |
| 19 | 4:45 | End card | Mark, wordmark, tagline, three promises, hackathon credit | |

## What is real and what is illustrative

- **Real:**
  - Every product screen is a screenshot of the running app (`localhost:3000`, captured 13 Nov 2026), including the review workbench loaded with `fact_record/contracts/01_extracted.json`.
  - Every document value, date and page comes from `fact_record/sample_data` and the README. The numbers in the Results scene are from the README's "Measured results" table.
- **Illustrative:**
  - The call in scene 14 is acted out with synthetic voices, and it is labelled "Dramatised call". Haven's answers are the documented answers from the README.
  - The spoken booking and the booked-viewing card in scene 16 are marked "example".
  - The three documents in scene 1 are simplified drawings that carry the real values.
  - The source popover in scene 13 is drawn over the screenshot.
  - On the Haven page, the header comes from a fresh capture and the results list from the earlier one, because the list animates in.

## Editing

```bash
cd demo-video
python voice/edge.py             # re-voice changed lines (pip install edge-tts first)
npm run dev                      # Remotion Studio: scrub and preview
npx remotion render GroundTruthDemo out/ground-truth-demo.mp4
```

- **Narration:** edit the text in `voice/lines.json`, then re-run `voice/edge.py`. Scene lengths and every animation cue follow the new timing automatically, because scenes cue on spoken words (for example `at("parking")`). Unchanged lines are reused.
- **ElevenLabs:** to use it instead, put `ELEVENLABS_API_KEY` in `.env` and run `node voice/tts.mjs`. It uses the `voices` block in `lines.json`.
- **Visuals:** the copy and visuals are in `src/scenes/*.tsx`. Brand colours and fonts are in `src/theme.ts`.
