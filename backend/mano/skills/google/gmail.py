"""Gmail (só leitura): não lidos da caixa de entrada e leitura dos remetentes/assuntos por voz."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from email.utils import parseaddr, parsedate_to_datetime

from ...intents.registry import Reply, intent
from ...llm import LLMUnavailable, tidy
from .account import GoogleFeature, ms

log = logging.getLogger(__name__)

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


    # ---------- resumo pelo LLM local ----------

    summary_cache: dict | None = None

    def _ids_key(self) -> str:
        return ",".join(m["id"] for m in self.data.get("messages", []))

    def snapshot(self) -> dict:
        cached = self.summary_cache
        summary = cached if cached and cached["key"] == self._ids_key() else None
        return {self.key: {**self.data, "summary": summary}}

    async def _summarize(self, msgs: list[dict], key: str) -> str | None:
        lines = "\n".join(f"{i}. De: {m['from']} | Assunto: {m['subject']} | Trecho: {m['snippet'][:220]}"
                          for i, m in enumerate(msgs, 1))
        prompt = (
            "Abaixo estão e-mails não lidos (remetente, assunto e começo do texto). Escreva um resumo em "
            "português do Brasil, em no máximo 4 frases curtas, para ser lido em voz alta. Diga primeiro o que "
            "parece pedir uma ação ou resposta. Não invente nada além do que está escrito e não use listas.\n\n"
            f"{lines}"
        )
        try:
            text = tidy(await self.ctx.llm.generate(prompt, max_tokens=200, label="e-mails", interactive=True))
        except LLMUnavailable as e:
            log.warning("resumo de e-mails falhou: %s", e)
            await self.ctx.notify("Não consegui resumir os e-mails agora.", title="E-mail", toast=False)
            return None
        self.summary_cache = {"text": text, "key": key, "at": ms(datetime.now())}
        await self.ctx.hub.broadcast(self.key, self.snapshot())
        return text

    @intent(
        "gmail.summary",
        patterns=[r"\bresum\w* (d?os |d?os meus |meus |minha |d?a )?(e ?mails|caixa de entrada)\b",
                  r"\bresumo (d?os |dos meus |da )?(e ?mails|caixa de entrada)\b"],
        examples=["resume meus e-mails"],
        priority=7,
    )
    async def summary_intent(self, slots: dict) -> Reply:
        if (r := self.not_ready()) is not None:
            return r
        await self.refresh()
        msgs = self.data.get("messages", [])
        if not msgs:
            return Reply("Nenhum e-mail novo importante para resumir.")
        llm = self.ctx.llm
        if not (llm and llm.ready):
            return await self.unread_intent(slots)
        key = self._ids_key()
        cached = self.summary_cache or {}
        if cached.get("key") == key:
            return Reply(cached["text"])

        async def run():
            text = await self._summarize(msgs, key)
            if text:
                await self.ctx.notify(text, title="Resumo dos e-mails", toast=False)

        asyncio.create_task(run())
        return Reply(f"Vou ler seus {len(msgs)} e-mails mais recentes e já te conto o resumo.")
