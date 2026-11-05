import { useEffect, useState } from "react";
import { Icon } from "../components/ui";
import { HabitConfig } from "./HabitConfig";
import { HabitDetail } from "./HabitDetail";
import {
  KIND_ICON,
  amountOn,
  doneOn,
  isDailyGoal,
  lastDays,
  pace,
  scheduledOn,
  subtitle,
  thisWeek,
} from "../lib/habits";
import { api, fmtAmount, hhmm, isoDay, useNow, weekdayMon0, type Habit, type Mano } from "../lib/mano";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

/** #/habitos, #/habitos?h=3[&dia=2026-11-03], #/habitos?editar=3, #/habitos?novo=1 */
function useHabitRoute() {
  const read = () => new URLSearchParams(location.hash.split("?")[1] ?? "");
  const [q, setQ] = useState(read);
  useEffect(() => {
    const on = () => setQ(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return q;
}

export const habitLink = (params = "") => `#/habitos${params ? `?${params}` : ""}`;

export function HabitsPage({ mano }: { mano: Mano }) {
  const q = useHabitRoute();
  const id = Number(q.get("h") ?? q.get("editar"));
  const habit = mano.habits.find((h) => h.id === id);
  if (q.get("novo")) return <HabitConfig habit={null} />;
  if (q.get("editar") && habit) return <HabitConfig habit={habit} />;
  if (q.get("h") && habit) return <HabitDetail habit={habit} day={q.get("dia")} />;
  return <Overview mano={mano} />;
}

export function HabitIcon({ h, size = "size-9" }: { h: Habit; size?: string }) {
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-xl bg-ink text-accent`}>
      {h.icon ? <span className="text-lg leading-none">{h.icon}</span> : <Icon name={KIND_ICON[h.kind]} className="size-5" />}
    </span>
  );
}

function Overview({ mano }: { mano: Mano }) {
  const now = new Date(useNow(30_000));
  const today = mano.habits.filter((h) => h.today_scheduled);
  const done = today.filter((h) => h.done_today).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[44px] font-medium leading-none">Hábitos</h1>
          <span className="text-muted first-letter:uppercase">
            {dateFmt.format(now)}
            {today.length > 0 && (
              <>
                {" · "}
                <strong className="font-semibold text-text">
                  {done} de {today.length}
                </strong>{" "}
                cumpridos hoje
              </>
            )}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <PauseButton until={mano.habitsPausedUntil} />
          <a
            href={habitLink("novo=1")}
            className="flex min-h-11 items-center gap-2 rounded-full bg-ember pl-4 pr-5 font-semibold text-on-ember"
          >
            <Icon name="plus" className="size-[18px]" />
            Novo hábito
          </a>
        </div>
      </div>

      {mano.habitsPausedUntil && mano.habitsPausedUntil > Date.now() && (
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-text px-5 py-3.5 text-ink">
          <span className="min-w-0 flex-[1_1_300px] text-[15px]">
            Nenhum hábito vai te cobrar até <strong>{untilText(mano.habitsPausedUntil)}</strong>. Remédios continuam avisando
            normalmente.
          </span>
          <button
            onClick={() => api("/api/habits/pause", { minutes: 0 })}
            className="min-h-10 rounded-full bg-glow px-4 text-sm font-semibold text-on-ember"
          >
            Retomar agora
          </button>
        </div>
      )}

      {mano.habits.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line p-10 text-center">
          <p className="font-display text-2xl">Nenhum hábito ainda.</p>
          <p className="max-w-md text-muted">
            Crie um sim/não (exercício), um com meta (3 L de água por dia) ou um livre (páginas lidas). O Mano pode te cobrar
            sem encher o saco.
          </p>
          <a href={habitLink("novo=1")} className="mt-2 rounded-full bg-ember px-5 py-2.5 font-semibold text-on-ember">
            Criar o primeiro
          </a>
        </div>
      ) : (
        <>
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,380px),1fr))]">
            {mano.habits.map((h) => (
              <HabitCard key={h.id} h={h} now={now} />
            ))}
          </div>
          <WeekTable habits={mano.habits} />
        </>
      )}
    </div>
  );
}

function untilText(ms: number) {
  const d = new Date(ms);
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  return d.getTime() >= tomorrow.getTime() ? "amanhã" : `as ${hhmm(ms)}`;
}

function PauseButton({ until }: { until: number | null }) {
  const [open, setOpen] = useState(false);
  const paused = !!until && until > Date.now();
  const pause = (minutes: number) => {
    setOpen(false);
    api("/api/habits/pause", { minutes });
  };
  if (paused) {
    return (
      <button
        onClick={() => pause(0)}
        aria-pressed="true"
        className="flex min-h-11 items-center gap-2 rounded-full border border-text bg-text pl-3.5 pr-4 font-medium text-ink"
      >
        <Icon name="bell-off" className="size-[18px]" />
        Cobranças pausadas
      </button>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel pl-3.5 pr-4 font-medium hover:bg-soft"
      >
        <Icon name="bell" className="size-[18px]" />
        Pausar cobranças
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 flex w-52 flex-col gap-1 rounded-2xl border border-line bg-panel p-2 shadow-xl">
          {[
            [60, "Por 1 hora"],
            [120, "Por 2 horas"],
            [-1, "Até amanhã"],
          ].map(([m, label]) => (
            <button key={m} onClick={() => pause(m as number)} className="min-h-11 rounded-xl px-3 text-left hover:bg-soft">
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardHead({ h }: { h: Habit }) {
  return (
    <header className="flex items-center gap-2.5">
      <HabitIcon h={h} />
      <a href={habitLink(`h=${h.id}`)} className="flex min-w-0 flex-1 flex-col text-text">
        <h2 className="truncate font-display text-[22px] font-medium leading-tight">{h.name}</h2>
        <span className="truncate text-[13px] text-muted">{subtitle(h)}</span>
      </a>
      {h.done_today && h.kind !== "check" && (
        <span className="rounded-full bg-ok px-3 py-1 text-[13px] font-bold text-panel">{isDailyGoal(h) ? "meta batida" : "feito hoje"}</span>
      )}
      <a
        href={habitLink(`editar=${h.id}`)}
        aria-label={`Configurar ${h.name}`}
        title="Configurar"
        className="grid size-10 place-items-center rounded-xl text-muted hover:bg-soft hover:text-text"
      >
        <Icon name="gear" className="size-[18px]" />
      </a>
    </header>
  );
}

function ReminderLine({ h }: { h: Habit }) {
  const r = h.reminder;
  if (!r.enabled) return null;
  const how = r.mode === "interval" ? `a cada ${r.every} min` : `às ${r.times.join(", ")} se ainda não tiver feito`;
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-muted">
      <Icon name={h.silenced_today ? "bell-off" : "bell"} className="size-3.5" />
      {h.silenced_today
        ? "sem lembretes até amanhã"
        : h.next_reminder
          ? r.mode === "interval"
            ? `próximo lembrete às ${hhmm(h.next_reminder)} · ${how}`
            : `lembra às ${hhmm(h.next_reminder)} se ainda não tiver feito`
          : h.done_today
            ? "nada mais para cobrar hoje"
            : `lembrete ${how}`}
    </span>
  );
}

function HabitCard({ h, now }: { h: Habit; now: Date }) {
  return (
    <section className="flex flex-col gap-4 rounded-[26px] border border-line bg-panel p-5">
      <CardHead h={h} />
      {h.kind === "check" ? <CheckBody h={h} /> : isDailyGoal(h) ? <GoalBody h={h} now={now} /> : <FreeBody h={h} />}
      <ReminderLine h={h} />
    </section>
  );
}

function QuickButtons({ h, values }: { h: Habit; values: number[] }) {
  const [other, setOther] = useState<string | null>(null);
  const log = (amount: number) => api(`/api/habits/${h.id}/log`, { amount });
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((v, i) => (
        <button
          key={v}
          onClick={() => log(v)}
          className={`min-h-11 flex-[1_1_80px] rounded-full font-semibold ${
            i === 0 ? "bg-ember text-on-ember" : "border border-line bg-panel hover:bg-soft"
          }`}
        >
          +{fmtAmount(v, h.unit)}
        </button>
      ))}
      {other === null ? (
        <button
          onClick={() => setOther("")}
          className="min-h-11 flex-[1_1_70px] rounded-full border border-dashed border-line text-muted hover:bg-soft"
        >
          Outro…
        </button>
      ) : (
        <form
          className="flex flex-[1_1_160px] gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const v = parseFloat(other.replace(",", "."));
            if (v > 0) log(v);
            setOther(null);
          }}
        >
          <input
            autoFocus
            inputMode="decimal"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder={h.unit}
            aria-label={`Quantidade em ${h.unit}`}
            className="min-h-11 w-full min-w-0 rounded-full border border-line bg-ink px-4 outline-none focus:border-accent"
          />
          <button className="min-h-11 rounded-full bg-ember px-4 font-semibold text-on-ember">ok</button>
        </form>
      )}
    </div>
  );
}

function GoalBody({ h, now }: { h: Habit; now: Date }) {
  const goal = h.goal ?? 1;
  const pct = Math.min(1, h.today_amount / goal);
  const C = 2 * Math.PI * 56;
  const expected = pace(h, now);
  const quick = h.quick.length ? h.quick : [h.reminder.fraction ?? h.suggested_fraction ?? goal / 10];
  return (
    <>
      <div className="flex items-center gap-5">
        <div className="relative size-[132px] shrink-0">
          <svg viewBox="0 0 132 132" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="66" cy="66" r="56" fill="none" stroke="var(--color-soft)" strokeWidth="12" />
            <circle
              cx="66"
              cy="66"
              r="56"
              fill="none"
              stroke={h.done_today ? "var(--color-ok)" : "var(--color-ember)"}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${pct * C} ${C}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-[30px] leading-none">{fmtAmount(h.today_amount, h.unit)}</span>
            <span className="text-[13px] text-muted">de {fmtAmount(goal, h.unit)}</span>
          </div>
        </div>
        <p className="min-w-0 flex-1 text-[15px] leading-snug">
          {h.done_today ? (
            <>Meta batida hoje. 🎉</>
          ) : (
            <>
              Faltam <strong>{fmtAmount(goal - h.today_amount, h.unit)}</strong>.
              {expected !== null && expected > 0 && (
                <span className="text-muted">
                  {" "}
                  No ritmo, a esta hora seriam {fmtAmount(Math.round(expected / 50) * 50 || expected, h.unit)}.
                </span>
              )}
            </>
          )}
        </p>
      </div>
      <QuickButtons h={h} values={quick.slice(0, 3)} />
      <TodayChips h={h} />
    </>
  );
}

function TodayChips({ h }: { h: Habit }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-soft pt-3.5">
      <span className="mr-1 text-xs font-bold uppercase tracking-[0.08em] text-muted">Hoje</span>
      {h.today_logs.length === 0 && <span className="text-[13px] text-muted">nada ainda</span>}
      {h.today_logs.slice(-6).map((l) => (
        <span key={l.id ?? l.at} className="rounded-full bg-ink px-2.5 py-1 text-[13px]">
          <span className="tabular-nums text-muted">{hhmm(l.at)}</span> {fmtAmount(l.amount, h.unit)}
        </span>
      ))}
      <a href={habitLink(`h=${h.id}`)} className="ml-auto text-sm font-semibold text-accent">
        Métricas →
      </a>
    </div>
  );
}

function FreeBody({ h }: { h: Habit }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState(h.last_note);
  const recent = lastDays(8)
    .slice(0, -1)
    .reverse()
    .filter((d) => amountOn(h, d) > 0)
    .slice(0, 2);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = parseFloat(amount.replace(",", "."));
    if (!(v > 0)) return;
    api(`/api/habits/${h.id}/log`, { amount: v, note });
    setAmount("");
  };
  const weekGoal = h.goal && h.goal_period === "week" ? h.goal : null;
  return (
    <>
      <div className="flex items-end gap-5">
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">Hoje</span>
          <span className="font-display text-[44px] leading-none">
            {fmtAmount(h.today_amount, "")} <span className="text-lg text-muted">{h.unit}</span>
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-1.5">
          <span className="text-sm">
            <strong>{fmtAmount(h.week_amount, "")}</strong> {weekGoal ? `de ${fmtAmount(weekGoal, "")} ` : `${h.unit} `}nesta semana
          </span>
          {weekGoal && (
            <div className="h-2 overflow-hidden rounded-full bg-soft">
              <div className="h-full bg-ember" style={{ width: `${Math.min(100, (100 * h.week_amount) / weekGoal)}%` }} />
            </div>
          )}
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <label className="flex flex-[0_1_150px] items-center gap-1 rounded-full border border-line bg-ink px-4 focus-within:border-accent">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="quanto"
            aria-label={`Quantidade em ${h.unit}`}
            className="min-h-11 w-full min-w-0 bg-transparent outline-none"
          />
          <span className="text-sm text-muted">{h.unit}</span>
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="observação (opcional)"
          aria-label="Observação"
          className="min-h-11 min-w-0 flex-[1_1_140px] rounded-full border border-line bg-ink px-4 outline-none focus:border-accent"
        />
        <button disabled={!amount.trim()} className="min-h-11 rounded-full bg-ember px-5 font-semibold text-on-ember disabled:opacity-40">
          Registrar
        </button>
      </form>
      {h.quick.length > 0 && <QuickButtons h={h} values={h.quick.slice(0, 3)} />}
      <div className="flex flex-col gap-1.5 border-t border-soft pt-3.5 text-sm">
        {recent.map((d) => (
          <div key={isoDay(d)} className="flex gap-2.5">
            <span className="w-16 text-muted">{relDay(d)}</span>
            <span className="flex-1">{fmtAmount(amountOn(h, d), h.unit)}</span>
          </div>
        ))}
        <a href={habitLink(`h=${h.id}`)} className="self-end text-sm font-semibold text-accent">
          Métricas →
        </a>
      </div>
    </>
  );
}

function relDay(d: Date) {
  const diff = Math.round((new Date().setHours(12, 0, 0, 0) - d.getTime()) / 86400000);
  return diff === 1 ? "ontem" : d.toLocaleDateString("pt-BR", { weekday: "short" });
}

function CheckBody({ h }: { h: Habit }) {
  const toggle = () => api(`/api/habits/${h.id}/toggle`, { done: !h.done_today });
  const week = thisWeek();
  const todayKey = isoDay(new Date());
  return (
    <>
      {h.done_today ? (
        <button
          onClick={toggle}
          aria-pressed="true"
          className="flex min-h-16 items-center justify-center gap-2.5 rounded-[20px] bg-ok text-[17px] font-semibold text-panel"
        >
          <Icon name="check" className="size-[22px]" />
          Feito hoje
        </button>
      ) : (
        <button
          onClick={toggle}
          aria-pressed="false"
          disabled={!h.today_scheduled}
          className="min-h-16 rounded-[20px] border-2 border-dashed border-line text-[17px] font-semibold hover:bg-soft disabled:opacity-50"
        >
          {h.today_scheduled ? "Marcar como feito" : "Hoje não vale"}
        </button>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[15px]">
          <strong className="font-display text-[26px] font-medium">{h.streak}</strong> {h.streak === 1 ? "dia seguido" : "dias seguidos"}
          {h.best_streak > h.streak && <span className="text-muted"> · recorde {h.best_streak}</span>}
        </span>
        <div className="flex gap-1" aria-label="Esta semana">
          {week.map((d) => {
            const key = isoDay(d);
            const done = h.history.includes(key);
            const on = scheduledOn(h, d);
            return (
              <span
                key={key}
                title={d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }) + (on ? "" : ", não vale")}
                className={`grid size-6 place-items-center rounded-[7px] text-[11px] font-bold ${
                  done ? "bg-ember text-on-ember" : key === todayKey ? "border-2 border-ember" : on ? "bg-soft text-muted" : "text-line"
                }`}
              >
                {"STQQSSD"[weekdayMon0(d)]}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Hábitos × dias da semana. Clicar marca (sim/não) ou abre o dia no detalhe (quantidades). */
function WeekTable({ habits }: { habits: Habit[] }) {
  const week = thisWeek();
  const todayKey = isoDay(new Date());
  return (
    <section className="flex flex-col gap-3 rounded-[26px] border border-line bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl font-medium">Esta semana</h2>
        <span className="text-sm text-muted">clique num dia para registrar ou corrigir</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate [border-spacing:6px] text-sm">
          <thead>
            <tr className="text-xs font-bold uppercase tracking-[0.06em] text-muted">
              <th className="text-left">Hábito</th>
              {week.map((d) => (
                <th key={isoDay(d)} className={isoDay(d) === todayKey ? "text-text" : ""}>
                  {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")} {d.getDate()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => (
              <tr key={h.id}>
                <th scope="row" className="max-w-40 truncate text-left font-semibold">
                  {h.name}
                </th>
                {week.map((d) => {
                  const key = isoDay(d);
                  const future = key > todayKey;
                  const on = scheduledOn(h, d);
                  if (future || !on) {
                    return (
                      <td key={key} className="text-center text-xs text-muted/60">
                        {future ? "·" : "não vale"}
                      </td>
                    );
                  }
                  const amount = amountOn(h, d);
                  const done = doneOn(h, amount);
                  const label = h.kind === "check" ? (done ? "✓" : "—") : amount ? fmtAmount(amount, h.unit) : "—";
                  const cls = done
                    ? "bg-ember text-on-ember"
                    : amount > 0
                      ? "bg-ember-soft"
                      : key === todayKey
                        ? "border-2 border-ember"
                        : "bg-ink text-muted";
                  return (
                    <td key={key}>
                      {h.kind === "check" ? (
                        <button
                          onClick={() => api(`/api/habits/${h.id}/toggle`, { day: key, done: !done })}
                          aria-label={`${h.name}, ${key}: ${done ? "feito" : "não feito"}`}
                          className={`min-h-10 w-full rounded-[10px] font-bold hover:opacity-80 ${cls}`}
                        >
                          {label}
                        </button>
                      ) : (
                        <a
                          href={habitLink(`h=${h.id}&dia=${key}`)}
                          className={`grid min-h-10 w-full place-items-center rounded-[10px] font-semibold hover:opacity-80 ${cls}`}
                        >
                          {label}
                        </a>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
