from .clock import ClockSkill
from .help import HelpSkill
from .timers import TimerSkill

# Ordem de carregamento. Novas skills entram aqui.
ALL_SKILLS = [ClockSkill, TimerSkill, HelpSkill]
