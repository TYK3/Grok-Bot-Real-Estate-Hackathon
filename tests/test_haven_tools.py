"""Haven's price comparison and agreement answers."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from agreements import answer_question, describe_answer, match_clauses
from pricing import compare_price, describe_comparison, price_of


def _let(pid, rent, beds):
    return {
        "property_id": pid,
        "price": f"£{rent:,} pcm",
        "price_value": str(rent),
        "bedrooms": str(beds),
        "transaction_type": "lettings",
        "status": "To let",
        "address": {"display": f"Home {pid}"},
    }


CATALOGUE = [
    _let("a", 2000, 2),
    _let("b", 2400, 2),
    _let("c", 2600, 2),
    _let("d", 3000, 2),
    _let("e", 1500, 1),
    {"property_id": "s", "price": "£600,000 guide", "bedrooms": "2", "status": "For sale",
     "address": {"display": "Sale home"}},
]


def test_price_of_parses_strings_and_numbers():
    assert price_of({"price_value": "2500"}) == 2500
    assert price_of({"price": "£2,910 pcm"}) == 2910
    assert price_of({"price_value": 1800}) == 1800
    assert price_of({"price": "POA"}) is None


def test_compare_uses_same_bedroom_lettings_only():
    result = compare_price(CATALOGUE[1], CATALOGUE)
    assert result["basis"] == "2-bedroom lettings"
    assert result["count"] == 3  # a, c, d: excludes itself, the 1-bed and the sale
    assert result["average"] == round((2000 + 2600 + 3000) / 3)
    assert result["delta_pct"] < 0
    assert result["percentile"] == 33
    assert "below average" in describe_comparison(result)


def test_compare_skips_sales_and_falls_back_to_all_lettings():
    assert compare_price(CATALOGUE[-1], CATALOGUE) is None
    result = compare_price(_let("x", 1400, 3), CATALOGUE)
    assert result["basis"] == "all lettings"


def test_agreement_matches_the_right_clause():
    assert match_clauses("How much notice do I need to give to move out?")[0]["title"].startswith(
        "Ending the tenancy (you)"
    )
    assert match_clauses("Can I keep my cat?")[0]["title"] == "Pets"
    assert match_clauses("Is my deposit protected?")[0]["title"] == "Security deposit"


def test_agreement_answer_includes_listing_terms_and_disclaimer():
    prop = {**CATALOGUE[0], "security_deposit": "£2,307", "furnishing": "furnished"}
    answer = answer_question("what is the deposit", prop)
    assert {"label": "Security deposit", "value": "£2,307"} in answer["listing"]
    text = describe_answer(answer)
    assert "not legal advice" in text


def test_unknown_agreement_question_does_not_guess():
    answer = answer_question("what colour is the front door", None)
    assert answer["clauses"] == []
    assert "don't cover" in describe_answer(answer)
