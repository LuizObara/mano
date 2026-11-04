"""Briefing: novidades dos blogs/sites que você escolheu, condensadas.

- Busca os feeds RSS a cada 2 h e extrai o texto de cada artigo novo.
- De madrugada (MANO_BRIEFING_SUMMARIZE_AT) o LLM local resume cada artigo em 2–3 frases.
  Sem LLM, o resumo é o começo do texto do próprio artigo.
- "Quais as notícias?" lê as novidades; "bom dia" junta agenda, remédios, hábitos, tarefas, e-mails e
  notícias num resumo do dia (e pode tocar sozinho num horário escolhido na aba Briefing).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from sqlmodel import col, delete, func, select

from ...intents.registry import Reply, Skill, intent
from ...llm import LLMUnavailable, tidy
from ...models import Article, Feed, ms
from .feeds import discover, extract, parse_feed, sentences

log = logging.getLogger(__name__)

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/126.0 Safari/537.36 Mano/0.1")

SUMMARY_PROMPT = """Resuma a notícia abaixo em português do Brasil, em 2 ou 3 frases curtas e objetivas.
Comece direto pelo fato principal. Seja fiel ao texto: não invente, não opine e não use listas.
Se o texto estiver em outro idioma, escreva o resumo em português.

Título: {title}

Texto:
{text}"""

# sugestões de fontes confiáveis (o usuário escolhe; nenhuma vem ligada)
SUGGESTIONS = [
    {"title": "BBC News Brasil", "url": "https://feeds.bbci.co.uk/portuguese/rss.xml"},
    {"title": "Agência Brasil", "url": "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml"},
    {"title": "Tecnoblog", "url": "https://tecnoblog.net/feed/"},
    {"title": "Nexo Jornal", "url": "https://www.nexojornal.com.br/rss.xml"},
    {"title": "Pesquisa FAPESP", "url": "https://revistapesquisa.fapesp.br/feed/"},
    {"title": "The Verge", "url": "https://www.theverge.com/rss/index.xml"},
]


class FeedIn(BaseModel):
    url: str
    title: str | None = None  # nome escolhido (sugestões); senão, o título do feed


class FeedPatch(BaseModel):
    active: bool | None = None
    title: str | None = None


class ItemPatch(BaseModel):
    read: bool | None = None
    starred: bool | None = None


class ReadAllIn(BaseModel):
    ids: list[int] | None = None


class ConfigIn(BaseModel):
    morning_at: str | None = None  # "07:30" ou "" para desligar


def _hhmm(value: str) -> tuple[int, int] | None:
    m = re.fullmatch(r"([01]?\d|2[0-3]):([0-5]\d)", (value or "").strip())
    return (int(m[1]), int(m[2])) if m else None


class BriefingSkill(Skill):
    name = "briefing"
    description = "Briefing de notícias"

    def __init__(self, ctx):
        super().__init__(ctx)
        self._http: httpx.AsyncClient | None = None
        self.running: dict | None = None
        self._store_lock = asyncio.Lock()  # busca automática e "adicionar feed" não gravam ao mesmo tempo
        self._spoken: set[int] = set()  # já lidos por voz nesta conversa ("mais notícias")
        self.config_path = ctx.settings.data_dir / "briefing.json"

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"User-Agent": BROWSER_UA})
        return self._http

    @http.setter
    def http(self, client: httpx.AsyncClient) -> None:
        self._http = client

    # ---------- configuração ----------

    def config(self) -> dict:
        try:
            return json.loads(self.config_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def save_config(self, **values) -> None:
        cfg = self.config() | values
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.config_path.write_text(json.dumps(cfg), encoding="utf-8")

    # ---------- ciclo de vida ----------

    async def start(self) -> None:
        s = self.ctx.settings
        sch = self.ctx.scheduler
        sch.add_job(self.fetch_all, "interval", minutes=s.briefing_fetch_min, id="briefing-fetch",
                    replace_existing=True, max_instances=1, coalesce=True,
                    next_run_time=datetime.now() + timedelta(seconds=20))
        hm = _hhmm(s.briefing_summarize_at) or (5, 0)
        sch.add_job(self.summarize_pending, "cron", hour=hm[0], minute=hm[1], id="briefing-summarize",
                    replace_existing=True, max_instances=1, coalesce=True, misfire_grace_time=3600)
        sch.add_job(self.cleanup, "cron", hour=4, minute=10, id="briefing-cleanup", replace_existing=True)
        self._schedule_morning()

    async def stop(self) -> None:
        if self._http is not None:
            await self._http.aclose()

    def _schedule_morning(self) -> None:
        sch = self.ctx.scheduler
        hm = _hhmm(self.config().get("morning_at") or "")
        if sch.get_job("briefing-morning"):
            sch.remove_job("briefing-morning")
        if hm:
            sch.add_job(self.morning_auto, "cron", hour=hm[0], minute=hm[1], id="briefing-morning",
                        replace_existing=True, misfire_grace_time=900)

    # ---------- estado para a UI ----------

    def _counts(self) -> dict:
        with self.ctx.db.session() as s:
            unread = s.exec(select(func.count()).select_from(Article).where(Article.read == False)).one()  # noqa: E712
            pending = s.exec(select(func.count()).select_from(Article)
                             .where(Article.summary_status == "pending")).one()
            feeds = s.exec(select(func.count()).select_from(Feed)).one()
            last = s.exec(select(func.max(Feed.last_fetch))).one()
        return {"unread": unread, "pending_summaries": pending, "feeds": feeds, "last_fetch": ms(last)}

    def snapshot(self) -> dict:
        return {"briefing": {**self._counts(), "running": self.running,
                             "morning_at": self.config().get("morning_at") or None,
                             "summarize_at": self.ctx.settings.briefing_summarize_at,
                             "top": self.items(view="new", limit=5)}}

    async def push(self) -> None:
        await self.ctx.hub.broadcast("briefing", self.snapshot())

    def _public(self, a: Article, feed: Feed | None) -> dict:
        if a.summary:
            summary, kind = a.summary, "llm"
        else:
            summary, kind = sentences(a.excerpt or a.text, 2), "trecho"
        return {"id": a.id, "feed_id": a.feed_id, "feed": feed.title if feed else "", "title": a.title,
                "url": a.url, "published": ms(a.published), "summary": summary, "summary_kind": kind,
                "read": a.read, "starred": a.starred}

    def items(self, view: str = "new", days: int = 3, limit: int = 100, feed_id: int | None = None) -> list[dict]:
        with self.ctx.db.session() as s:
            q = select(Article, Feed).join(Feed, Feed.id == Article.feed_id)
            if view == "new":
                q = q.where(Article.read == False)  # noqa: E712
            elif view == "starred":
                q = q.where(Article.starred == True)  # noqa: E712
            if view != "starred":
                q = q.where(Article.published >= datetime.now() - timedelta(days=days))
            if feed_id:
                q = q.where(Article.feed_id == feed_id)
            rows = s.exec(q.order_by(col(Article.published).desc()).limit(limit)).all()
            return [self._public(a, f) for a, f in rows]

    def feeds(self) -> list[dict]:
        with self.ctx.db.session() as s:
            unread = dict(s.exec(select(Article.feed_id, func.count()).where(Article.read == False)  # noqa: E712
                                 .group_by(Article.feed_id)).all())
            return [f.public(unread.get(f.id, 0)) for f in s.exec(select(Feed).order_by(Feed.title)).all()]

    # ---------- feeds ----------

    async def _get(self, url: str) -> httpx.Response:
        r = await self.http.get(url)
        r.raise_for_status()
        return r

    async def add_feed(self, url: str, title: str | None = None) -> Feed:
        url = url.strip()
        if not re.match(r"https?://", url):
            url = "https://" + url
        try:
            r = await self._get(url)
        except httpx.HTTPError as e:
            raise ValueError(f"Não consegui abrir esse endereço ({e.__class__.__name__}).") from e
        feed_url, parsed = str(r.url), parse_feed(r.content, str(r.url))
        if parsed is None or not parsed["entries"]:
            candidates = discover(r.text, str(r.url))
            for cand in candidates[:3]:
                try:
                    rr = await self._get(cand)
                except httpx.HTTPError:
                    continue
                parsed = parse_feed(rr.content, str(rr.url))
                if parsed and parsed["entries"]:
                    feed_url = str(rr.url)
                    break
            else:
                raise ValueError("Não achei um feed RSS nesse endereço. Tente o link do feed (geralmente termina em /feed ou .xml).")
        with self.ctx.db.session() as s:
            if s.exec(select(Feed).where(Feed.url == feed_url)).first():
                raise ValueError("Esse feed já está na lista.")
            title = (title or "").strip() or parsed["title"] or re.sub(r"^https?://(www\.)?", "", feed_url).split("/")[0]
            feed = Feed(url=feed_url, title=title, site=parsed["site"] or url, last_fetch=datetime.now())
            s.add(feed)
            s.commit()
            s.refresh(feed)
        await self._store(feed, parsed["entries"])
        await self.push()
        return feed

    async def fetch_all(self) -> None:
        if self.running:
            return
        with self.ctx.db.session() as s:
            feeds = s.exec(select(Feed).where(Feed.active == True)).all()  # noqa: E712
        if not feeds:
            return
        self.running = {"stage": "buscando", "done": 0, "total": len(feeds)}
        await self.push()
        try:
            for f in feeds:
                await self.fetch_feed(f)
                self.running["done"] += 1
                await self.push()
        finally:
            self.running = None
            await self.push()

    async def fetch_feed(self, feed: Feed) -> int:
        error, added = None, 0
        try:
            r = await self._get(feed.url)
            parsed = parse_feed(r.content, str(r.url))
            if parsed is None:
                raise ValueError("o endereço não devolveu um feed")
            added = await self._store(feed, parsed["entries"])
        except Exception as e:
            log.warning("feed %s: %r", feed.url, e)
            error = "Não consegui ler o feed agora." if isinstance(e, httpx.HTTPError) else "Falha ao processar o feed."
        with self.ctx.db.session() as s:
            f = s.get(Feed, feed.id)
            if f:
                f.last_fetch, f.last_error = datetime.now(), error
                s.add(f)
                s.commit()
        return added

    async def _store(self, feed: Feed, entries: list[dict]) -> int:
        """Guarda os itens novos (os mais recentes, até o limite) com o texto extraído da página."""
        async with self._store_lock:
            return await self._store_locked(feed, entries)

    async def _store_locked(self, feed: Feed, entries: list[dict]) -> int:
        s_ = self.ctx.settings
        with self.ctx.db.session() as s:
            known = set(s.exec(select(Article.guid).where(Article.feed_id == feed.id)).all())
            newest = s.exec(select(func.max(Article.published)).where(Article.feed_id == feed.id)).one()
            first_time = not known
        # só o que saiu depois da última notícia guardada (sem ir buscando o acervo antigo aos poucos)
        cutoff = datetime.now() - timedelta(days=3)
        if newest:
            cutoff = max(cutoff, newest - timedelta(hours=1))
        new, seen = [], set(known)
        for e in entries:
            if e["guid"] not in seen and (first_time or e["published"] >= cutoff):
                seen.add(e["guid"])
                new.append(e)
        new = new[: s_.briefing_max_per_feed]
        if not new:
            return 0
        sem = asyncio.Semaphore(3)

        async def full_text(e: dict) -> str:
            if len(e["excerpt"]) > 1500:  # o feed já traz o texto inteiro
                return e["excerpt"]
            async with sem:
                try:
                    r = await self._get(e["url"])
                except httpx.HTTPError:
                    return ""
                return await asyncio.to_thread(extract, r.text, e["url"])

        texts = await asyncio.gather(*(full_text(e) for e in new))
        with self.ctx.db.session() as s:
            for e, text in zip(new, texts):
                s.add(Article(feed_id=feed.id, guid=e["guid"], url=e["url"], title=e["title"],
                              published=e["published"], excerpt=e["excerpt"], text=text[:12000]))
            s.commit()
        return len(new)

    async def cleanup(self) -> None:
        limit = datetime.now() - timedelta(days=self.ctx.settings.briefing_keep_days)
        with self.ctx.db.session() as s:
            s.exec(delete(Article).where(Article.published < limit, Article.starred == False))  # noqa: E712
            s.commit()
        await self.push()

    # ---------- resumos ----------

    async def summarize_pending(self, limit: int | None = None) -> int:
        llm = self.ctx.llm
        if self.running or llm is None or not llm.enabled:
            return 0
        if not llm.reachable:
            await llm.refresh()
        if not llm.ready:
            log.info("briefing: LLM indisponível, resumos ficam para depois")
            return 0
        keep = datetime.now() - timedelta(days=self.ctx.settings.briefing_keep_days)
        with self.ctx.db.session() as s:
            ids = s.exec(select(Article.id).where(Article.summary_status == "pending", Article.published >= keep)
                         .order_by(col(Article.published).desc())).all()
        ids = ids[: limit or self.ctx.settings.briefing_summarize_max]
        if not ids:
            return 0
        self.running = {"stage": "resumindo", "done": 0, "total": len(ids)}
        await self.push()
        done = 0
        try:
            for aid in ids:
                while llm.batch_should_yield():
                    await asyncio.sleep(1)
                with self.ctx.db.session() as s:
                    a = s.get(Article, aid)
                if a is None or a.summary_status != "pending":
                    continue
                source = a.text if len(a.text) >= len(a.excerpt) else a.excerpt
                if len(source) < 280:
                    status, summary = "skip", None  # o trecho do feed já é curto o bastante
                else:
                    try:
                        summary = await llm.generate(SUMMARY_PROMPT.format(title=a.title, text=source[:4500]),
                                                     max_tokens=180, label="resumo")
                        summary = tidy(summary)
                        status = "done" if summary else "error"
                    except LLMUnavailable as e:
                        log.warning("briefing: parei de resumir: %s", e)
                        break
                with self.ctx.db.session() as s:
                    a = s.get(Article, aid)
                    if a:
                        a.summary, a.summary_status = summary or None, status
                        s.add(a)
                        s.commit()
                done += 1
                self.running["done"] += 1
                await self.push()
        finally:
            self.running = None
            await self.push()
        return done

    # ---------- voz ----------

    def _mark_read(self, ids: list[int]) -> None:
        with self.ctx.db.session() as s:
            for a in s.exec(select(Article).where(col(Article.id).in_(ids))).all():
                a.read = True
                s.add(a)
            s.commit()

    def _say_items(self, items: list[dict]) -> str:
        parts, last_feed = [], None
        for it in items:
            first = sentences(it["summary"], 1, 240) if it["summary"] else ""
            head = f"{it['feed']}: " if it["feed"] != last_feed else ""  # o nome do site só quando muda
            parts.append(f"{head}{it['title'].rstrip('.')}. {first}".strip())
            last_feed = it["feed"]
        return " ".join(parts)

    @intent(
        "briefing.news",
        patterns=[r"\b(quais|me da|me de|me conta|me fala|le|leia|ler|ouvir|tem|alguma|algumas) (sao )?(as |alguma |algumas )?(ultimas )?noticias\b",
                  r"^(as )?noticias( de hoje)?$", r"\bnovidades (dos|nos) (meus )?(blogs|feeds|sites)\b",
                  r"\bo que (tem|ha) de novo (nos|dos) (blogs|feeds|sites)\b"],
        examples=["quais as notícias?", "mais notícias"],
        priority=7,
    )
    async def news_intent(self, slots: dict) -> Reply:
        return await self._news(first=True)

    @intent("briefing.more", patterns=[r"^(mais|outras|proximas?) noticias?$", r"\b(continua|segue) (as )?noticias\b"],
            priority=7)
    async def more_intent(self, slots: dict) -> Reply:
        return await self._news(first=False)

    async def _news(self, first: bool) -> Reply:
        if first:
            self._spoken.clear()
        if not self._counts()["feeds"]:
            return Reply("Você ainda não escolheu nenhum feed. Adicione seus blogs na aba Briefing.")
        fresh = [i for i in self.items(view="new", days=2) if i["id"] not in self._spoken]
        if not fresh:
            return Reply("Nenhuma novidade nos seus feeds." if first else "Acabaram as novidades.")
        batch = fresh[:3]
        self._spoken.update(i["id"] for i in batch)
        self._mark_read([i["id"] for i in batch])
        rest = len(fresh) - len(batch)
        head = f"Tem {len(fresh)} novidade{'s' if len(fresh) > 1 else ''}. " if first else ""
        tail = f" Tem mais {rest}; diga \"mais notícias\" para continuar." if rest else ""
        await self.push()
        return Reply(head + self._say_items(batch) + tail,
                     display="\n".join(f"• {i['title']} — {i['feed']}" for i in batch) + (f"\n+{rest} na aba Briefing" if rest else ""),
                     data={"briefing": batch})

    async def _speech(self, name: str, slots: dict | None = None) -> str | None:
        it = self.ctx.registry.get(name)
        if it is None:
            return None
        try:
            return (await it.handler(slots or {})).speech
        except Exception:
            log.exception("briefing: falha em %s", name)
            return None

    async def day_summary(self) -> str:
        now = datetime.now()
        greet = "Bom dia" if now.hour < 12 else "Boa tarde" if now.hour < 18 else "Boa noite"
        parts = [f"{greet}!"]
        if date := await self._speech("clock.date"):
            parts.append(date)
        google = self.ctx.skill("google")
        google_ok = bool(google and google.account.configured and google.account.connected)
        if google_ok and (agenda := await self._speech("calendar.day", {"day": "hoje"})):
            parts.append(agenda)
        meds = self.ctx.skill("remédios")
        if meds and meds.today():
            if s := await self._speech("meds.status"):
                parts.append("Remédios. " + s.removeprefix("Hoje: "))
        habits = await self._speech("habit.pending")
        if habits and not habits.startswith("Você ainda não cadastrou"):
            parts.append("Hábitos: " + habits[0].lower() + habits[1:] if habits.startswith("Faltam") else habits)
        if google_ok:
            tasks = self.ctx.skill("tarefas")
            ts = tasks.tasks() if tasks else []
            if ts:
                late = [t for t in ts if t["due"] and t["due"] < now.date().isoformat()]
                parts.append(f"Você tem {len(ts)} tarefa{'s' if len(ts) > 1 else ''} na lista"
                             + (f", {len(late)} atrasada{'s' if len(late) > 1 else ''}." if late else "."))
            gmail = self.ctx.skill("e-mail")
            n = (gmail.data.get("important") if gmail else None) or 0
            if gmail and gmail.data.get("messages"):
                parts.append(f"E {n} e-mail{'s' if n > 1 else ''} não lido{'s' if n > 1 else ''} na caixa principal.")
        news = self.items(view="new", days=1)
        if news:
            parts.append(f"Nos seus feeds tem {len(news)} novidade{'s' if len(news) > 1 else ''}; "
                         f"a mais recente: {news[0]['title'].rstrip('.')}. Diga \"quais as notícias\" para ouvir.")
        return " ".join(parts)

    @intent(
        "briefing.day",
        patterns=[r"^(fala mano )?bom dia\b", r"^boa (tarde|noite)$", r"\b(meu )?briefing( do dia| de hoje)?$",
                  r"\bresumo do (meu )?dia\b", r"\bcomo (esta|ta|vai ser) (o )?meu dia\b"],
        examples=["bom dia", "como está meu dia?"],
        priority=5,
    )
    async def day_intent(self, slots: dict) -> Reply:
        return Reply(await self.day_summary())

    async def morning_auto(self) -> None:
        text = await self.day_summary()
        await self.ctx.notify(text, title="Bom dia", toast=False)

    # ---------- API ----------

    def router(self) -> APIRouter:
        r = APIRouter(prefix="/api/briefing", tags=["briefing"])

        @r.get("")
        async def listing(view: str = "new", days: int = 3, feed: int | None = None):
            return {"items": self.items(view=view, days=days, feed_id=feed), "feeds": self.feeds()}

        @r.get("/suggestions")
        async def suggestions():
            have = {f["url"] for f in self.feeds()}
            return [x for x in SUGGESTIONS if x["url"] not in have]

        @r.post("/feeds")
        async def add(body: FeedIn):
            try:
                feed = await self.add_feed(body.url, body.title)
            except ValueError as e:
                raise HTTPException(400, str(e)) from e
            return feed.public()

        @r.patch("/feeds/{fid}")
        async def patch_feed(fid: int, body: FeedPatch):
            with self.ctx.db.session() as s:
                f = s.get(Feed, fid)
                if not f:
                    raise HTTPException(404)
                if body.active is not None:
                    f.active = body.active
                if body.title:
                    f.title = body.title.strip()
                s.add(f)
                s.commit()
            await self.push()
            return {"ok": True}

        @r.delete("/feeds/{fid}")
        async def remove(fid: int):
            with self.ctx.db.session() as s:
                s.exec(delete(Article).where(Article.feed_id == fid))
                s.exec(delete(Feed).where(Feed.id == fid))
                s.commit()
            await self.push()
            return {"ok": True}

        @r.post("/refresh")
        async def refresh(tasks: BackgroundTasks):
            if self.running:
                raise HTTPException(409, "Já estou trabalhando nisso.")
            tasks.add_task(self.fetch_all)
            return {"ok": True}

        @r.post("/summarize")
        async def summarize(tasks: BackgroundTasks, limit: int | None = None):
            if self.running:
                raise HTTPException(409, "Já estou trabalhando nisso.")
            if not (self.ctx.llm and self.ctx.llm.ready):
                raise HTTPException(400, "O modelo local não está disponível (veja Ajustes).")
            tasks.add_task(self.summarize_pending, limit)
            return {"ok": True}

        @r.post("/items/{aid}")
        async def patch_item(aid: int, body: ItemPatch):
            with self.ctx.db.session() as s:
                a = s.get(Article, aid)
                if not a:
                    raise HTTPException(404)
                if body.read is not None:
                    a.read = body.read
                if body.starred is not None:
                    a.starred = body.starred
                s.add(a)
                s.commit()
            await self.push()
            return {"ok": True}

        @r.post("/read-all")
        async def read_all(body: ReadAllIn):
            with self.ctx.db.session() as s:
                q = select(Article).where(Article.read == False)  # noqa: E712
                if body.ids:
                    q = q.where(col(Article.id).in_(body.ids))
                for a in s.exec(q).all():
                    a.read = True
                    s.add(a)
                s.commit()
            await self.push()
            return {"ok": True}

        @r.post("/config")
        async def set_config(body: ConfigIn):
            value = (body.morning_at or "").strip()
            if value and not _hhmm(value):
                raise HTTPException(400, "Use o formato HH:MM.")
            self.save_config(morning_at=value or None)
            self._schedule_morning()
            await self.push()
            return {"ok": True}

        @r.get("/day")
        async def day():
            return {"text": await self.day_summary()}

        return r
