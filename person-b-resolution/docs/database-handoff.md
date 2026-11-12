# Database handoff contract — Person B → ingestion engineer

The **Export for database** button produces `property-facts-database-handoff.json` using
[`schema/database_handoff.schema.json`](../schema/database_handoff.schema.json). The
reproducible illustrated example is
[`examples/database-handoff.example.json`](../examples/database-handoff.example.json).
Run `npm run example:handoff` to regenerate it from the nine scenarios.

The UI also offers **Export full review archive** under the extra actions menu. That
archive is intentionally more verbose and follows the existing
`verified_record.schema.json`; it is **not** the compact ingestion contract.

## Contract / non-negotiable ingestion rule

`schema_version = "1.0"` and `payload_type = "property_fact_reconciliation"`.
All arrays may contain facts for **more than one property**. Ingest by `property_id`
per row — do not assume the property chosen in the UI is the export scope.

| Payload collection | Destination | Rules |
|---|---|---|
| `properties` | `properties` | Stable property ID; upsert metadata only |
| `source_documents` | `source_documents` | Stable `document_id`; store original document independently |
| `extracted_evidence` | `extracted_evidence` | Append-only original claims, page, quote, units, scope/basis. Unique `evidence_id` |
| `accepted_facts` | `property_fact_versions`, then current-fact projection | **Only** collection allowed to populate canonical single-value property facts. Unique `record_id`, monotonic `version` per `case_key` |
| `context_facts[].claims` | `scoped_claims` | Preserve each claim as written. Do **not** collapse into a property-level value; `publishable_as_single_fact=false` |
| `unresolved_cases` | `reconciliation_exceptions` | Reconciliation queue; `publishable=false`. Do **not** publish `proposed_value` |
| `audit_events` | `fact_review_events` | Append-only action trail. Unique `event_id`; `actor` and `occurred_at` are untrusted in current browser demo |

`batch_id` is optional in the standalone demo. In production, the ingestion
service should assign a trusted batch UUID (or verify a server-issued one).
Stable `record_id = <property_id>::<field>::v<version>` makes re-imports
idempotent. `case_key = <property_id>::<field>` allows the current canonical
projection to choose the highest accepted version. Keep the entire version
history; do not overwrite it.

## Example scenario result

The sample generator simulates **five fictional human approvals** while leaving
the April combined total row unresolved. Every simulated approval is labelled
`"Example Reviewer (fictional)"` and the payload has `example_only: true`.
The source quotations are user-supplied scenario summaries, not verified page
citations; the synthetic survey/instruction/schedule are also not independent
source evidence. **This example must never be imported into production.**

| Property | Field | In example | Value / disposition |
|---|---|---|---|
| Kelso Villa | Asking price | `accepted_facts` | £600,000 from October brochure |
| Kelso Villa | Net area | `accepted_facts` | 1,912 sq ft (177.63 sq m), net, illustrative survey |
| Kelso Villa | Gross area | `accepted_facts` | 2,672 sq ft (248.24 sq m), gross, illustrative survey |
| Kelso Villa | Total parking | `accepted_facts` | 5 spaces, illustrative survey |
| Kelso Villa | April combined floor-area row | `unresolved_cases` | 185 sq m paired incorrectly with 2,700 sq ft; blocked |
| Kelso Villa | Per-floor vs total parking | `context_facts` | 1 per floor and 6 total, separate scope |
| Kelso Villa | Lower-ground measurement | `context_facts` | 468 sq ft unknown basis and 461 sq ft net, separate basis |
| 59 St Huberts Close | Asking price | `accepted_facts` | £1,395,000 effective 9 Nov, illustrative instruction |
| 59 St Huberts Close | En-suite statements | `context_facts` | Development-level and unit-level claims remain separate |

Example of **one accepted fact** (other arrays carry referenced documents,
extracted evidence and the full audit):

```json
{
  "record_id": "kelso-villa::price::v1",
  "case_key": "kelso-villa::price",
  "property_id": "kelso-villa",
  "field": "price",
  "value": 600000,
  "unit": "GBP",
  "currency": "GBP",
  "classification": "SUPERSEDED",
  "source_document_id": "kv-oct",
  "source_evidence_id": "kelso-price__kv-oct__2",
  "related_evidence_ids": [
    "kelso-price__kv-apr__1",
    "kelso-price__kv-oct__2"
  ],
  "decision": {
    "action": "accept",
    "accepted_by": "Example Reviewer (fictional)",
    "accepted_at": "2026-11-12T20:50:00.000Z",
    "reason": "ILLUSTRATIVE: October brochure supersedes the April asking price. Evidence needs genuine PDF verification.",
    "trust_level": "browser_local_unverified"
  },
  "version": 1
}
```

## Minimal ingestion algorithm

1. Parse the JSON; validate `schema_version` and JSON Schema before any writes.
   Reject `example_only=true` in production and quarantine invalid payloads.
2. Use a transaction. Upsert `properties`, `source_documents`, then immutable
   `extracted_evidence`. Preserve both original and converted area values;
   do not infer net or gross when `area_basis=null`.
3. Insert `audit_events` with idempotent keys. In a real service, **replace**
   client-supplied reviewer/timestamp assertions with authenticated reviewer
   identity and server-issued timestamps; retain the submitted values as
   untrusted input metadata if necessary.
4. Validate that every accepted fact references existing evidence (except
   explicit manual edits, for which `source_evidence_id=null` and a supported
   correction process is required). Insert `accepted_facts` append-only into
   versioned storage. Materialise the highest **approved** version for
   `(property_id, field)`; never publish an unresolved proposal.
5. Store `context_facts[].claims` as separate scoped evidence. Avoid inserting
   a whole-development claim as a unit fact, or an unlabelled area as net/gross.
6. Upsert `unresolved_cases` into the human-review queue and preserve document
   errors. Reject any attempt to treat `proposed_value` as an accepted fact.
7. Commit and return ingestion counts, rejected keys and authoritative server
   review IDs. Repeated imports with identical `record_id` and content should
   not create duplicate fact versions.

## Production gates

This is a browser-local prototype. User-entered reviewer names can be forged,
client clocks can drift, and the demo has no signed review token or durable
server-side evidence archive. Production ingestion should require authentication,
trusted append-only audit storage, source-document checksums, and evidence
validation (including real PDF page numbers/quotes) before accepting claims.
Do not assume the example's generated dates are actual human decisions.
