"""Property catalogue helpers shared by the agent.

Loads the Hamptons lettings dataset once and exposes lookups plus formatting
utilities so the agent can be scoped to a single property.
"""

import json
import logging
import os
import time
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger("properties")

REPO_ROOT = Path(__file__).resolve().parent.parent
PROPERTY_DATA_PATH = REPO_ROOT / "work" / "hamptons_e14_2dr_lettings.json"

# Verified facts published by the fact_record pipeline:
#   05_listing.json     -> listing catalogue (same keys as the Hamptons data)
#   04_voice_agent.json -> per-unit statements the agent may say + do_not_state
CONTRACTS_DIR = REPO_ROOT / "fact_record" / "contracts"
LISTING_CONTRACT_PATH = Path(
    os.getenv("FACT_LISTING_PATH") or CONTRACTS_DIR / "05_listing.json"
)
VOICE_CONTRACT_PATH = Path(
    os.getenv("FACT_VOICE_PATH") or CONTRACTS_DIR / "04_voice_agent.json"
)


def _load_json(path: Path) -> Any:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as error:  # datasets are optional at import time
        logger.error("Failed to load %s: %s", path, error)
        return None


def _load_verified_listings() -> list[dict[str, Any]]:
    contract = _load_json(LISTING_CONTRACT_PATH) or {}
    listings = []
    for listing in (contract.get("listings") or {}).values():
        prop = listing.get("property")
        if prop:
            listings.append({**prop, "verified": True})
    return listings


_hamptons = _load_json(PROPERTY_DATA_PATH)
PROPERTIES: list[dict[str, Any]] = _load_verified_listings() + (
    _hamptons if isinstance(_hamptons, list) else []
)
VOICE_UNITS: dict[str, dict[str, Any]] = (
    (_load_json(VOICE_CONTRACT_PATH) or {}).get("units") or {}
)


# --- Reviewed facts from Supabase ------------------------------------------
# published_fact_state() (supabase/migrations/20261112010000) returns accepted
# facts with citations, pending cases (status only) and scoped claims. For any
# field it covers, Supabase supersedes contract 04; pending always blocks a
# value. Without SUPABASE_URL + SUPABASE_ANON_KEY, or on error, contract 04 is
# used alone.

_STATE_TTL = 30.0
_state_cache: tuple[float, dict[str, Any] | None] = (0.0, None)

# Workbench ids/fields -> listing ids / contract-04 voice fields.
PROPERTY_ALIASES = {"st-huberts-close": "59-st-huberts-close"}
VOICE_FIELD = {
    "net_floor_area": "floor_area", "gross_floor_area": "floor_area",
    "lower_ground_floor_area": "floor_area", "energy_rating": "epc_rating",
    "parking_total": "parking", "parking_scope": "parking",
}
SAFE_PHRASING = {
    "price": "The price is being confirmed with the agent; I can arrange for them to call you.",
    "rent": "The rent is being confirmed with the agent.",
    "floor_area": "The floor area is being verified against the measured survey; I can send the confirmed figure.",
    "parking": "The parking allocation is being confirmed.",
    "epc_rating": "The EPC rating is being checked against the official register.",
    "tenure": "The tenure is being confirmed with the agent.",
    "transaction_type": "Whether it is for sale or to let is being confirmed with the agent.",
    "bedrooms": "The bedroom count for this home is being confirmed.",
    "availability": "Availability is being confirmed with the agent.",
}
_BASIS = {"net": "NIA", "gross": "GIA"}


def _listing_id(pid: Any) -> str:
    return PROPERTY_ALIASES.get(str(pid), str(pid))


def published_fact_state() -> dict[str, Any] | None:
    """Supabase review state, cached for 30 s. None when unset or unreachable."""
    global _state_cache
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_ANON_KEY")
    if not url or not key:
        return None
    fetched_at, cached = _state_cache
    if fetched_at and time.monotonic() - fetched_at < _STATE_TTL:
        return cached
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/rpc/published_fact_state", data=b"{}", method="POST",
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=4) as r:
            state = json.loads(r.read())
    except Exception as error:  # keep the agent talking on contract 04
        logger.error("Supabase published_fact_state failed, using contract 04: %s", error)
        state = cached  # last good state, if any
    _state_cache = (time.monotonic(), state)
    return state


def _format_claim(field: str, value: Any, unit: str | None, basis: str | None,
                  converted: dict[str, Any] | None = None) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    try:
        n = float(value)
    except (TypeError, ValueError):
        n = None
    if unit == "GBP" and n is not None:
        return f"£{n:,.0f}"
    if unit in ("sqft", "sqm") and n is not None:
        if converted:
            area = f"{converted['sqft']:,.0f} sq ft ({converted['sqm']:,.1f} sq m)"
        else:
            area = f"{n:,.0f} {'sq ft' if unit == 'sqft' else 'sq m'}"
        return f"{area} {_BASIS.get(basis, basis) if basis else '[basis not stated]'}"
    if n is not None and "parking" in field:
        return f"{n:g} space{'' if n == 1 else 's'}"
    if n is not None and field == "bedrooms":
        return f"{n:g} bedroom{'' if n == 1 else 's'}"
    return str(value)


def _field_label(field: str) -> str:
    return field.replace("_", " ").capitalize()


def _reviewed_for(development: str) -> dict[str, list[dict[str, Any]]] | None:
    state = published_fact_state()
    if not state:
        return None

    def pick(rows: Any) -> list[dict[str, Any]]:
        return [r for r in rows or [] if _listing_id(r.get("property_id")) == development]

    out = {k: pick(state.get(k)) for k in ("facts", "pending", "context")}
    return out if any(out.values()) else None


def get_property_by_id(property_id: str | int | None) -> dict[str, Any] | None:
    """Return the property whose ``property_id`` (or ``reference``) matches.

    Falls back to properties that exist only in Supabase (reviewed in the
    workbench, no listing contract yet)."""
    if property_id is None:
        return None
    target = str(property_id).strip()
    if not target:
        return None
    for prop in PROPERTIES:
        if str(prop.get("property_id")) == target:
            return prop
        if str(prop.get("reference")) == target:
            return prop
    for p in (published_fact_state() or {}).get("properties") or []:
        if _listing_id(p.get("property_id")) == target:
            return {"property_id": target, "reference": target, "verified": True,
                    "address": {"display": p.get("property_name") or target}}
    return None


def _citation_note(citation: dict[str, Any] | None) -> str:
    if not citation:
        return ""
    parts = [
        citation.get("issuer"),
        (citation.get("doc_type") or "").replace("_", " ") or None,
        citation.get("doc_date"),
        f"page {citation['page']}" if citation.get("page") is not None else None,
    ]
    note = ", ".join(str(p) for p in parts if p)
    return f" [source: {note}]" if note else ""


def _unit_label(unit_id: str) -> str:
    """'kelso-villa-ba1-3au:lower-ground' -> 'lower ground'."""
    return unit_id.split(":", 1)[-1].replace("-", " ")


def format_verified_details(prop: dict[str, Any]) -> str:
    """Render contract 04 for one verified listing: only verified statements,
    each with its source, then the fields the agent must not state."""
    development = str(prop.get("property_id"))
    main_unit = str(prop.get("reference") or "")
    units = {
        uid: u for uid, u in VOICE_UNITS.items() if u.get("development") == development
    }
    # The listing's own unit first, then the rest (floors, house types, development).
    ordered = sorted(units.items(), key=lambda kv: (kv[0] != main_unit, kv[0]))

    lines = [
        f"Property: {(prop.get('address') or {}).get('display') or development}",
        *([f"Marketed by: {prop['agency']}"] if prop.get("agency") else []),
        "",
        "VERIFIED FACTS (the only facts you may state; the source is in brackets, "
        "use it when asked where a fact comes from):",
    ]
    reviewed = _reviewed_for(development) or {}
    # Voice fields the Supabase review covers: its state replaces contract 04's.
    superseded = {
        VOICE_FIELD.get(r["field"], r["field"]) for rows in reviewed.values() for r in rows
    }
    # Fields with an open contradiction anywhere in the development are never
    # stated, even if a statement for that field slipped into 'statements'.
    blocked_fields = {
        d.get("field") for u in units.values() for d in u.get("do_not_state") or []
        if d.get("field") not in superseded
    } | superseded

    for f in reviewed.get("facts", []):
        say = _format_claim(f["field"], f.get("value"), f.get("unit"), f.get("area_basis"),
                            f.get("area_converted"))
        lines.append(f"- {_field_label(f['field'])}: {say}.{_citation_note(f.get('citation'))}")
    for c in reviewed.get("context", []):
        claims = "; ".join(
            _format_claim(c["field"], cl.get("value"), cl.get("unit"), cl.get("area_basis"))
            + " (" + str(cl.get("scope") or cl.get("area_basis") or "scope not stated").replace("_", " ") + ")"
            + _citation_note(cl.get("citation"))
            for cl in c.get("claims") or [])
        lines.append(f"- {_field_label(c['field'])}, separate claims (state each with its scope, "
                     f"never combine them into one figure): {claims}")

    seen_say: set[str] = set()
    for uid, unit in ordered:
        statements = []
        for s in unit.get("statements") or []:
            say = " ".join(str(s.get("say") or "").split())
            if not say or say in seen_say or s.get("field") in blocked_fields:
                continue
            seen_say.add(say)
            statements.append((say, s.get("citation")))
        if not statements:
            continue
        if uid != main_unit:
            lines.append(f"- For the {_unit_label(uid)}:")
        prefix = "  - " if uid != main_unit else "- "
        for say, citation in statements:
            lines.append(f"{prefix}{say}{_citation_note(citation)}")

    seen_dns: set[str] = set()
    dns_lines = []
    for p in reviewed.get("pending", []):
        voice_field = VOICE_FIELD.get(p["field"], p["field"])
        why = "the document has an error" if p.get("document_error") else "the documents disagree"
        phrasing = SAFE_PHRASING.get(voice_field, "That detail is still being verified with the agent.")
        dns_lines.append(
            f"- {_field_label(p['field'])}: {why} (case {p['case_key']}, {p.get('status')}). "
            f'Never give a value. Say: "{phrasing}"'
        )
    for _uid, unit in ordered:
        for d in unit.get("do_not_state") or []:
            if d.get("field") in superseded:
                continue
            key = d.get("contradiction_id") or d.get("field")
            if key in seen_dns:
                continue
            seen_dns.add(key)
            field = str(d.get("field", "")).replace("_", " ")
            dns_lines.append(
                f"- {field}: the documents disagree ({key}). Never give a value. "
                f'Say: "{d.get("safe_phrasing")}"'
            )
    if dns_lines:
        lines += ["", "DO NOT STATE (still being verified):", *dns_lines]

    lines += [
        "",
        "Anything not listed above is not verified: say you will check with the "
        "agent rather than guessing.",
    ]
    return "\n".join(lines)


def format_property_details(prop: dict[str, Any]) -> str:
    """Render a compact, speech-friendly description of a single property."""
    if prop.get("verified"):
        return format_verified_details(prop)
    address = prop.get("address", {}) or {}
    branch = prop.get("branch", {}) or {}
    features = prop.get("key_features", []) or []

    lines = [
        f"Reference: {prop.get('reference')} (id {prop.get('property_id')})",
        f"Address: {address.get('full') or address.get('display')}",
        f"Postcode: {address.get('postcode')}",
        f"Status: {prop.get('status')}",
        f"Price: {prop.get('price')}",
        f"Property type: {prop.get('property_type')}",
        f"Furnishing: {prop.get('furnishing')}",
        f"Bedrooms: {prop.get('bedrooms')}",
        f"Bathrooms: {prop.get('bathrooms')}",
        f"Reception rooms: {prop.get('reception_rooms')}",
        f"Council tax band: {prop.get('council_tax_band')}",
        f"Security deposit: {prop.get('security_deposit')}",
        f"Available from: {prop.get('live_date')}",
        f"Letting branch: {branch.get('name')} ({branch.get('phone')}, {branch.get('email')})",
    ]
    if features:
        lines.append("Key features: " + ", ".join(str(f) for f in features))
    if prop.get("description"):
        lines.append(f"Description: {prop.get('description')}")
    return "\n".join(line for line in lines if line and not line.endswith(": None"))


def get_property_images(prop: dict[str, Any], *, max_photos: int = 3) -> list[str]:
    """Return a small set of images (floor plan first, then photos, then EPC).

    Prefers pre-embedded base64 data URLs (``image_data``, produced by
    scripts/embed_property_images.py) so bytes load directly with no network
    fetch. Falls back to the remote http URLs when nothing is embedded."""
    embedded = prop.get("image_data")
    if isinstance(embedded, list) and embedded:
        return [item for item in embedded if item]

    urls: list[str] = []
    for url in prop.get("floorplans", []) or []:
        if url:
            urls.append(url)
    for url in (prop.get("images", []))[:max_photos]:
        if url:
            urls.append(url)
    return urls
