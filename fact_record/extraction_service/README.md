# Extraction service

`python fact_record/extraction_service/server.py` runs a local HTTP service on :8765 for the conflict-resolution workbench. `POST /extract` takes multipart PDFs (`files`) and returns facts in `conflict-resolution-ui/schema/extracted_fact.schema.json` format, with `documents[]` keyed by filename and sha256. CORS is open.

Requirements: `pip install -r fact_record/requirements.txt` and the `tesseract` binary on PATH. Env: `EXTRACTOR_PORT` (8765), `EXTRACTOR_MODE` (auto|rules|llm|hybrid), `EXTRACTOR_CACHE`.

`convert.py` converts extractor output (`facts.jsonl`, `documents.jsonl`, `contradictions.jsonl`) into the workbench schema.

## Supabase

Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (in the environment or the repo-root `.env`) after applying `supabase/migrations/20261112000000_fact_record.sql` to your project (SQL editor, or `supabase db push`). Then:

- `POST /extract` also saves the documents, extracted facts and the parser's own contradictions (`extractor_contradictions`, status `open`). The response carries the result under `supabase`; a database error never fails extraction.
- `POST /handoff` takes the workbench's database handoff JSON (the **Save to Supabase** button) and writes it in one transaction via `ingest_fact_handoff`: evidence and audit events are append-only, accepted facts go to `property_fact_versions` (read the current values from `current_property_facts`), context claims go to `scoped_claims`, and open cases go to `reconciliation_exceptions`. Accepted facts whose `record_id` is already stored with different content are rejected and listed in `rejected`.
- `example_only` handoffs (the bundled sample datasets) are rejected unless `SUPABASE_ALLOW_EXAMPLE=true`.
- `python fact_record/extraction_service/supabase_sink.py <file.json>` pushes a saved extraction or handoff file.

Public (anon) read is limited to `properties`, `source_documents`, `property_fact_versions` and `scoped_claims`; everything else is service-role only.
