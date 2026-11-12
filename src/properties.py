"""Property catalogue helpers shared by the agent.

Loads the Hamptons lettings dataset once and exposes lookups plus formatting
utilities so the agent can be scoped to a single property.
"""

import json
import logging
import os
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


def get_property_by_id(property_id: str | int | None) -> dict[str, Any] | None:
    """Return the property whose ``property_id`` (or ``reference``) matches."""
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
        f"Marketed by: {prop.get('agency')}",
        "",
        "VERIFIED FACTS (the only facts you may state; the source is in brackets, "
        "use it when asked where a fact comes from):",
    ]
    # Fields with an open contradiction anywhere in the development are never
    # stated, even if a statement for that field slipped into 'statements'.
    blocked_fields = {
        d.get("field") for u in units.values() for d in u.get("do_not_state") or []
    }

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
    for _uid, unit in ordered:
        for d in unit.get("do_not_state") or []:
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
