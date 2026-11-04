import re

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
        useful = [s for s in catalog if s["intents"] and s["skill"] not in (self.name, "avisos")]
        lines = [f"{s['description']}: " + "; ".join(ex for i in s["intents"] for ex in i["examples"])
                 for s in useful]
        names = [re.sub(r"\s*\(.*\)", "", s["description"]).lower() for s in useful]
        said = ", ".join(names[:-1]) + " e " + names[-1] if len(names) > 1 else "".join(names)
        return Reply(f"Eu cuido de {said}.", display="\n".join(lines), data={"catalog": catalog})
