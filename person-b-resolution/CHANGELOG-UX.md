# Person B — UX and rules refresh

- Replaced dense review controls with a clear three-step, three-column interface: queue, two evidence cards, guided decision.
- Added simple progress counters and the All / Review / Auto / Approved queue filters.
- Auto-selects the strongest source but requires human approval of newer price changes and true conflicts.
- Auto-retains scope and measurement-basis differences as **context-only records** rather than publishing an unsafe scalar.
- Detects mixed net/gross totals as a document error, blocking direct acceptance of that total.
- Preserves page/quote evidence, file ingestion, original extraction, manual correction, local reviewer audit and exports.
- Added seven Kelso Villa and two 59 St Huberts Close worked review cases from the user's supplied descriptions (not independently validated PDF extracts).
- Added 11 scenario-specific tests on top of the original 26 tests.

## Known limitation

This is a browser-only prototype. Authentication, authoritative timestamps, durable signed audit history, verified PDF text alignment and production storage require backend integration. The automated Chromium screenshot check was unavailable in this execution environment, so no visual browser QA is claimed.
