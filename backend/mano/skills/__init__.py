from .alerts import AlertSkill
from .briefing import BriefingSkill
from .clock import ClockSkill
from .google import CalendarSkill, GmailSkill, GoogleSkill, TasksSkill
from .habits import HabitSkill
from .help import HelpSkill
from .llm import LLMSkill
from .meds import MedSkill
from .notes import NotesSkill
from .reminders import ReminderSkill
from .search import SearchSkill
from .spotify import SpotifySkill
from .timers import TimerSkill
from .youtube import YouTubeSkill

# Ordem de carregamento (e da lista de ajuda). Novas skills entram aqui.
ALL_SKILLS = [
    ClockSkill, TimerSkill, ReminderSkill, MedSkill, HabitSkill,
    GoogleSkill, CalendarSkill, TasksSkill, GmailSkill, NotesSkill,
    SpotifySkill, YouTubeSkill, SearchSkill, BriefingSkill, LLMSkill,
    AlertSkill, HelpSkill,
]
