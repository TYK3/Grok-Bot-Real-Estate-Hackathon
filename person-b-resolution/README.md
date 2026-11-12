# Fact Reconciliation Workbench (Person B)

Person B’s deliverable for the Grok Bot Real Estate hackathon. A **desktop-first, evidence-first** workbench that:

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

Open `index.html` via a local server. Three-panel layout:

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
