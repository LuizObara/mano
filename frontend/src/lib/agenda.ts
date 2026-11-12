/**
 * Agenda, Tarefas e Calendário: datas em dias ISO (yyyy-mm-dd, horário local) e as chamadas que os três
 * módulos usam. Toda escrita volta pelo WebSocket (o backend atualiza agenda/tarefas depois de gravar),
 * então os painéis do Início e a aba Calendário ficam sempre iguais.
 */
import { api, isoDay, type CalEvent } from "./mano";

export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const WD_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const WD_LONG = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** "2026-11-11" → Date local à meia-noite. */
export function parseDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number) {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

/** a − b, em dias. */
export const diffDays = (a: string, b: string) => Math.round((parseDay(a).getTime() - parseDay(b).getTime()) / 86400000);

/** "Hoje", "Amanhã", "Ontem", "Em 5 dias", "Há 3 dias". */
export function relDay(iso: string, today: string) {
  const n = diffDays(iso, today);
  if (n === 0) return "Hoje";
  if (n === 1) return "Amanhã";
  if (n === -1) return "Ontem";
  return n > 0 ? `Em ${n} dias` : `Há ${-n} dias`;
}

/** "Quarta, 11 de novembro". */
export function longDay(iso: string) {
  const d = parseDay(iso);
  return `${WD_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "11/11". */
export const shortDay = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

export type DueTone = "late" | "today" | "soon" | "far" | "none";

/** Texto e tom do chip de data de uma tarefa. */
export function dueLabel(due: string | null, today: string): { label: string; tone: DueTone } {
  if (!due) return { label: "Sem data", tone: "none" };
  const n = diffDays(due, today);
  if (n < 0) return { label: n === -1 ? "ontem" : `há ${-n} dias`, tone: "late" };
  if (n === 0) return { label: "hoje", tone: "today" };
  if (n === 1) return { label: "amanhã", tone: "soon" };
  if (n < 7) return { label: `${WD_SHORT[parseDay(due).getDay()].toLowerCase()} ${parseDay(due).getDate()}`, tone: "soon" };
  return { label: shortDay(due), tone: "far" };
}

export const DUE_TONE: Record<DueTone, string> = {
  late: "border-alert/40 bg-alert/15 text-alert",
  today: "border-ember/45 bg-ember/15 text-accent",
  soon: "border-line text-text",
  far: "border-line text-muted",
  none: "border-line text-muted",
};

/** Eventos que tocam o dia (um evento de vários dias aparece em cada um). Dia todo primeiro. */
export function eventsOn(events: CalEvent[], iso: string) {
  const lo = parseDay(iso).getTime();
  const hi = parseDay(addDays(iso, 1)).getTime();
  return events
    .filter((e) => e.start < hi && e.end > lo)
    .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start - b.start);
}

export const evColor = (e: { color?: string | null }) => e.color || "var(--color-ember)";

/** Abre a aba Calendário já no dia. */
export const goDay = (iso: string) => {
  location.hash = `/calendario?d=${iso}`;
};

/** Dia pedido na URL (#/calendario?d=2026-11-11), se houver. */
export function hashDay(): string | null {
  const q = location.hash.split("?")[1];
  const d = q ? new URLSearchParams(q).get("d") : null;
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

export const tasksApi = {
  add: (title: string, due: string | null = null) => api("/api/tasks", { title, due }),
  update: (id: string, patch: { title?: string; due?: string | null; notes?: string }) => api(`/api/tasks/${id}`, patch, "PATCH"),
  remove: (id: string) => api(`/api/tasks/${id}`, undefined, "DELETE"),
  complete: (id: string) => api(`/api/tasks/${id}/complete`, {}),
  reopen: (id: string) => api(`/api/tasks/${id}/reopen`, {}),
};

export type EventBody = {
  title: string;
  day: string;
  all_day: boolean;
  start?: string; // "2026-11-11T14:00:00", sem fuso (horário local)
  minutes: number;
  calendar_id?: string;
  description?: string;
  meet?: boolean;
};

const calQ = (e: CalEvent) => `?calendar=${encodeURIComponent(e.calendar_id ?? "primary")}`;

export const eventsApi = {
  create: (body: EventBody) => api<{ id: string }>("/api/calendar/events", body),
  update: (e: CalEvent, patch: Partial<EventBody>) => api(`/api/calendar/events/${encodeURIComponent(e.id)}${calQ(e)}`, patch, "PATCH"),
  remove: (e: CalEvent) => api(`/api/calendar/events/${encodeURIComponent(e.id)}${calQ(e)}`, undefined, "DELETE"),
  range: (start: string, end: string) => api<{ events: CalEvent[] }>(`/api/calendar/range?start=${start}&end=${end}`),
};

export type DayNote = { date: string; path: string; text: string; exists: boolean; captures: string[]; obsidian_url: string };

export const notesApi = {
  day: (iso: string) => api<DayNote>(`/api/notes/day?date=${iso}`),
  save: (iso: string, text: string) => api<DayNote>("/api/notes/day", { day: iso, text }, "PUT"),
  days: (month: string) => api<string[]>(`/api/notes/days?month=${month}`),
};

/** "em 25 min", "em 2 h 10", "agora". */
export function untilLabel(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `em ${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}`;
}
