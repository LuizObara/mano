"""Gmail (só leitura): não lidos da caixa de entrada e leitura dos remetentes/assuntos por voz."""

from __future__ import annotations

import asyncio
from email.utils import parseaddr, parsedate_to_datetime

from ...intents.registry import Reply, intent
from .account import GoogleFeature, ms

API = "https://gmail.googleapis.com/gmail/v1/users/me"
# "principais": tira promoções e redes sociais da lista mostrada
QUERY = "is:unread in:inbox -category:promotions -category:social -category:forums"
SHOWN = 8


def sender_name(raw: str) -> str:
    name, addr = parseaddr(raw)
    return (name or addr or raw).strip().strip('"')


class GmailSkill(GoogleFeature):
    name = "e-mail"
    description = "E-mail (Gmail)"
    key = "gmail"
    poll_s = 180

    def empty(self) -> dict:
        return {"unread": None, "messages": [], "error": None, "updated": None}

    async def fetch(self) -> dict:
        inbox, listing = await asyncio.gather(
            self.account.request("GET", f"{API}/labels/INBOX"),
            self.account.request("GET", f"{API}/messages", params={"q": QUERY, "maxResults": SHOWN}),
        )
        ids = [m["id"] for m in listing.get("messages", [])]

        async def meta(mid: str) -> dict:
            m = await self.account.request(
                "GET", f"{API}/messages/{mid}",
                params=[("format", "metadata"), ("metadataHeaders", "From"), ("metadataHeaders", "Subject"),
                        ("metadataHeaders", "Date")],
            )
            h = {x["name"].lower(): x["value"] for x in m.get("payload", {}).get("headers", [])}
            try:
                when = ms(parsedate_to_datetime(h["date"]).astimezone().replace(tzinfo=None))
            except (KeyError, TypeError, ValueError):
                when = int(m.get("internalDate", 0))
            return {
                "id": mid, "thread": m.get("threadId"), "from": sender_name(h.get("from", "")),
                "subject": h.get("subject") or "(sem assunto)", "snippet": m.get("snippet", ""), "date": when,
                "url": f"https://mail.google.com/mail/u/0/#inbox/{m.get('threadId')}",
            }

        messages = await asyncio.gather(*(meta(i) for i in ids))
        return {"unread": inbox.get("messagesUnread", 0), "important": listing.get("resultSizeEstimate", len(ids)),
                "messages": sorted(messages, key=lambda m: -m["date"])}

    @intent(
        "gmail.unread",
        patterns=[r"\b(tenho |tem |chegou )?(algum |alguns )?e ?mails? nov[oa]s?\b", r"\bquantos e ?mails\b",
                  r"\b(le|leia|ler|quais|me fala|ver) (os |meus |os meus )?(ultimos )?e ?mails\b",
                  r"\bcaixa de entrada\b", r"\bchegou e ?mail\b"],
        examples=["tenho e-mail novo?", "lê meus e-mails"],
        priority=6,
    )
    async def unread_intent(self, slots: dict) -> Reply:
        if (r := self.not_ready()) is not None:
            return r
        await self.refresh()
        d = self.data
        if d.get("error") and d.get("unread") is None:
            return Reply("Não consegui olhar seus e-mails agora.")
        msgs = d.get("messages", [])
        if not msgs:
            total = d.get("unread") or 0
            extra = f" Tem {total} não lidos em promoções e afins." if total else ""
            return Reply("Nenhum e-mail novo importante." + extra)
        n = d.get("important") or len(msgs)
        head = f"Você tem {n} e-mail{'s' if n > 1 else ''} não lido{'s' if n > 1 else ''} na caixa principal."
        top = "; ".join(f"de {m['from']}: {m['subject']}" for m in msgs[:3])
        return Reply(f"{head} Os mais recentes: {top}.")

