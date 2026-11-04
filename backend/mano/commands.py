"""Ponto único de entrada de comandos (texto digitado, voz ou botão)."""

import logging

from .context import Ctx
from .intents.registry import Reply
from .models import CommandLog

log = logging.getLogger(__name__)

NOT_UNDERSTOOD = "Não entendi. Diga \"o que você sabe fazer\" para ver os comandos."


async def handle_command(ctx: Ctx, text: str, *, source: str = "text", speak: bool = True) -> dict:
    match = ctx.registry.parse(text)
    if match is None:
        reply, intent_name = Reply(NOT_UNDERSTOOD), None
    else:
        intent_name = match.intent.name
        try:
            reply = await match.intent.handler(match.slots)
        except Exception:
            log.exception("erro no intent %s", intent_name)
            reply = Reply("Deu um erro ao fazer isso. Dá uma olhada no log.")

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
