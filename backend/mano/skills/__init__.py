from .alerts import AlertSkill
from .clock import ClockSkill
from .habits import HabitSkill
from .help import HelpSkill
from .meds import MedSkill
from .reminders import ReminderSkill
from .timers import TimerSkill

# Ordem de carregamento (e da lista de ajuda). Novas skills entram aqui.
ALL_SKILLS = [ClockSkill, TimerSkill, ReminderSkill, MedSkill, HabitSkill, AlertSkill, HelpSkill]
