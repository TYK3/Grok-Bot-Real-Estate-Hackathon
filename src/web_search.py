"""Perplexity-backed web search used by the agent's `web_search` function tool.

We use Perplexity's Search API (client-side) instead of OpenAI's server-side
WebSearch tool because it is ~2.6x faster on fresh queries (~1.3s vs ~3.3s for
SerpAPI/Google) and returns ranked, snippet-rich results tuned for LLM grounding.

A single AsyncPerplexity client is reused across calls, and requests run on the
event loop without blocking (the SDK is natively async).
"""

import logging
import os
from typing import Any

from perplexity import AsyncPerplexity

logger = logging.getLogger("web_search")

# Bias searches to the UK by default (property lettings are UK-based). Override
# with WEB_SEARCH_COUNTRY if needed.
DEFAULT_COUNTRY = os.getenv("WEB_SEARCH_COUNTRY", "GB")

_client: AsyncPerplexity | None = None


def _get_client() -> AsyncPerplexity:
    """Lazily build and cache the AsyncPerplexity client (reads PERPLEXITY_API_KEY)."""
    global _client
    if _client is None:
        _client = AsyncPerplexity()
    return _client


async def perplexity_search(
    query: str,
    pincode: str | None = None,
    max_results: int = 5,
    search_context_size: str = "medium",
) -> str:
    """Run a Perplexity web search and return a compact, LLM-friendly summary.

    Args:
        query: The natural-language search query.
        pincode: Optional UK postcode/area code used to bias results to a
            location. It is folded into the query text (the Search API has no
            dedicated location parameter, only `country`).
        max_results: Maximum number of results to return.
        search_context_size: Perplexity retrieval depth ("low" | "medium" | "high").
        country: ISO country code to scope results (defaults to DEFAULT_COUNTRY).

    Returns:
        A formatted string of results (title, url, snippet) or a short message.
    """
    effective_query = f"{query} near {pincode}" if pincode.strip() else query
    client = _get_client()

    try:
        search = await client.search.create(
            query=effective_query,
            max_results=max_results,
            search_context_size=search_context_size,
            country= DEFAULT_COUNTRY,
        )
    except Exception as exc:  # noqa: BLE001 - surface a usable message to the LLM
        logger.exception("Perplexity search failed for query %r", effective_query)
        return f"Web search failed: {exc}"

    results: list[Any] = getattr(search, "results", []) or []
    if not results:
        return f"No web results found for '{effective_query}'."

    lines: list[str] = []
    for i, r in enumerate(results, start=1):
        title = getattr(r, "title", "") or ""
        snippet = (getattr(r, "snippet", "") or "").strip().replace("\n", " ")
        lines.append(f"{i}. {title}\n {snippet}")

    logger.info(
        "Perplexity search '%s' -> %d results", effective_query, len(results)
    )
    return "Use the follwing information to answer the question, speak them naturally rather than looks like you you are reading directly from somewhere" + "\n".join(lines)
