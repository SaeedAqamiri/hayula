"""Free web search MCP server for OpenCode.

Uses DuckDuckGo's `ddgs` client but explicitly iterates engines that remain
reachable from networks where duckduckgo.com itself is DNS-blocked (the `auto`
backend collapses to a single-engine fallback). Aggregates and de-dupes results
across those engines. No API key required.
"""

from __future__ import annotations

import json

from ddgs import DDGS
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("web-search")

# Engines reachable from the networks this server targets. duckduckgo, yahoo,
# grokipedia, startpage are blocked there (and bing/yandex no longer exist in
# ddgs), so we only try the ones verified to respond.
ENGINES = ["brave", "google", "wikipedia", "mojeek"]


def _search(query: str, max_results: int) -> list[dict]:
    seen: dict[str, dict] = {}
    for backend in ENGINES:
        try:
            raw = DDGS(timeout=15).text(query, max_results=max_results, backend=backend) or []
        except Exception:
            continue
        for r in raw:
            href = r.get("href") or r.get("link")
            if not href or href in seen:
                continue
            seen[href] = {
                "title": r.get("title", ""),
                "url": href,
                "content": r.get("body", r.get("snippet", "")),
            }
    return list(seen.values())[:max_results]


@mcp.tool()
def web_search(query: str, max_results: int = 5) -> str:
    """Search the web for current information. Free, no API key required.

    Args:
        query: Search keywords describing what you want to find.
        max_results: Maximum number of results to return (default 5).
    """
    results = _search(query, max_results)
    if not results:
        return json.dumps({"error": "No results found", "query": query}, ensure_ascii=False)
    return json.dumps({"query": query, "results": results}, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    mcp.run(transport="stdio")
