import { useEffect, useState } from "react";
import { api, hhmm, isoDay, useNow, weekdayMon0, type Dose, type Mano } from "../lib/mano";

const WEEKS = 12;
const ROTATE_MS = 10_000;

type Slide = "musica" | "habitos" | "remedios";
const LABEL: Record<Slide, string> = { musica: "Música", habitos: "Hábitos", remedios: "Remédios" };

/** Os últimos WEEKS×7 dias em colunas de semana (segunda a domingo), terminando na semana de hoje. */
function gridDays(today: Date): (Date | null)[][] {
  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - weekdayMon0(start) - (WEEKS - 1) * 7);
  return Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const day = new Date(start);
      day.setDate(start.getDate() + w * 7 + d);
      return day > today ? null : day;
    }),
  );
}

/** 0 = nada previsto, 1 = previsto e não feito, 2–4 = parte feita, 5 = tudo feito, -1 = esqueceu remédio. */
type Level = -1 | 0 | 1 | 2 | 3 | 4 | 5;
const CELL: Record<Level, string> = {
  [-1]: "bg-alert",
  0: "bg-deep-line/40",
  1: "bg-deep-line",
  2: "bg-glow/35",
  3: "bg-glow/60",
  4: "bg-glow/80",
  5: "bg-glow",
};
const level = (done: number, total: number): Level => {
  if (total === 0) return 0;
  if (done >= total) return 5;
  if (done === 0) return 1;
  const r = done / total;
  return r < 0.34 ? 2 : r < 0.67 ? 3 : 4;
};

function Graph({ cell }: { cell: (day: Date) => { level: Level; title: string } }) {
  const today = new Date(useNow(60_000));
  const todayKey = isoDay(today);
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
      {gridDays(today).flatMap((week) =>
        week.map((day, i) => {
          if (!day) return <span key={`f${i}${week[0]?.getTime()}`} className="aspect-square" />;
          const c = cell(day);
          return (
            <span
              key={day.getTime()}
              title={c.title}
              className={`aspect-square rounded-[3px] ${CELL[c.level]} ${isoDay(day) === todayKey ? "ring-1 ring-deep-text/70" : ""}`}
            />
          );
        }),
      )}
    </div>
  );
}

const dayLabel = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

function Habits({ mano }: { mano: Mano }) {
  const habits = mano.habits;
  const today = habits.filter((h) => h.today_scheduled);
  return (
    <>
      <Head title={`Hábitos · ${WEEKS} semanas`} stat={today.length ? `${today.filter((h) => h.done_today).length} de ${today.length} hoje` : ""} />
      <Graph
        cell={(day) => {
          const key = isoDay(day);
          const due = habits.filter((h) => h.days.includes(weekdayMon0(day)));
          const done = due.filter((h) => h.history.includes(key)).length;
          return { level: level(done, due.length), title: `${dayLabel(day)}: ${due.length ? `${done} de ${due.length}` : "nada previsto"}` };
        }}
      />
    </>
  );
}

function Meds({ mano }: { mano: Mano }) {
  const [hist, setHist] = useState<Dose[]>([]);
  useEffect(() => {
    api<Dose[]>(`/api/meds/history?days=${WEEKS * 7}`).then(setHist).catch(() => {});
  }, [mano.doses]);
  const byDay = new Map<string, Dose[]>();
  for (const d of hist) {
    const k = isoDay(new Date(d.scheduled_at));
    byDay.set(k, [...(byDay.get(k) ?? []), d]);
  }
  const closed = hist.filter((d) => d.status !== "pending");
  const pct = closed.length ? Math.round((100 * closed.filter((d) => d.status === "taken").length) / closed.length) : null;
  return (
    <>
      <Head title={`Remédios · ${WEEKS} semanas`} stat={pct === null ? "" : `${pct}% tomados`} />
      <Graph
        cell={(day) => {
          const list = byDay.get(isoDay(day)) ?? [];
          const taken = list.filter((d) => d.status === "taken").length;
          const missed = list.some((d) => d.status === "missed");
          const title = `${dayLabel(day)}: ${list.map((d) => `${hhmm(d.scheduled_at)} ${d.name}`).join(", ") || "sem dose"}`;
          return { level: missed && taken === 0 ? -1 : level(taken, list.length), title };
        }}
      />
    </>
  );
}

function Music({ mano }: { mano: Mano }) {
  const now = useNow(1000);
  const n = mano.spotify?.now;
  if (!n) return null;
  const progress = Math.min(n.duration_ms, n.progress_ms + (n.is_playing ? now - n.at : 0));
  const ctl = (a: string) => api(`/api/spotify/control/${a}`, {}).catch(() => {});
  return (
    <>
      <Head title={n.is_playing ? "Tocando agora" : "Pausado"} stat={n.device ?? ""} />
      <div className="flex items-center gap-3.5">
        {n.image ? (
          <img src={n.image} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="size-16 shrink-0 rounded-xl bg-deep-line" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{n.title}</div>
          <div className="truncate text-sm text-deep-muted">{n.artist}</div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-deep-line">
            <div className="h-full bg-glow" style={{ width: `${n.duration_ms ? (100 * progress) / n.duration_ms : 0}%` }} />
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        <Ctl label="Música anterior" onClick={() => ctl("previous")} d="M6 5v14M19 5 9 12l10 7V5Z" />
        {n.is_playing ? (
          <Ctl label="Pausar" big onClick={() => ctl("pause")} d="M8 5v14M16 5v14" />
        ) : (
          <Ctl label="Tocar" big onClick={() => ctl("play")} d="M7 4.5v15L19 12 7 4.5Z" />
        )}
        <Ctl label="Próxima música" onClick={() => ctl("next")} d="M18 5v14M5 5l10 7-10 7V5Z" />
      </div>
    </>
  );
}

function Ctl({ label, d, onClick, big }: { label: string; d: string; onClick: () => void; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-full ${big ? "size-11 bg-glow text-on-ember" : "size-11 text-deep-muted hover:text-deep-text"}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill={big ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  );
}

function Head({ title, stat }: { title: string; stat: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-deep-muted">{title}</span>
      {stat && <span className="truncate text-sm text-deep-muted">{stat}</span>}
    </div>
  );
}

/**
 * Mini painel no pé do bloco do relógio: música tocando, grade de hábitos e grade de remédios.
 * Só entra o que tem dado; troca sozinho a cada 10 s (para enquanto o mouse ou o foco estão nele).
 */
export function ClockShelf({ mano }: { mano: Mano }) {
  const slides: Slide[] = [];
  if (mano.spotify?.now) slides.push("musica");
  if (mano.habits.length) slides.push("habitos");
  if (mano.meds.length) slides.push("remedios");

  const [current, setCurrent] = useState<Slide | null>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const paused = hover || focus;
  const active = current && slides.includes(current) ? current : slides[0];
  const key = slides.join(",");

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const id = window.setInterval(() => {
      setCurrent((cur) => {
        const i = slides.indexOf(cur && slides.includes(cur) ? cur : slides[0]);
        return slides[(i + 1) % slides.length];
      });
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active) return null;
  return (
    <div
      className="mt-auto flex flex-col gap-3 border-t border-deep-line pt-4"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
    >
      <div key={active} className="shelf-in flex min-h-[148px] flex-col gap-3" aria-live="off">
        {active === "musica" && <Music mano={mano} />}
        {active === "habitos" && <Habits mano={mano} />}
        {active === "remedios" && <Meds mano={mano} />}
      </div>
      {slides.length > 1 && (
        <div className="flex justify-center gap-1" role="group" aria-label="Mini painel">
          {slides.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setCurrent(s)}
              aria-label={`Mostrar ${LABEL[s]}`}
              aria-pressed={s === active}
              title={LABEL[s]}
              className="grid h-6 min-w-6 place-items-center px-1"
            >
              <span className={`h-1.5 rounded-full transition-all ${s === active ? "w-5 bg-glow" : "w-1.5 bg-deep-muted/60"}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
