"""Proximity search: which listings are closest to supermarkets, parks, etc.

Amenity locations come from work/amenities.json (OpenStreetMap snapshot made
by scripts/fetch_amenities.py). Categories not in the snapshot fall back to a
live Nominatim search.
"""

import json
import logging
import math
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from properties import PROPERTIES

logger = logging.getLogger("amenities")

AMENITIES_PATH = Path(__file__).resolve().parent.parent / "work" / "amenities.json"

# Category -> OpenStreetMap search terms (also used by the fetch script).
CATEGORY_QUERIES: dict[str, list[str]] = {
    "supermarket": ["supermarket", "Tesco", "Sainsbury's", "Waitrose", "Lidl", "Asda", "Co-op"],
    "park": ["park", "garden", "playground"],
    "station": ["station", "DLR station", "underground station"],
    "school": ["school", "primary school", "nursery"],
    "gym": ["gym", "fitness centre", "leisure centre"],
    "pharmacy": ["pharmacy", "Boots"],
    "cafe": ["cafe", "coffee"],
    "restaurant": ["restaurant"],
    "pub": ["pub"],
    "hospital": ["hospital", "GP surgery", "medical centre"],
}

ALIASES = {
    "supermarkets": "supermarket", "grocery": "supermarket", "groceries": "supermarket",
    "shop": "supermarket", "shops": "supermarket", "food shop": "supermarket",
    "parks": "park", "green space": "park", "greenery": "park", "garden": "park",
    "playground": "park", "tube": "station", "dlr": "station", "train": "station",
    "transport": "station", "stations": "station", "schools": "school",
    "nursery": "school", "gyms": "gym", "fitness": "gym", "pharmacies": "pharmacy",
    "chemist": "pharmacy", "coffee": "cafe", "cafes": "cafe", "restaurants": "restaurant",
    "pubs": "pub", "bar": "pub", "doctor": "hospital", "gp": "hospital",
}

_cache: dict[str, list[dict[str, Any]]] | None = None


def _load() -> dict[str, list[dict[str, Any]]]:
    global _cache
    if _cache is None:
        try:
            _cache = json.loads(AMENITIES_PATH.read_text(encoding="utf-8"))
        except Exception as error:  # snapshot is optional
            logger.warning("No amenities snapshot (%s); using live search", error)
            _cache = {}
    return _cache


def _coords(prop: dict[str, Any]) -> tuple[float, float] | None:
    a = prop.get("address") or {}
    lat, lon = a.get("latitude"), a.get("longitude")
    return (float(lat), float(lon)) if lat is not None and lon is not None else None


def listing_bbox(pad: float = 0.0) -> tuple[float, float, float, float]:
    pts = [c for p in PROPERTIES if (c := _coords(p))]
    lats, lons = [p[0] for p in pts], [p[1] for p in pts]
    return min(lats) - pad, min(lons) - pad, max(lats) + pad, max(lons) + pad


def _metres(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6_371_000
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _live_search(query: str) -> list[dict[str, Any]]:
    south, west, north, east = listing_bbox(pad=0.01)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": query, "format": "jsonv2", "viewbox": f"{west},{north},{east},{south}",
         "bounded": 1, "limit": 50}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "property-voice-agent/0.1"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return [
            {"name": h.get("name") or query, "lat": float(h["lat"]), "lon": float(h["lon"])}
            for h in json.load(r)
        ]


def resolve_category(amenity: str) -> str:
    key = amenity.strip().lower()
    return ALIASES.get(key, key)


def amenity_points(amenity: str) -> list[dict[str, Any]]:
    category = resolve_category(amenity)
    data = _load()
    if category in data:
        return data[category]
    try:
        points = _live_search(category)
    except Exception as error:
        logger.warning("Live amenity search failed for %s: %s", category, error)
        points = []
    data[category] = points
    return points


def _walk_minutes(metres: float) -> int:
    return max(1, round(metres / 80))  # ~4.8 km/h


def rank_properties(
    amenity: str,
    *,
    max_price: float | None = None,
    min_bedrooms: int | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Listings sorted by distance to the nearest amenity of this kind."""
    points = amenity_points(amenity)
    if not points:
        return []
    results = []
    for prop in PROPERTIES:
        here = _coords(prop)
        if not here:
            continue
        if max_price is not None and (prop.get("price_value") or 0) > max_price:
            continue
        if min_bedrooms is not None and (prop.get("bedrooms") or 0) < min_bedrooms:
            continue
        nearest = min(points, key=lambda p: _metres(here, (p["lat"], p["lon"])))
        dist = _metres(here, (nearest["lat"], nearest["lon"]))
        results.append({"prop": prop, "nearest": nearest["name"], "metres": dist})
    results.sort(key=lambda r: r["metres"])
    return results[:limit]


def shortlist_payload(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compact rows for the call screen's map and info panel."""
    out = []
    for r in rows:
        p = r["prop"]
        a = p.get("address") or {}
        out.append({
            "id": str(p.get("property_id")),
            "title": a.get("display") or a.get("full"),
            "address": a.get("full") or a.get("display"),
            "price": p.get("price"),
            "bedrooms": p.get("bedrooms"),
            "property_type": p.get("property_type"),
            "lat": a.get("latitude"),
            "lon": a.get("longitude"),
            "nearest": r["nearest"],
            "metres": round(r["metres"]),
            "walk_minutes": _walk_minutes(r["metres"]),
        })
    return out


def describe_ranking(amenity: str, rows: list[dict[str, Any]]) -> str:
    if not rows:
        return f"I couldn't find any {amenity} data near our listings."
    lines = [f"Listings closest to a {resolve_category(amenity)} (straight-line distance):"]
    for i, r in enumerate(rows, 1):
        p = r["prop"]
        a = p.get("address") or {}
        lines.append(
            f"{i}. {a.get('display') or a.get('full')} (id {p.get('property_id')}): "
            f"{p.get('price')}, {p.get('bedrooms') or 'studio/unknown'} bed "
            f"{p.get('property_type') or ''}; nearest is {r['nearest']}, about "
            f"{round(r['metres'] / 10) * 10:.0f} m, roughly a {_walk_minutes(r['metres'])} minute walk."
        )
    return "\n".join(lines)
