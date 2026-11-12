"""Persist parser output and workbench decisions to Supabase.

Calls the RPC functions from supabase/migrations/20261112000000_fact_record.sql
over PostgREST with the service-role key (stdlib only, no extra deps). The key
stays on this local service; the browser never sees it.

Env (read from the process, falling back to the repo-root .env):
  SUPABASE_URL                 https://<project>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    service-role secret (server side only)
  SUPABASE_ALLOW_EXAMPLE       true to accept example_only handoffs (demo data)
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_dotenv(path: str = os.path.join(ROOT, ".env")) -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()


def configured() -> bool:
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def _rpc(name: str, args: dict, timeout: float = 30) -> dict:
    url = os.environ["SUPABASE_URL"].rstrip("/") + f"/rest/v1/rpc/{name}"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        url, data=json.dumps(args).encode(), method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            msg = json.loads(body).get("message") or body
        except ValueError:
            msg = body
        raise RuntimeError(f"Supabase {name} failed ({e.code}): {msg}") from None


def save_extraction(result: dict) -> dict:
    """Store documents, extracted facts and parser-detected contradictions."""
    return _rpc("ingest_extraction", {"payload": result})


def save_handoff(handoff: dict) -> dict:
    """Store a workbench database handoff (schema 1.0) in one transaction."""
    allow = os.environ.get("SUPABASE_ALLOW_EXAMPLE", "").lower() in ("1", "true", "yes")
    return _rpc("ingest_fact_handoff", {"payload": handoff, "allow_example": allow})


def try_save_extraction(result: dict) -> dict:
    """Best effort: never let a database problem break extraction for the UI."""
    if not configured():
        return {"saved": False, "reason": "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"}
    try:
        return {"saved": True, **save_extraction(result)}
    except Exception as e:  # noqa: BLE001
        return {"saved": False, "error": str(e)}


if __name__ == "__main__":
    # python fact_record/extraction_service/supabase_sink.py <extraction.json|handoff.json>
    import sys
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    fn = save_handoff if data.get("payload_type") == "property_fact_reconciliation" else save_extraction
    print(json.dumps(fn(data), indent=1))
