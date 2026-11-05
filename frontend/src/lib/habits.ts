import { fmtAmount, isoDay, weekdayMon0, type Habit } from "./mano";

export const KIND_LABEL: Record<Habit["kind"], string> = { check: "Sim ou não", goal: "Com meta", free: "Livre" };
export const KIND_ICON: Record<Habit["kind"], string> = { check: "check-circle", goal: "target", free: "pen" };
const DAY_SHORT = ["seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom."];

/** "meta de 3 L por dia", "livre · meta de 100 páginas por semana", "sim ou não · seg. a sex." */
export function subtitle(h: Habit) {
  const days =
    h.days.length === 7
      ? ""
      : h.days.join("") === "01234"
        ? "seg. a sex."
        : h.days.map((d) => DAY_SHORT[d]).join(", ");
  const parts: string[] = [];
  if (h.kind === "check") parts.push("sim ou não");
  else if (h.kind === "free") parts.push("livre");
  if (h.goal) parts.push(`meta de ${fmtAmount(h.goal, h.unit)} por ${h.goal_period === "week" ? "semana" : "dia"}`);
  if (days) parts.push(days);
  return parts.join(" · ");
}

export const isDailyGoal = (h: Habit) => h.kind === "goal" && !!h.goal && h.goal_period === "day";

/** Cumprido no dia? (mesma regra do backend) */
export function doneOn(h: Habit, amount: number) {
  return isDailyGoal(h) ? amount >= (h.goal ?? 0) : amount > 0;
}

/** Os últimos `n` dias, do mais antigo para hoje. */
export function lastDays(n: number, today = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - (n - 1 - i));
    return d;
  });
}

/** Segunda a domingo da semana de hoje. */
export function thisWeek(today = new Date()) {
  const monday = new Date(today);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - weekdayMon0(monday));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export const amountOn = (h: Habit, d: Date) => h.amounts[isoDay(d)] ?? 0;
export const scheduledOn = (h: Habit, d: Date) => h.days.includes(weekdayMon0(d));

/** Quanto deveria estar feito a esta hora, se o hábito tem meta diária e cobrança em janela. */
export function pace(h: Habit, now: Date): number | null {
  if (!isDailyGoal(h) || h.reminder.mode !== "interval") return null;
  const mins = (s: string) => {
    const [a, b] = s.split(":").map(Number);
    return a * 60 + b;
  };
  const start = mins(h.reminder.start);
  const end = mins(h.reminder.end);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (end <= start) return null;
  const r = Math.min(1, Math.max(0, (cur - start) / (end - start)));
  return (h.goal ?? 0) * r;
}

/** Mesmas variáveis do backend, para a prévia da mensagem. */
export function renderMessage(template: string, h: { name: string; unit: string; goal: number | null }, done: number, fraction: number | null) {
  const goal = h.goal ?? 0;
  const values: Record<string, string> = {
    nome: h.name || "Hábito",
    feito: fmtAmount(done, h.unit),
    meta: goal ? fmtAmount(goal, h.unit) : "",
    faltam: goal ? fmtAmount(Math.max(0, goal - done), h.unit) : "",
    "fração": fraction ? fmtAmount(fraction, h.unit) : "",
    fracao: fraction ? fmtAmount(fraction, h.unit) : "",
  };
  return template.replace(/\{([^}]+)\}/g, (m, k) => values[k] ?? m).replace(/\s+/g, " ").trim();
}

export function suggestFraction(goal: number | null, unit: string, start: string, end: string, every: number) {
  if (!goal) return null;
  const mins = (s: string) => {
    const [a, b] = s.split(":").map(Number);
    return a * 60 + b;
  };
  const slots = Math.max(1, Math.floor((mins(end) - mins(start)) / Math.max(5, every)));
  const step = unit.toLowerCase() === "ml" ? 50 : 1;
  return Math.max(step, Math.round(goal / slots / step) * step);
}
