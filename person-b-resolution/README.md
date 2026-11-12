# Fact Review — Person B (simplified interface)

## Quick start

```bash
npm test                 # 37 checks, including all nine review scenarios
npm run serve            # visit http://localhost:8080
```

The default home screen loads **Kelso Villa** and its seven worked comparisons. Select **59 St Huberts Close** in the property picker to see the other two. A three-column interface makes the job simple: **Choose a difference → Compare two source quotes/pages → Confirm or hold**. Source library, classification overrides, and audit history are tucked away until needed.

The nine demo comparisons, in the user's stated order:

| Case | Rule suggestion | Publication safety |
|---|---|---|
| Kelso asking price | Newer October £600,000 guide supersedes April £700,000 offers | Candidate selected automatically; reviewer confirms |
| Kelso total area | April 185 sq m / 2,700 sq ft combined row is a **document error** | Cannot approve the printed value; correct with evidence or hold |
| Kelso parking wording | One space per floor vs six spaces total = different scopes | Keep both automatically; no single value published |
| Kelso net floor area | October 1,990 sq ft vs survey 1,912 sq ft = **true conflict** | Survey suggested by higher authority; reviewer confirms |
| Kelso gross floor area | October 2,700 sq ft vs survey 2,672 sq ft = **true conflict** | Survey suggested; reviewer confirms (same-unit difference is not ignored by 2% conversion tolerance) |
| Kelso lower ground | Brochure 468 sq ft unknown basis vs survey 461 sq ft **net** | Preserve both automatically; never infer missing basis |
| Kelso parking total | Six vs five spaces = **true conflict** | Survey says bay six is a bin store; reviewer confirms |
| No. 59 asking price | Formal instruction £1,395,000 effective 9 Nov replaces brochure £1,458,000 | Higher-authority instruction suggested; reviewer confirms |
| No. 59 en-suites | Development-wide schedule vs No. 59 unit brochure = different scopes | Keep both automatically; development-wide claim never becomes a unit fact |

**Automatic rules:** Source tier takes precedence over recency; date breaks ties within a tier. A later higher-authority formal price instruction can replace a brochure. Safe scope/basis differences are automatically labelled and retained without inventing a single value. True conflicts, document errors and price changes are **not** auto-published. The handoff separates `accepted_facts`, `blocked_facts` and `context_facts`.

**Source integrity:** This default dataset is a **worked scenario**, not independently validated source PDFs. The user's descriptions are explicitly marked as scenario summaries, with unknown page references left blank. Upload Person A's extracted JSON and PDF files to review actual evidence. Real uploads replace the demo set, not mix with it.

**Security limitation:** This is a local, dependency-free browser prototype. Reviewer names and acceptance times are saved locally, with timestamps from the browser clock; they are **not authenticated, server-issued or tamper-proof**. Add an authenticated service and trusted audit storage before production use. Keep `context_facts` out of any voice agent's publishable facts. Source PDFs render only when their file is available; highlighted quotation text works without the optional PDF.js CDN.

---

## Original engine and integration notes


Original Person B implementation, extended with the nine-scenario review. A **desktop-first, evidence-first** workbench that:

1. **Ingests** multiple document types — JSON extractions facts, PDF particulars, ZIP archives (including nested members), CSV/TSV listing rows, and plain-text evidence
2. **Organises** related documents into property groups and version families (same issuer + doc type, brochure revisions, etc.)
3. **Classifies** every difference with the product-spec taxonomy (true conflict, newer version, unit/net–gross mismatch, out-of-date listing, official-record disagreement, plus scope / plot / unmatched)
4. Lets a reviewer **compare highlighted evidence side by side**, confirm the classification, choose a winning source, and **approve or escalate**
5. Publishes an **immutable verified fact record** (and a separate blocked/exception queue) without overwriting Person A’s raw extracts

Shared engines: `src/resolve.js` (contradictions) and `src/ingest.js` (multi-format ingest). Zero npm dependencies.

Aligned with [`docs/verified-fact-record-product-spec.pdf`](docs/verified-fact-record-product-spec.pdf).

**Kelso Villa test cases (product spec):**

| Field | Classification | Status before sign-off | Voice |
|---|---|---|---|
| **Price** | `SUPERSEDED` (newer brochure version) | **pending** | Do not quote until verified |
| **Net floor area** | `UNIT_MISMATCH` (conversion / basis) | **pending** | Do not give a single unlabelled area |
| **Tenure** | `TRUE_CONFLICT` (listing rows disagree) | **conflicting** | Must not quote either value |

Classified ≠ verified. Tenure can be classified correctly and still **blocked** from publication until an official title check.

---

## How to run

```bash
# Tests (Node 18+)
node --test test/*.test.js
# or: npm test

# Resolve one or many inputs
node src/cli.js data/kelso_villa.example.json > resolved.json
node src/cli.js data/kelso_villa.example.json data/listings.sample.csv --summary -o verified.json
node src/cli.js path/to/person-a.json path/to/brochures.zip -o verified.json

# Workbench UI
python3 -m http.server 8080
# open http://localhost:8080/
# optional: ?data=data/kelso_villa.bundle.example.json
```

CLI flags: `-o FILE`, `--rules config/field_rules.json`, `--as-of YYYY-MM-DD`, `--summary`, `--decision-order`.

---

## Fact Reconciliation Workbench

Open `index.html` via a local server. Three-panel layout (simplified interface supersedes the earlier screen):

| Panel | Role |
|---|---|
| **Fields to review** + **Source library** | Discrepancy queue (Review / Extracted / Reconcile / Verified stages) and organised document families |
| **Source evidence** | Side-by-side evidence panes — PDF page (when uploaded) + highlighted quotation. Swap panes. Click a value / doc to focus its evidence |
| **Resolution** | Engine-suggested classification among the five reviewer types, winning-source picker, reason, Approve / Correct / Escalate. Audit trail + voice-agent contract |

**Principle:** never decide without seeing the evidence that supports it.

### Ingest (adaptive — not a fixed Kelso flow)

- **Ingest files** or drag-and-drop: `.json`, `.pdf`, `.zip`, `.csv`/`.tsv`, `.txt`
- ZIP members are expanded recursively (JSON facts, PDFs, CSVs inside)
- PDFs join the source library and render in the evidence pane when uploaded locally
- JSON may be Person A’s `{ facts: [...] }` or a bundle with `documents: [...]`
- CSV listing rows become facts; text `field: value` lines are accepted
- Works for any property set — property selector and document groups scale with the ingest

### Reviewer actions

1. Person A (or a ZIP pack) submits extracted facts + documents  
2. Engine groups, normalises, and opens review cases with suggested classifications  
3. Person B inspects highlighted evidence, confirms classification, picks source or corrects value  
4. **Approve** writes reviewer id, timestamp, rationale, rule id, evidence ids → status `verified`  
5. **Escalate** keeps the field blocked / conflicting → exception queue  
6. **Export verified record** / **Export blocked** for downstream stages  

Downstream acceptance row (also in `accepted_facts[]` on the export):

```json
{
  "property_id": "kelso-villa",
  "field": "tenure",
  "classification": "TRUE_CONFLICT",
  "accepted_value": null,
  "winning_fact_id": null,
  "source_evidence_ids": ["carterjonas-98889981", "carterjonas-f8692efa"],
  "rule_id": "…",
  "reason": "Listing rows disagree; needs official title check.",
  "accepted_by": "jigar",
  "accepted_at": "2026-11-12T21:01:00.000Z",
  "status": "blocked",
  "version": 0
}
```

---

## Input contract (Person A → Person B)

Schema: [`schema/extracted_fact.schema.json`](schema/extracted_fact.schema.json).

Hand over JSON that is **either** an array of facts **or** `{ "facts": [ … ] }` (optional `documents` library). The loader tolerates missing optional fields and aliases.

Each fact should look like:

```json
{
  "property_id": "kelso-villa",
  "property_name": "Kelso Villa, Upper Bristol Road, Bath BA1 3AU",
  "field": "price",
  "value": 600000,
  "unit": "GBP",
  "source": {
    "doc_id": "20020159",
    "doc_type": "brochure",
    "title": "Carter Jonas particulars — Kelso Villa (October 2026)",
    "published_date": "2026-10-16",
    "issuer": "Carter Jonas"
  },
  "page": 2,
  "quote": "£600,000 Guide Price…",
  "extraction_confidence": 0.97,
  "entity_match_confidence": 1.0
}
```

Core fields: `price`, `tenure`, `net_floor_area`, `gross_floor_area`, `energy_rating`, `parking` (aliases accepted). Keep **sq ft / sq m** and **net / gross** as separate facts. Recency is a **within-tier** tie-breaker — a newer brochure never beats a higher authority tier.

---

## Classification rules (product spec)

First matching rule wins inside a property+field group:

| Type | Meaning |
|---|---|
| **True conflict** | Same unit/field/basis; values cannot both be right |
| **Newer version** (`SUPERSEDED`) | Later same-issuer, same-type document replaces earlier |
| **Unit / net–gross mismatch** | Conversion or basis difference; may be a document error |
| **Out-of-date listing** (`STALE_LISTING`) | Portal/CRM lag vs higher-tier document |
| **Official-record disagreement** | Marketing vs Land Registry / EPC — mark **check this**, never auto-correct |
| Scope / plot-or-type / unmatched | Not mergeable or not confidently joined — no false conflict |

Source-authority hierarchy (highest first): signed legal → official register → signed spec/survey → signed price list → brochure/particulars → listing/CRM/verbal. Config: [`config/field_rules.json`](config/field_rules.json).

Statuses: **verified** (quotable) · **pending** · **conflicting** · **unknown**. Voice agent quotes only **verified**.

---

## Project layout

```
config/field_rules.json
data/kelso_villa.example.json          Spec-aligned Kelso facts
data/kelso_villa.bundle.example.json   Facts + document library
data/edge_cases.example.json           Lumley House, unmatched joins, …
data/listings.sample.csv               CSV ingest sample
docs/verified-fact-record-product-spec.pdf
schema/extracted_fact.schema.json
schema/verified_record.schema.json     Includes accepted_facts / blocked_facts
src/resolve.js                         Contradiction engine
src/ingest.js                          Multi-document ingest + organisation
src/cli.js                             Multi-input CLI
test/*.test.js
index.html, ui/app.css, ui/app.js      Workbench UI
```
