"""Price comparison against our own listings.

Haven uses this to answer "is this a good price?" with numbers that trace back
to the catalogue: the listing is compared with lettings that have the same
number of bedrooms (falling back to all lettings when there are too few).
"""

import re
from statistics import mean, median
from typing import Any

MIN_COMPARABLES = 3


def price_of(prop: dict[str, Any]) -> float | None:
    """Monthly rent (or asking price) in pounds, or None when not stated."""
    raw = prop.get("price_value")
    if raw in (None, ""):
        raw = prop.get("price")
    if isinstance(raw, int | float):
        return float(raw) if raw > 0 else None
    digits = re.sub(r"[^\d.]", "", str(raw or ""))
    try:
        value = float(digits)
    except ValueError:
        return None
    return value if value > 0 else None


def _beds(prop: dict[str, Any]) -> int | None:
    try:
        return int(prop.get("bedrooms"))
    except (TypeError, ValueError):
        return None


def _is_letting(prop: dict[str, Any]) -> bool:
    text = f"{prop.get('transaction_type', '')} {prop.get('status', '')} {prop.get('price', '')}".lower()
    if re.search(r"sale|guide|offers|freehold|leasehold", text):
        return False
    value = price_of(prop)
    return value is not None and value < 50_000


def compare_price(
    prop: dict[str, Any], catalogue: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """Where this listing's rent sits among comparable lettings.

    Returns None when the listing has no usable price or is not a letting."""
    price = price_of(prop)
    if price is None or not _is_letting(prop):
        return None
    pid = str(prop.get("property_id"))
    beds = _beds(prop)
    lettings = [
        p for p in catalogue
        if _is_letting(p) and str(p.get("property_id")) != pid
    ]
    same_beds = [p for p in lettings if beds is not None and _beds(p) == beds]
    pool, basis = (
        (same_beds, f"{beds}-bedroom lettings")
        if len(same_beds) >= MIN_COMPARABLES
        else (lettings, "all lettings")
    )
    prices = sorted(v for v in (price_of(p) for p in pool) if v is not None)
    if not prices:
        return None

    avg = mean(prices)
    cheaper = sum(1 for v in prices if v < price)
    address = prop.get("address") or {}
    comps = sorted(pool, key=lambda p: abs((price_of(p) or 0) - price))[:5]
    return {
        "property_id": pid,
        "title": address.get("display") or address.get("full") or pid,
        "price": price,
        "bedrooms": beds,
        "basis": basis,
        "count": len(prices),
        "average": round(avg),
        "median": round(median(prices)),
        "min": round(prices[0]),
        "max": round(prices[-1]),
        "delta_pct": round((price - avg) / avg * 100, 1),
        # Share of comparable homes that cost less than this one.
        "percentile": round(cheaper / len(prices) * 100),
        "prices": [round(v) for v in prices],
        "comparables": [
            {
                "id": str(p.get("property_id")),
                "title": (p.get("address") or {}).get("display") or str(p.get("property_id")),
                "price": round(price_of(p) or 0),
                "bedrooms": _beds(p),
            }
            for p in comps
        ],
    }


def describe_comparison(result: dict[str, Any] | None) -> str:
    if not result:
        return "I can't compare the price for this one: it has no monthly rent listed."
    direction = "below" if result["delta_pct"] < 0 else "above"
    return (
        f"{result['title']} is £{result['price']:,.0f} a month. Across {result['count']} "
        f"{result['basis']} in our listings the average is £{result['average']:,} "
        f"(median £{result['median']:,}, range £{result['min']:,} to £{result['max']:,}), "
        f"so it is {abs(result['delta_pct'])}% {direction} average and pricier than "
        f"{result['percentile']}% of them. These are asking rents from our own catalogue."
    )
