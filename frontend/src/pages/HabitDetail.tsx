import { useEffect, useState } from "react";
import { Icon } from "../components/ui";
import { amountOn, doneOn, isDailyGoal, lastDays, scheduledOn, subtitle } from "../lib/habits";
import { api, fmtAmount, hhmm, isoDay, weekdayMon0, type Habit, type HabitLogEntry } from "../lib/mano";
import { HabitIcon, habitLink } from "./Habits";

const PERIODS = [
  [7, "7 dias"],
  [30, "30 dias"],
  [84, "12 semanas"],
] as const;
const VIA: Record<string, string> = { visor: "pelo visor", lembrete: "pelo lembrete", voz: "por voz" };
const longDate = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const short = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function HabitDetail({ habit: h, day }: { habit: Habit; day: string | null }) {
  const [period, setPeriod] = useState<number>(30);
  const [selected, setSelected] = useState(day ?? isoDay(new Date()));
  useEffect(() => {
    if (day) setSelected(day);
  }, [day]);

  const days = lastDays(period);
  const due = days.filter((d) => scheduledOn(h, d));
  const values = days.map((d) => amountOn(h, d));
  const total = values.reduce((a, b) => a + b, 0);
  const met = due.filter((d) => doneOn(h, amountOn(h, d))).length;
  let best = { v: 0, d: days[0] };
  days.forEach((d, i) => values[i] > best.v && (best = { v: values[i], d }));
  const avg = due.length ? total / due.length : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <a href={habitLink()} className="text-sm font-semibold text-accent">
            ← Hábitos
          </a>
          <div className="flex items-center gap-3.5">
            <HabitIcon h={h} size="size-13" />
            <div className="flex flex-col gap-0.5">
              <h1 className="font-display text-[44px] font-medium leading-none">{h.name}</h1>
              <span className="text-muted">{subtitle(h) || "todo dia"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Período" className="flex gap-1 rounded-full bg-soft p-1">
            {PERIODS.map(([n, label]) => (
              <button
                key={n}
                onClick={() => setPeriod(n)}
                aria-pressed={period === n}
                className={`min-h-9 rounded-full px-3.5 text-sm ${period === n ? "bg-panel font-semibold shadow-sm" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <a
            href={habitLink(`editar=${h.id}`)}
            className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel px-4 font-medium hover:bg-soft"
          >
            <Icon name="gear" className="size-4" /> Configurar
          </a>
        </div>
      </div>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))]">
        {h.kind === "check" ? (
          <>
            <Stat label="Cumpridos" value={`${met} de ${due.length}`} hint="dias em que valia" />
            <Stat label="Taxa" value={due.length ? `${Math.round((100 * met) / due.length)}%` : "—"} hint={`nos últimos ${period} dias`} />
          </>
        ) : (
          <>
            <Stat label="Média por dia" value={fmtAmount(avg, h.unit)} hint="nos dias em que vale" />
            <Stat
              label={isDailyGoal(h) ? "Meta batida" : "Dias com registro"}
              value={`${met} de ${due.length}`}
              hint={`nos últimos ${period} dias`}
            />
            <Stat label="Total" value={fmtAmount(total, h.unit)} hint={`nos últimos ${period} dias`} />
          </>
        )}
        <Stat label="Sequência" value={`${h.streak} ${h.streak === 1 ? "dia" : "dias"}`} hint={`recorde: ${h.best_streak}`} />
        {h.kind !== "check" && best.v > 0 && <Stat label="Melhor dia" value={fmtAmount(best.v, h.unit)} hint={longDate(best.d)} />}
        {h.kind !== "check" && (
          <Stat
            label="Esta semana"
            value={fmtAmount(h.week_amount, h.unit)}
            hint={h.goal ? `de ${fmtAmount(h.goal * (h.goal_period === "week" ? 1 : 7), h.unit)} até domingo` : "segunda até hoje"}
          />
        )}
      </div>

      {h.kind !== "check" && <Bars h={h} days={days} values={values} selected={selected} onPick={setSelected} />}

      <div className="flex flex-wrap items-start gap-5">
        <Logs h={h} day={selected} setDay={setSelected} />
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          <Grid h={h} selected={selected} onPick={setSelected} />
          {h.reminder.enabled && <RemindStats h={h} />}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[22px] border border-line bg-panel px-4.5 py-4">
      <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">{label}</span>
      <span className="font-display text-[32px] leading-tight">{value}</span>
      <span className="text-[13px] text-muted first-letter:uppercase">{hint}</span>
    </div>
  );
}

function Bars({
  h,
  days,
  values,
  selected,
  onPick,
}: {
  h: Habit;
  days: Date[];
  values: number[];
  selected: string;
  onPick: (d: string) => void;
}) {
  const daily = isDailyGoal(h) ? h.goal! : null;
  const top = Math.max(daily ? daily * 1.3 : 0, ...values, 1);
  const every = days.length > 40 ? 14 : days.length > 10 ? 5 : 1;
  return (
    <section className="flex flex-col gap-3 rounded-[26px] border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-medium">Por dia</h2>
        <span className="flex flex-wrap gap-3.5 text-[13px] text-muted">
          <Legend cls="bg-ember" label={daily ? "meta batida" : "com registro"} />
          {daily && <Legend cls="bg-ember/50" label="abaixo da meta" />}
          {daily && (
            <span className="flex items-center gap-1.5">
              <span className="w-4 border-t-2 border-dashed border-muted" />
              meta de {fmtAmount(daily, h.unit)}
            </span>
          )}
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-[52px_1fr] gap-2 pb-1 pt-2.5">
          <div className="relative h-52 text-right text-xs text-muted">
            <span className="absolute right-0 -top-2">{fmtAmount(top, h.unit)}</span>
            {daily && (
              <span className="absolute right-0" style={{ top: `calc(${(1 - daily / top) * 100}% - 8px)` }}>
                {fmtAmount(daily, h.unit)}
              </span>
            )}
            <span className="absolute right-0 -bottom-2">0</span>
          </div>
          <div className="relative h-52 border-b border-line">
            {daily && (
              <div
                className="absolute inset-x-0 border-t-2 border-dashed border-muted/60"
                style={{ top: `${(1 - daily / top) * 100}%` }}
              />
            )}
            <div className="absolute inset-0 flex items-end gap-[3px]">
              {days.map((d, i) => {
                const key = isoDay(d);
                const v = values[i];
                return (
                  <button
                    key={key}
                    onClick={() => onPick(key)}
                    title={`${short(d)}: ${fmtAmount(v, h.unit)}`}
                    aria-label={`${short(d)}: ${fmtAmount(v, h.unit)}`}
                    className={`min-h-1 flex-1 rounded-t-md rounded-b-sm ${
                      daily && v < daily ? "bg-ember/50" : v > 0 ? "bg-ember" : "bg-soft"
                    } ${key === selected ? "ring-2 ring-text" : ""}`}
                    style={{ height: `${Math.max(1.5, (v / top) * 100)}%` }}
                  />
                );
              })}
            </div>
          </div>
          <div />
          <div className="flex gap-[3px] text-xs text-muted">
            {days.map((d, i) => (
              <span key={isoDay(d)} className="flex-1 whitespace-nowrap text-center">
                {(days.length - 1 - i) % every === 0 ? short(d) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const Legend = ({ cls, label }: { cls: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className={`size-3 rounded-[3px] ${cls}`} />
    {label}
  </span>
);

function Logs({ h, day, setDay }: { h: Habit; day: string; setDay: (d: string) => void }) {
  const todayKey = isoDay(new Date());
  const [logs, setLogs] = useState<HabitLogEntry[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [formDay, setFormDay] = useState(day);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => setFormDay(day), [day]);
  useEffect(() => {
    if (day === todayKey) setLogs(h.today_logs);
    else api<HabitLogEntry[]>(`/api/habits/${h.id}/logs?day=${day}`).then(setLogs).catch(() => setLogs([]));
  }, [day, h, todayKey]);

  const date = new Date(`${day}T12:00:00`);
  const total = logs.reduce((a, l) => a + l.amount, 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (h.kind === "check") {
      await api(`/api/habits/${h.id}/toggle`, { day: formDay, done: true });
    } else {
      const v = parseFloat(amount.replace(",", "."));
      if (!(v > 0)) return;
      await api(`/api/habits/${h.id}/log`, { amount: v, day: formDay, note });
      setAmount("");
    }
    setDay(formDay);
  };
  const saveEdit = async (id: number) => {
    const v = parseFloat(editValue.replace(",", "."));
    if (v > 0) await api(`/api/habits/logs/${id}`, { amount: v }, "PATCH");
    setEditing(null);
  };

  return (
    <section className="flex min-w-0 flex-[1_1_460px] flex-col gap-3 rounded-[26px] border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-medium">Registros</h2>
        <span className="text-sm text-muted first-letter:uppercase">
          {day === todayKey ? "hoje" : longDate(date)}
          {h.kind !== "check" && total > 0 && ` · ${fmtAmount(total, h.unit)}`}
        </span>
      </div>
      {logs.length === 0 && <p className="text-sm text-muted">Nada registrado neste dia.</p>}
      <ul className="flex flex-col">
        {logs.map((l) => (
          <li key={l.id ?? l.at} className="flex min-h-12 items-center gap-3 border-b border-soft">
            <span className="w-13 tabular-nums text-muted">{hhmm(l.at)}</span>
            {editing === l.id && l.id !== null ? (
              <form
                className="flex flex-1 items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveEdit(l.id!);
                }}
              >
                <input
                  autoFocus
                  inputMode="decimal"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  aria-label="Nova quantidade"
                  className="min-h-9 w-24 rounded-lg border border-line bg-ink px-2 outline-none focus:border-accent"
                />
                <span className="text-sm text-muted">{h.unit}</span>
                <button className="ml-auto rounded-full bg-ember px-3 py-1 text-sm font-semibold text-on-ember">Salvar</button>
              </form>
            ) : (
              <>
                <strong className="w-24 font-semibold">{h.kind === "check" ? "feito" : fmtAmount(l.amount, h.unit)}</strong>
                <span className="min-w-0 flex-1 truncate text-[13px] text-muted">
                  {[l.note, VIA[l.via] ?? l.via].filter(Boolean).join(" · ")}
                </span>
                {h.kind !== "check" && l.id !== null && (
                  <button
                    onClick={() => {
                      setEditing(l.id);
                      setEditValue(String(l.amount).replace(".", ","));
                    }}
                    aria-label="Editar registro"
                    className="grid size-9 place-items-center rounded-lg text-muted hover:bg-soft hover:text-text"
                  >
                    <Icon name="pen" className="size-4" />
                  </button>
                )}
                <button
                  onClick={() =>
                    h.kind === "check"
                      ? api(`/api/habits/${h.id}/toggle`, { day, done: false }).then(() => setLogs([]))
                      : api(`/api/habits/logs/${l.id}`, undefined, "DELETE").then(() =>
                          setLogs((ls) => ls.filter((x) => x.id !== l.id)),
                        )
                  }
                  aria-label="Apagar registro"
                  className="grid size-9 place-items-center rounded-lg text-muted hover:bg-soft hover:text-alert"
                >
                  <Icon name="trash" className="size-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-1.5 flex flex-wrap items-end gap-2.5 rounded-[18px] bg-ink p-3.5">
        <span className="basis-full text-[13px] font-bold uppercase tracking-[0.06em] text-muted">
          {h.kind === "check" ? "Marcar um dia" : "Registrar em outro dia"}
        </span>
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Dia
          <input
            type="date"
            value={formDay}
            max={todayKey}
            onChange={(e) => setFormDay(e.target.value)}
            className="min-h-11 rounded-xl border border-line bg-panel px-2.5 text-text outline-none focus:border-accent"
          />
        </label>
        {h.kind !== "check" && (
          <>
            <label className="flex flex-col gap-1 text-[13px] text-muted">
              Quantidade ({h.unit})
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="min-h-11 w-28 rounded-xl border border-line bg-panel px-2.5 text-text outline-none focus:border-accent"
              />
            </label>
            <label className="flex min-w-0 flex-[1_1_140px] flex-col gap-1 text-[13px] text-muted">
              Observação
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-11 rounded-xl border border-line bg-panel px-2.5 text-text outline-none focus:border-accent"
              />
            </label>
          </>
        )}
        <button className="min-h-11 rounded-full bg-ember px-5 font-semibold text-on-ember">
          {h.kind === "check" ? "Marcar feito" : "Registrar"}
        </button>
      </form>
    </section>
  );
}

function Grid({ h, selected, onPick }: { h: Habit; selected: string; onPick: (d: string) => void }) {
  const today = new Date();
  const todayKey = isoDay(today);
  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - weekdayMon0(start) - 77);
  const cells = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const goal = isDailyGoal(h) ? h.goal! : null;
  return (
    <section className="flex flex-col gap-3 rounded-[26px] border border-line bg-panel p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-medium">12 semanas</h2>
        <span className="text-[13px] text-muted">clique num dia para ver os registros</span>
      </div>
      <div className="grid grid-flow-col grid-cols-12 grid-rows-7 gap-1">
        {cells.map((d) => {
          const key = isoDay(d);
          if (key > todayKey) return <span key={key} className="aspect-square" />;
          const v = amountOn(h, d);
          const on = scheduledOn(h, d);
          const r = goal ? v / goal : v > 0 ? 1 : 0;
          const cls = !on && v === 0 ? "bg-soft/40" : r >= 1 ? "bg-ember" : r >= 0.6 ? "bg-ember/60" : r > 0 ? "bg-ember/30" : "bg-soft";
          return (
            <button
              key={key}
              onClick={() => onPick(key)}
              title={`${short(d)}: ${h.kind === "check" ? (v ? "feito" : "—") : fmtAmount(v, h.unit)}`}
              aria-label={`${short(d)}: ${h.kind === "check" ? (v ? "feito" : "não feito") : fmtAmount(v, h.unit)}`}
              className={`aspect-square rounded ${cls} ${key === selected ? "ring-2 ring-text" : ""}`}
            />
          );
        })}
      </div>
    </section>
  );
}

function RemindStats({ h }: { h: Habit }) {
  const s = h.remind_today;
  return (
    <section className="flex flex-col gap-2.5 rounded-[26px] border border-line bg-panel p-5">
      <h2 className="font-display text-2xl font-medium">Cobranças de hoje</h2>
      <div className="flex flex-col gap-2 text-[15px]">
        <Row label="Lembretes enviados" value={s.sent} />
        <Row label="Respondidos no aviso" value={s.answered} />
        <Row label="Pulados porque você já tinha feito" value={s.skipped} />
        <Row label="“Agora não”" value={s.later} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
        <span>
          {h.silenced_today
            ? "Sem lembretes até amanhã."
            : h.next_reminder
              ? `Próximo às ${hhmm(h.next_reminder)}.`
              : isDailyGoal(h) && h.done_today
                ? "Meta batida: sem mais lembretes hoje."
                : "Nenhum lembrete previsto para hoje."}
        </span>
        {!h.silenced_today && (
          <button onClick={() => api(`/api/habits/${h.id}/silence`, {})} className="font-semibold text-accent">
            Silenciar até amanhã
          </button>
        )}
      </div>
    </section>
  );
}

const Row = ({ label, value }: { label: string; value: number }) => (
  <div className="flex justify-between gap-2">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);
