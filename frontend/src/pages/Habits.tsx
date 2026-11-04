import { useState } from "react";
import { Card, btn, input } from "../components/ui";
import { api, isoDay, weekdayMon0, WEEKDAYS, type Habit, type Mano } from "../lib/mano";

const DAYS_SHOWN = 35;

export function HabitsPage({ mano }: { mano: Mano }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Card
        title="Hábitos"
        action={
          !adding && (
            <button className={btn.ghost} onClick={() => setAdding(true)}>
              + Novo hábito
            </button>
          )
        }
      >
        {adding && <HabitForm onDone={() => setAdding(false)} />}
        {mano.habits.length === 0 && !adding && (
          <p className="text-sm text-muted">
            Nenhum hábito ainda. Crie um e marque pela tela ou dizendo "fala Mano, fiz exercício".
          </p>
        )}
        <ul className="flex flex-col gap-4">
          {mano.habits.map((h) => (
            <HabitRow key={h.id} h={h} />
          ))}
        </ul>
      </Card>
      <p className="px-1 text-sm text-muted">
        Clique num quadradinho para marcar ou desmarcar aquele dia. Dias fora da agenda do hábito não quebram a sequência.
      </p>
    </div>
  );
}

function HabitRow({ h }: { h: Habit }) {
  const done = new Set(h.history);
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (DAYS_SHOWN - 1) + i);
    return d;
  });
  const scheduled = (d: Date) => h.days.includes(weekdayMon0(d));
  const last7 = days.slice(-7).filter(scheduled);
  const last7done = last7.filter((d) => done.has(isoDay(d))).length;

  const remove = async () => {
    if (confirm(`Remover o hábito "${h.name}"?`)) await api(`/api/habits/${h.id}`, undefined, "DELETE");
  };

  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => api(`/api/habits/${h.id}/toggle`, { done: !h.done_today })}
          disabled={!h.today_scheduled}
          aria-pressed={h.done_today}
          aria-label={h.done_today ? `Desmarcar ${h.name} hoje` : `Marcar ${h.name} hoje`}
          className={`grid size-9 shrink-0 place-items-center rounded-xl border text-lg ${
            h.done_today ? "border-ember bg-ember text-ink" : "border-line hover:border-ember/60"
          } disabled:opacity-30`}
        >
          {h.done_today ? "✓" : h.icon || ""}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {h.icon && <span className="mr-1.5">{h.icon}</span>}
            {h.name}
          </div>
          <div className="text-sm text-muted">
            {h.days.length === 7 ? "todo dia" : h.days.map((d) => WEEKDAYS[d]).join(", ")} · semana {last7done}/{last7.length}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl tabular-nums leading-none text-ember">{h.streak}</div>
          <div className="text-xs text-muted">{h.streak === 1 ? "dia" : "dias"}</div>
        </div>
        <button className="px-1 text-muted hover:text-alert" onClick={remove} aria-label={`Remover ${h.name}`}>
          ×
        </button>
      </div>
      <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${DAYS_SHOWN}, minmax(0, 1fr))` }}>
        {days.map((d) => {
          const key = isoDay(d);
          const isDone = done.has(key);
          const on = scheduled(d);
          return (
            <button
              key={key}
              title={`${d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}${isDone ? " ✓" : ""}`}
              onClick={() => api(`/api/habits/${h.id}/toggle`, { day: key, done: !isDone })}
              className={`aspect-square rounded-sm ${
                isDone ? "bg-ember" : on ? "bg-line hover:bg-ember/40" : "bg-line/30 hover:bg-ember/30"
              }`}
              aria-label={`${key} ${isDone ? "feito" : "não feito"}`}
            />
          );
        })}
      </div>
    </li>
  );
}

function HabitForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [days, setDays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await api("/api/habits", { name, icon, days });
    onDone();
  };
  return (
    <form onSubmit={save} className="mb-4 flex flex-col gap-3 rounded-xl border border-ember/40 bg-ink/40 p-3">
      <div className="flex gap-2">
        <input className={`${input} w-16 text-center`} placeholder="🏃" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Emoji" maxLength={4} />
        <input className={`${input} flex-1`} placeholder="Nome (ex.: Exercício, Leitura, Beber água)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((w, i) => {
          const on = days.includes(i);
          return (
            <button
              type="button"
              key={w}
              aria-pressed={on}
              onClick={() => setDays(on ? days.filter((d) => d !== i) : [...days, i])}
              className={`rounded-lg px-2.5 py-1 text-sm ${on ? "bg-ember text-ink" : "border border-line text-muted"}`}
            >
              {w}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <button className={btn.primary}>Criar</button>
        <button type="button" className={btn.ghost} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
