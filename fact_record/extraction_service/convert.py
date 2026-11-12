"""Convert extractor output (facts.jsonl / documents.jsonl / contradictions.jsonl)
into the workbench input contract: conflict-resolution-ui/schema/extracted_fact.schema.json.

Each fact keeps its provenance (doc, page, verbatim quote) and carries
source.file_name so the UI can attach it to the uploaded PDF for page previews.
"""
from __future__ import annotations

import json
import os

PROPERTY = {
    "kelso-villa-ba1-3au": ("kelso-villa", "Kelso Villa, Upper Bristol Road, Bath BA1 3AU"),
    "st-huberts-close-gerrards-cross": ("st-huberts-close", "St Huberts Close, Gerrards Cross"),
}
DOC_TYPE = {"particulars": "brochure", "brochure": "brochure"}
UNIT = {"sq_ft": "sqft", "sq_m": "sqm"}
BASIS = {"NIA": "net", "GIA": "gross"}


def _read_jsonl(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(l) for l in f if l.strip()]


def _value(field, v):
    if not isinstance(v, dict):
        return v, None
    if "amount" in v:
        return v["amount"], UNIT.get(v.get("unit"), v.get("unit") or v.get("currency"))
    for k in ("count", "spaces", "tenure", "band", "grade", "status", "type", "text"):
        if k in v:
            return v[k], None
    return json.dumps(v, sort_keys=True), None


def convert_fact(f, doc):
    dev = f.get("development_id") or (doc or {}).get("development_id") or "unknown"
    pid, pname = PROPERTY.get(dev, (dev, (doc or {}).get("development_name") or dev))
    q = f.get("qualifier") or {}
    field = f["field"]
    value, unit = _value(field, f.get("value"))
    basis = BASIS.get(q.get("basis"))
    unit_part = (f.get("unit_id") or "").split(":", 1)[-1] or None
    plot = unit_part
    scope = str(q.get("scope") or "")
    if scope.startswith("part:"):
        plot = f"{plot}-{scope[5:]}"
    if q.get("room"):
        plot = f"{plot}-{q['room']}"
    if field == "floor_area" and q.get("basis") == "EPC":
        field = "epc_floor_area"
    file_name = os.path.basename((doc or {}).get("file_uri") or f["doc_id"])
    out = {
        "fact_id": f["fact_id"],
        "property_id": pid,
        "property_name": pname,
        "field": field,
        "value": value,
        "unit": unit,
        "area_basis": basis,
        "scope": "development" if f.get("scope") == "development" else "unit",
        "plot": plot,
        "source": {
            "doc_id": f["doc_id"],
            "file_name": file_name,
            "doc_type": DOC_TYPE.get((doc or {}).get("doc_type"), (doc or {}).get("doc_type") or "brochure"),
            "title": file_name,
            "published_date": f.get("as_at") or (doc or {}).get("doc_date"),
            "agent": (doc or {}).get("issuer_org"),
            "issuer": (doc or {}).get("issuer_org"),
            "synthetic": (doc or {}).get("source") == "synthetic",
            "authority_tier": f.get("authority_tier"),
        },
        "page": f.get("page"),
        "quote": f.get("quote"),
        "extraction_confidence": f.get("confidence"),
        "entity_match_confidence": 1.0,
        "qualifier": q,
        "value_raw": f.get("value_raw"),
    }
    if f.get("doc_error"):
        out["doc_error"] = True
    return out


def convert(facts, documents, contradictions=None, label="Extractor output"):
    docs = {d["doc_id"]: d for d in documents}
    out_docs = []
    for d in documents:
        fn = os.path.basename(d.get("file_uri") or d["doc_id"])
        out_docs.append({
            "doc_id": d["doc_id"], "name": fn, "file_name": fn, "sha256": d.get("sha256"),
            "kind": "pdf", "doc_type": DOC_TYPE.get(d.get("doc_type"), d.get("doc_type")),
            "title": fn, "published_date": d.get("doc_date"), "issuer": d.get("issuer_org"),
            "page_count": d.get("page_count"),
            "property_ids": [PROPERTY.get(d.get("development_id"), (d.get("development_id"),))[0]],
            "authority_tier": d.get("authority_tier"),
        })
    return {
        "label": label,
        "generated_by": "fact_record/extraction (rules + OCR)",
        "facts": [convert_fact(f, docs.get(f["doc_id"])) for f in facts],
        "documents": out_docs,
        "extractor_contradictions": contradictions or [],
    }


def convert_dir(out_dir, label="Extractor output"):
    return convert(
        _read_jsonl(os.path.join(out_dir, "facts.jsonl")),
        _read_jsonl(os.path.join(out_dir, "documents.jsonl")),
        _read_jsonl(os.path.join(out_dir, "contradictions.jsonl")),
        label,
    )


if __name__ == "__main__":
    import sys
    json.dump(convert_dir(sys.argv[1], sys.argv[3] if len(sys.argv) > 3 else "Extractor output"),
              open(sys.argv[2], "w"), indent=1, ensure_ascii=False)
