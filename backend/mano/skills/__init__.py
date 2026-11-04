from .alerts import AlertSkill
from .clock import ClockSkill
from .habits import HabitSkill
from .help import HelpSkill
from .meds import MedSkill
from .reminders import ReminderSkill
from .search import SearchSkill
from .spotify import SpotifySkill
from .timers import TimerSkill
from .youtube import YouTubeSkill

# Ordem de carregamento (e da lista de ajuda). Novas skills entram aqui.
ALL_SKILLS = [
    ClockSkill, TimerSkill, ReminderSkill, MedSkill, HabitSkill,
    SpotifySkill, YouTubeSkill, SearchSkill,
    AlertSkill, HelpSkill,
]
