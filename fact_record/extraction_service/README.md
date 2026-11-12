# Extraction service

`python fact_record/extraction_service/server.py` runs a local HTTP service on :8765 for the conflict-resolution workbench. `POST /extract` takes multipart PDFs (`files`) and returns facts in `conflict-resolution-ui/schema/extracted_fact.schema.json` format, with `documents[]` keyed by filename and sha256. CORS is open.

Requirements: `pip install -r fact_record/requirements.txt` and the `tesseract` binary on PATH. Env: `EXTRACTOR_PORT` (8765), `EXTRACTOR_MODE` (auto|rules|llm|hybrid), `EXTRACTOR_CACHE`.

`convert.py` converts extractor output (`facts.jsonl`, `documents.jsonl`, `contradictions.jsonl`) into the workbench schema.
