"""Ponto único de entrada de comandos (texto digitado, voz ou botão)."""

import logging

from .context import Ctx
from .intents.registry import Match, Reply
from .llm import LLMUnavailable
from .models import CommandLog

log = logging.getLogger(__name__)

NOT_UNDERSTOOD = "Não entendi. Diga \"o que você sabe fazer\" para ver os comandos."


async def _llm_guess(ctx: Ctx, text: str, speak: bool) -> tuple[Match | None, str | None]:
    """Pede ao LLM local para reescrever a frase num comando conhecido."""
    fb = ctx.fallback
    if fb is None or not ctx.llm.ready or not ctx.llm.fallback_enabled or len(text.split()) < 2:
        return None, None
    if ctx.llm.busy:
        log.info("LLM ocupado (%s); o comando espera na frente da fila", ctx.llm.busy)
    if speak:
        ctx.speaker.say("Deixa eu pensar.")
    before = ctx.voice_state
    ctx.set_voice_state("thinking")
    try:
        cmd = await fb.rewrite(text, ctx.settings.llm_fallback_timeout_s)
    except LLMUnavailable as e:
        log.warning("plano B pelo LLM falhou: %s", e)
        return None, None
    finally:
        if before != "thinking":  # comando digitado: o orbe volta ao que era (a voz cuida do próprio estado)
            ctx.set_voice_state(before)
    if not cmd:
        return None, None
    match = ctx.registry.parse(cmd)
    log.info("LLM: %r -> %r -> %s", text, cmd, match.intent.name if match else None)
    return match, cmd


async def handle_command(ctx: Ctx, text: str, *, source: str = "text", speak: bool = True) -> dict:
    match = ctx.registry.parse(text)
    via_llm = None
    if match is None:
        match, via_llm = await _llm_guess(ctx, text, speak)
    if match is None:
        reply, intent_name = Reply(NOT_UNDERSTOOD), None
    else:
        intent_name = match.intent.name
        try:
            reply = await match.intent.handler(match.slots)
        except Exception:
            log.exception("erro no intent %s", intent_name)
            reply = Reply("Deu um erro ao fazer isso. Dá uma olhada no log.")
        if via_llm:
            reply.data = {**(reply.data or {}), "understood_as": via_llm}

    with ctx.db.session() as s:
        entry = CommandLog(source=source, text=text, intent=intent_name, reply=reply.display or reply.speech)
        s.add(entry)
        s.commit()
        s.refresh(entry)

    result = {
        "intent": intent_name,
        "speech": reply.speech,
        "display": reply.display or reply.speech,
        "data": reply.data,
        "log": entry.public(),
    }
    await ctx.hub.broadcast("reply", result)
    if speak:
        ctx.speaker.say(reply.speech)
    return result
