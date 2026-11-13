"""Tenancy-agreement answers from our standard terms document.

Haven answers questions such as "how much notice do I give?" or "can I keep a
cat?" from work/tenancy_terms.json, quoting the clause it used, plus the
listing's own fields (deposit, council tax, availability, furnishing). It never
answers agreement questions from the web.
"""

import json
import re
from pathlib import Path
from typing import Any

TERMS_PATH = Path(__file__).resolve().parent.parent / "work" / "tenancy_terms.json"

DISCLAIMER = (
    "This is a summary of our standard terms, not legal advice; the lettings "
    "team confirms the final agreement."
)

LISTING_FIELDS = {
    "security_deposit": "Security deposit",
    "council_tax_band": "Council tax band",
    "live_date": "Available from",
    "furnishing": "Furnishing",
}


def load_terms(path: Path = TERMS_PATH) -> dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return {"document": {}, "clauses": []}


TERMS = load_terms()


STOPWORDS = {
    "a", "an", "and", "the", "of", "to", "in", "on", "for", "is", "it", "my",
    "i", "do", "can", "what", "how", "you", "your", "we", "our", "be", "with",
}


def _words(text: str) -> set[str]:
    return set(re.findall(r"[a-z]+", text.lower())) - STOPWORDS


def match_clauses(
    question: str, terms: dict[str, Any] | None = None, limit: int = 2
) -> list[dict[str, Any]]:
    """Clauses ranked by how well their keywords match the question."""
    terms = terms or TERMS
    q = question.lower()
    q_words = _words(q)
    scored = []
    for clause in terms.get("clauses", []):
        score = 0
        for kw in clause.get("keywords", []):
            kw = kw.lower()
            if " " in kw:
                score += 3 if kw in q else 0
            elif kw in q_words or (len(kw) > 4 and kw in q):
                score += 2
        score += len(q_words & _words(clause.get("title", "")))
        if score:
            scored.append((score, clause))
    scored.sort(key=lambda item: -item[0])
    return [
        {"id": c["id"], "title": c["title"], "text": c["text"]}
        for _, c in scored[:limit]
    ]


def listing_terms(prop: dict[str, Any] | None) -> list[dict[str, str]]:
    if not prop:
        return []
    out = []
    for key, label in LISTING_FIELDS.items():
        value = prop.get(key)
        if value not in (None, "", "None"):
            out.append({"label": label, "value": str(value)})
    return out


def answer_question(
    question: str, prop: dict[str, Any] | None, terms: dict[str, Any] | None = None
) -> dict[str, Any]:
    terms = terms or TERMS
    doc = terms.get("document", {})
    return {
        "question": question,
        "document": doc.get("title", "Standard tenancy terms"),
        "version": doc.get("version", ""),
        "clauses": match_clauses(question, terms),
        "listing": listing_terms(prop),
        "property_id": str(prop.get("property_id")) if prop else None,
        "disclaimer": DISCLAIMER,
    }


def describe_answer(answer: dict[str, Any]) -> str:
    lines = []
    if answer["clauses"]:
        lines.append(f"From {answer['document']}:")
        lines += [f"- Clause {c['id']} ({c['title']}): {c['text']}" for c in answer["clauses"]]
    else:
        lines.append(
            "Our standard terms don't cover that. Say you'll check with the "
            "lettings team rather than guessing."
        )
    if answer["listing"]:
        lines.append("This listing: " + "; ".join(f"{f['label']}: {f['value']}" for f in answer["listing"]))
    lines.append(f"Always add: {DISCLAIMER}")
    return "\n".join(lines)
