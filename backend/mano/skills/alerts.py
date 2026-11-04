from ..intents.registry import Reply, Skill, intent


class AlertSkill(Skill):
    """ "Para" / "ok" dispensa o que estiver tocando (timers, lembretes). Remédio exige "tomei"."""

    name = "avisos"
    description = "Avisos"

    @intent(
        "alerts.dismiss",
        patterns=[r"^(para|pare|chega|ok|okay|silencio|desliga|beleza|valeu|ja vi|entendi|obrigado|obrigada)$",
                  r"^(para|pare|desliga|silencia)( o| os)? (alarme|alarmes|aviso|avisos|lembrete)$"],
        examples=["para (quando algo está tocando)"],
        priority=30,
    )
    async def dismiss(self, slots: dict) -> Reply:
        n = 0
        for skill in self.ctx.registry.skills:
            n += await skill.dismiss_alerts()
        return Reply("Beleza." if n else "Não tem nada tocando.")
