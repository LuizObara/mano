from ..intents.registry import Reply, Skill, intent


class HelpSkill(Skill):
    name = "ajuda"
    description = "Lista o que o Mano sabe fazer"

    @intent(
        "help",
        patterns=[r"\b(o )?que (voce|vc) (sabe|pode|consegue) fazer\b", r"^ajuda$", r"\bcomandos\b"],
        examples=["o que você sabe fazer?"],
    )
    async def help(self, slots: dict) -> Reply:
        catalog = self.ctx.registry.catalog()
        lines = [f"{s['description']}: " + "; ".join(ex for i in s["intents"] for ex in i["examples"])
                 for s in catalog if s["intents"]]
        names = ", ".join(s["description"].lower() for s in catalog if s["skill"] != self.name)
        return Reply(f"Por enquanto eu cuido de {names}.", display="\n".join(lines), data={"catalog": catalog})
