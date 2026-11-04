"""Leitura de feeds RSS/Atom e extração do texto dos artigos (sem rede: só funções puras)."""

from __future__ import annotations

import calendar
import html
import re
from datetime import datetime
from urllib.parse import urljoin

import feedparser

_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def plain(fragment: str) -> str:
    """HTML curto (resumo do feed) → texto puro."""
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment or "", flags=re.S | re.I)
    t = _TAG.sub(" ", t)
    return _SPACE.sub(" ", html.unescape(t)).strip()


def sentences(text: str, n: int = 2, max_chars: int = 360) -> str:
    """Primeiras `n` frases, cortando no limite de caracteres."""
    parts = re.split(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9\"“])", (text or "").strip())
    out = ""
    for p in parts[:n]:
        if out and len(out) + len(p) > max_chars:
            break
        out = f"{out} {p}".strip()
    if len(out) > max_chars:
        out = out[: max_chars].rsplit(" ", 1)[0] + "…"
    return out


def _when(entry) -> datetime | None:
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        t = entry.get(key)
        if t:
            return datetime.fromtimestamp(calendar.timegm(t))
    return None


def parse_feed(content: bytes | str, base_url: str = "") -> dict | None:
    """Devolve título, site e itens; None se não for um feed."""
    d = feedparser.parse(content)
    if not d.get("version") and not d.entries:
        return None
    now = datetime.now()
    entries = []
    for e in d.entries:
        link = e.get("link") or ""
        title = plain(e.get("title") or "")
        if not link or not title:
            continue
        body = e.get("summary") or ""
        if e.get("content"):
            body = max((c.get("value", "") for c in e.content), key=len) or body
        entries.append({
            "guid": e.get("id") or link,
            "url": urljoin(base_url, link),
            "title": title,
            "published": min(_when(e) or now, now),
            "excerpt": plain(body)[:4000],
        })
    entries.sort(key=lambda x: x["published"], reverse=True)
    feed = d.get("feed", {})
    return {"title": plain(feed.get("title") or ""), "site": feed.get("link") or "", "entries": entries}


_LINK = re.compile(r"<link\b[^>]*>", re.I)
_ATTR = re.compile(r"""([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))""")


def discover(page_html: str, base_url: str) -> list[str]:
    """Acha os feeds anunciados numa página (<link rel="alternate" type="application/rss+xml">)."""
    found = []
    for tag in _LINK.findall(page_html or ""):
        attrs = {m[0].lower(): m[1] or m[2] or m[3] for m in _ATTR.findall(tag)}
        rel = attrs.get("rel", "").lower().split()
        typ = attrs.get("type", "").lower()
        if "alternate" in rel and typ in ("application/rss+xml", "application/atom+xml", "application/feed+json") \
                and attrs.get("href"):
            url = urljoin(base_url, html.unescape(attrs["href"]))
            if url not in found and "comments" not in url:
                found.append(url)
    return found


def extract(page_html: str, url: str) -> str:
    """Texto principal de uma página de artigo (trafilatura)."""
    import trafilatura

    try:
        text = trafilatura.extract(page_html, url=url, include_comments=False, include_tables=False,
                                   favor_precision=True, deduplicate=True)
    except Exception:
        return ""
    return (text or "").strip()
