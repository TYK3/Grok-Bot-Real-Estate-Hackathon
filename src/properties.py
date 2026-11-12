"""Property catalogue helpers shared by the agent.

Loads the Hamptons lettings dataset once and exposes lookups plus formatting
utilities so the agent can be scoped to a single property.
"""

import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("properties")

PROPERTY_DATA_PATH = (
    Path(__file__).resolve().parent.parent / "work" / "hamptons_e14_2dr_lettings.json"
)

try:
    with open(PROPERTY_DATA_PATH, encoding="utf-8") as _f:
        PROPERTIES: list[dict[str, Any]] = json.load(_f)
except Exception as error:  # noqa: BLE001 - dataset is optional at import time
    logger.error("Failed to load property data: %s", error)
    PROPERTIES = []


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


def format_property_details(prop: dict[str, Any]) -> str:
    """Render a compact, speech-friendly description of a single property."""
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
