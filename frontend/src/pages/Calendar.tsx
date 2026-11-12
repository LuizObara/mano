import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NotReady } from "../components/GoogleCards";
import { EventModal } from "../components/EventModal";
import { NewTask, TaskRow, type RowTask } from "../components/TaskRow";
import { Icon } from "../components/ui";
import {
  addDays,
  diffDays,
  eventsApi,
  eventsOn,
  evColor,
  hashDay,
  longDay,
  MONTHS,
  notesApi,
  parseDay,
  relDay,
  shortDay,
  tasksApi,
  untilLabel,
  WD_SHORT,
  type DayNote,
} from "../lib/agenda";
import { hhmm, isoDay, useNow, type CalEvent, type Mano } from "../lib/mano";
import { useStored } from "../lib/prefs";

type View = "mes" | "semana";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthKey = (iso: string) => iso.slice(0, 7);

/**
 * Aba Calendário: o mês (ou a semana) com eventos, tarefas por data limite e dias com anotação.
 * Clicar num dia abre o painel do dia: eventos (criar/editar), tarefas com aquela data e as anotações,
 * salvas na seção "## Anotações" da nota diária do Obsidian.
 */
export function CalendarPage({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const now = useNow(60000);
  const today = isoDay(new Date(now));
  const [sel, setSel] = useState(() => hashDay() ?? today);
  const [anchor, setAnchor] = useState(() => monthKey(hashDay() ?? today)); // mês mostrado (AAAA-MM)
  const [view, setView] = useStored<View>("mano.calView", "mes");
  const [hiddenCals, setHiddenCals] = useStored<string[]>("mano.calHidden", []);
  // começa com os próximos 7 dias que já estão em memória; o mês inteiro chega logo depois
  const [events, setEvents] = useState<CalEvent[]>(() => mano.calendar?.events ?? []);
  const [loading, setLoading] = useState(false);
  const [noteDays, setNoteDays] = useState<string[]>([]);
  const [noteTick, setNoteTick] = useState(0);
  const [modal, setModal] = useState<{ event?: CalEvent; day: string } | null>(null);
  const ready = !!mano.google?.connected;

  const pick = useCallback((iso: string) => {
    setSel(iso);
    setAnchor(monthKey(iso));
  }, []);

  // #/calendario?d=AAAA-MM-DD (vindo da Agenda ou das Tarefas)
  useEffect(() => {
    const on = () => {
      const d = hashDay();
      if (d) pick(d);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [pick]);

  // intervalo visível
  const { cells, rangeStart, rangeEnd } = useMemo(() => {
    if (view === "semana") {
      const start = addDays(sel, -parseDay(sel).getDay());
      return { cells: Array.from({ length: 7 }, (_, i) => addDays(start, i)), rangeStart: start, rangeEnd: addDays(start, 7) };
    }
    const first = parseDay(`${anchor}-01`);
    const start = addDays(`${anchor}-01`, -first.getDay());
    const dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const n = Math.ceil((first.getDay() + dim) / 7) * 7;
    return { cells: Array.from({ length: n }, (_, i) => addDays(start, i)), rangeStart: start, rangeEnd: addDays(start, n) };
  }, [view, anchor, sel]);

  // eventos do intervalo; recarrega quando a agenda muda (o backend avisa depois de cada gravação)
  const calUpdated = mano.calendar?.updated;
  useEffect(() => {
    if (!ready) return;
    let off = false;
    setLoading(true);
    eventsApi
      .range(rangeStart, rangeEnd)
      .then((r) => !off && setEvents(r.events))
      .catch(() => {})
      .finally(() => !off && setLoading(false));
    return () => {
      off = true;
    };
  }, [ready, rangeStart, rangeEnd, calUpdated]);

  // dias com anotação nos meses visíveis
  const notesOk = !!mano.notes?.configured;
  const months = useMemo(() => [...new Set([monthKey(rangeStart), monthKey(addDays(rangeEnd, -1))])], [rangeStart, rangeEnd]);
  useEffect(() => {
    if (!notesOk) return;
    let off = false;
    Promise.all(months.map((m) => notesApi.days(m)))
      .then((lists) => !off && setNoteDays(lists.flat()))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [notesOk, months, noteTick]);

  const shown = events.filter((e) => !hiddenCals.includes(e.calendar_id ?? ""));
  const open = mano.tasks?.tasks ?? [];
  const done = mano.tasks?.done ?? [];
  const calendars = mano.calendar?.calendars ?? [];

  const move = (dir: number) => {
    if (view === "semana") pick(addDays(sel, 7 * dir));
    else {
      const d = parseDay(`${anchor}-01`);
      d.setMonth(d.getMonth() + dir);
      setAnchor(monthKey(isoDay(d)));
    }
  };

  const anchorDate = parseDay(`${anchor}-01`);
  const title =
    view === "mes"
      ? `${cap(MONTHS[anchorDate.getMonth()])} de ${anchorDate.getFullYear()}`
      : (() => {
          const a = parseDay(cells[0]);
          const b = parseDay(cells[6]);
          return `${a.getDate()}${a.getMonth() !== b.getMonth() ? ` de ${MONTHS[a.getMonth()]}` : ""} – ${b.getDate()} de ${MONTHS[b.getMonth()]}`;
        })();

  if (!ready) {
    return (
      <section className="rounded-3xl border border-line bg-panel p-6">
        <h1 className="mb-3 font-display text-[28px] font-medium">Calendário</h1>
        {mano.google ? <NotReady mano={mano} go={go} /> : <p className="text-sm text-muted">Conectando ao Mano…</p>}
      </section>
    );
  }

  const seg = (on: boolean) => `min-h-10 rounded-full px-4 text-sm font-semibold ${on ? "bg-ember text-on-ember" : "text-muted hover:text-text"}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Calendário</span>
          <h1 className="flex items-center gap-3 font-display text-[34px] font-medium leading-none tracking-[-0.01em] sm:text-[40px]">
            {title}
            {loading && <span aria-hidden className="blink size-2 rounded-full bg-ember" title="Carregando" />}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1 rounded-full border border-line bg-panel p-1">
            <button type="button" onClick={() => move(-1)} aria-label="Anterior" className="grid size-10 place-items-center rounded-full hover:bg-soft">
              <Icon name="chevron-left" className="size-[18px]" />
            </button>
            <button type="button" onClick={() => pick(today)} className="min-h-10 rounded-full px-4 text-sm font-semibold hover:bg-soft">
              Hoje
            </button>
            <button type="button" onClick={() => move(1)} aria-label="Próximo" className="grid size-10 place-items-center rounded-full hover:bg-soft">
              <Icon name="chevron-right" className="size-[18px]" />
            </button>
          </div>
          <div role="group" aria-label="Visualização" className="flex gap-0.5 rounded-full border border-line bg-panel p-1">
            <button type="button" aria-pressed={view === "mes"} onClick={() => setView("mes")} className={seg(view === "mes")}>
              Mês
            </button>
            <button type="button" aria-pressed={view === "semana"} onClick={() => setView("semana")} className={seg(view === "semana")}>
              Semana
            </button>
          </div>
          <button type="button" onClick={() => setModal({ day: sel })} className="flex min-h-12 items-center gap-2 rounded-full bg-ember px-5 text-sm font-bold text-on-ember">
            <Icon name="plus" className="size-4" />
            Evento
          </button>
        </div>
      </div>

      {calendars.length > 1 && (
        <div role="group" aria-label="Agendas" className="flex flex-wrap gap-2">
          {calendars.map((c) => {
            const on = !hiddenCals.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setHiddenCals(on ? [...hiddenCals, c.id] : hiddenCals.filter((x) => x !== c.id))}
                className={`flex min-h-9 items-center gap-2 rounded-full border pl-2.5 pr-3.5 text-[13px] font-semibold ${on ? "border-line bg-panel" : "border-dashed border-line text-muted"}`}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: on ? (c.color ?? "var(--color-ember)") : "transparent", boxShadow: `inset 0 0 0 2px ${c.color ?? "var(--color-ember)"}` }}
                />
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Calendário" aria-busy={loading} className="flex min-w-0 flex-[999_1_620px] flex-col gap-3 rounded-3xl border border-line bg-panel p-3 sm:p-4">
          {view === "mes" ? (
            <>
              <div className="grid grid-cols-7 gap-1.5 px-0.5 text-[11.5px] font-bold uppercase tracking-wider text-muted">
                {WD_SHORT.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {cells.map((iso) => (
                  <MonthCell
                    key={iso}
                    iso={iso}
                    today={today}
                    sel={sel}
                    outside={monthKey(iso) !== anchor}
                    events={eventsOn(shown, iso)}
                    openTasks={open.filter((t) => t.due === iso).length}
                    note={noteDays.includes(iso)}
                    onPick={() => pick(iso)}
                    onNew={() => setModal({ day: iso })}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((iso) => (
                <WeekColumn
                  key={iso}
                  iso={iso}
                  today={today}
                  sel={sel}
                  events={eventsOn(shown, iso)}
                  tasks={[...open.filter((t) => t.due === iso), ...done.filter((t) => t.due === iso).map((t) => ({ ...t, done: true }))]}
                  onPick={() => pick(iso)}
                />
              ))}
            </div>
          )}
          <Heatmap done={done} today={today} onPick={pick} />
        </section>

        <DayPanel
          key={sel}
          sel={sel}
          today={today}
          now={now}
          events={eventsOn(shown, sel)}
          open={open}
          done={done}
          notesOk={notesOk}
          onEvent={(e) => (e.editable ? setModal({ event: e, day: sel }) : e.link && window.open(e.link, "_blank"))}
          onNewEvent={() => setModal({ day: sel })}
          onNoteSaved={() => setNoteTick((n) => n + 1)}
          go={go}
        />
      </div>

      {modal && <EventModal event={modal.event} day={modal.day} calendars={calendars} onClose={() => setModal(null)} />}
    </div>
  );
}

function MonthCell({
  iso,
  today,
  sel,
  outside,
  events,
  openTasks,
  note,
  onPick,
  onNew,
}: {
  iso: string;
  today: string;
  sel: string;
  outside: boolean;
  events: CalEvent[];
  openTasks: number;
  note: boolean;
  onPick: () => void;
  onNew: () => void;
}) {
  const isSel = iso === sel;
  const isToday = iso === today;
  const late = openTasks > 0 && iso < today;
  const n = parseDay(iso).getDate();
  return (
    <button
      type="button"
      onClick={onPick}
      onDoubleClick={onNew}
      aria-pressed={isSel}
      aria-label={`${longDay(iso)}${events.length ? `, ${events.length} eventos` : ""}${openTasks ? `, ${openTasks} tarefas` : ""}${note ? ", com anotação" : ""}`}
      title="Clique para ver o dia · clique duplo para marcar um evento"
      className={`flex h-16 min-w-0 flex-col items-stretch gap-1 overflow-hidden rounded-[14px] border-[1.5px] p-1.5 text-left transition-colors sm:h-[118px] sm:p-2 ${
        isSel ? "border-ember bg-ember/10" : outside ? "border-line/60 hover:border-muted/50" : "border-line bg-ink/40 hover:border-muted/50"
      }`}
    >
      <span className="flex items-center justify-between gap-1">
        <span
          className={`grid size-7 place-items-center rounded-full text-sm font-bold tabular-nums ${
            isToday ? "bg-ember text-on-ember" : outside ? "text-muted" : ""
          }`}
        >
          {n}
        </span>
        {note && (
          <span title="Tem anotação" className="text-muted">
            <Icon name="note" className="size-3.5" />
          </span>
        )}
      </span>
      {/* celular: só pontinhos */}
      <span className="flex flex-wrap gap-[3px] px-1 sm:hidden">
        {events.slice(0, 4).map((e) => (
          <span key={e.id + e.start} className="size-[5px] rounded-full" style={{ background: evColor(e) }} />
        ))}
        {openTasks > 0 && <span className={`size-[5px] rounded-full ${late ? "bg-alert" : "bg-muted"}`} />}
      </span>
      <span className="hidden flex-col gap-1 sm:flex">
        {events.slice(0, 2).map((e) => (
          <span
            key={e.id + e.start}
            className="flex items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-md px-1.5 py-px text-xs leading-4"
            style={{ background: `color-mix(in srgb, ${evColor(e)} 16%, transparent)` }}
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ background: evColor(e) }} />
            <span className="truncate">{e.all_day ? e.title : `${hhmm(e.start)} ${e.title}`}</span>
          </span>
        ))}
        {events.length > 2 && <span className="pl-1.5 text-[11px] text-muted">+{events.length - 2} mais</span>}
      </span>
      {openTasks > 0 && (
        <span className={`mt-auto hidden items-center gap-1 text-[11px] font-bold sm:flex ${late ? "text-alert" : "text-muted"}`}>
          <Icon name="check-circle" className="size-3" />
          {openTasks} tarefa{openTasks > 1 ? "s" : ""}
        </span>
      )}
    </button>
  );
}

function WeekColumn({
  iso,
  today,
  sel,
  events,
  tasks,
  onPick,
}: {
  iso: string;
  today: string;
  sel: string;
  events: CalEvent[];
  tasks: RowTask[];
  onPick: () => void;
}) {
  const d = parseDay(iso);
  const isSel = iso === sel;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={isSel}
      aria-label={longDay(iso)}
      className={`flex min-h-[420px] min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl border-[1.5px] p-1.5 text-left sm:p-2 ${
        isSel ? "border-ember bg-ember/10" : "border-line bg-ink/40 hover:border-muted/50"
      }`}
    >
      <span className="flex flex-col items-center gap-1 border-b border-line pb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{WD_SHORT[d.getDay()]}</span>
        <span className={`grid size-9 place-items-center rounded-full font-display text-lg ${iso === today ? "bg-ember text-on-ember" : ""}`}>{d.getDate()}</span>
      </span>
      {events.map((e) => (
        <span key={e.id + e.start} className="flex flex-col gap-0.5 rounded-[10px] px-2 py-1.5 text-xs leading-tight" style={{ background: `color-mix(in srgb, ${evColor(e)} 16%, transparent)` }}>
          <span className="font-bold" style={{ color: evColor(e) }}>
            {e.all_day ? "Dia todo" : hhmm(e.start)}
          </span>
          <span className="break-words">{e.title}</span>
        </span>
      ))}
      {tasks.map((t) => (
        <span key={t.id} className={`flex gap-1.5 rounded-[10px] border border-dashed border-line px-2 py-1.5 text-xs leading-tight ${t.done ? "text-muted line-through" : ""}`}>
          <Icon name={t.done ? "check-circle" : "target"} className="mt-px size-3 shrink-0" />
          <span className="break-words">{t.title}</span>
        </span>
      ))}
    </button>
  );
}

/** Tarefas concluídas por dia nas últimas 12 semanas (como o mapa dos hábitos). */
function Heatmap({ done, today, onPick }: { done: { completed: string }[]; today: string; onPick: (iso: string) => void }) {
  const counts = new Map<string, number>();
  for (const t of done) counts.set(t.completed, (counts.get(t.completed) ?? 0) + 1);
  // termina no sábado desta semana, 12 colunas de domingo a sábado
  const end = addDays(today, 6 - parseDay(today).getDay());
  const days = Array.from({ length: 84 }, (_, i) => addDays(end, i - 83));
  const total = days.reduce((s, d) => s + (counts.get(d) ?? 0), 0);
  const tone = (n: number) => (n === 0 ? "bg-line" : n === 1 ? "bg-ember/35" : n === 2 ? "bg-ember/65" : "bg-ember");
  return (
    <div className="mt-1 flex flex-wrap items-center justify-between gap-4 rounded-[18px] bg-soft px-4 py-3">
      <div className="flex flex-col">
        <span className="text-[13px] text-muted">Tarefas concluídas · 12 semanas</span>
        <span className="font-display text-[22px] font-medium leading-tight">
          {total} feita{total === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
        {days.map((d) => {
          const n = counts.get(d) ?? 0;
          return d > today ? (
            <span key={d} className="size-[11px]" />
          ) : (
            <button
              key={d}
              type="button"
              onClick={() => onPick(d)}
              title={`${shortDay(d)} · ${n} concluída${n === 1 ? "" : "s"}`}
              aria-label={`${longDay(d)}: ${n} tarefas concluídas`}
              className={`size-[11px] rounded-[3px] ${tone(n)} ${d === today ? "ring-1 ring-text" : ""}`}
            />
          );
        })}
      </div>
      <div aria-hidden className="flex items-center gap-1 text-xs text-muted">
        menos
        {[0, 1, 2, 3].map((n) => (
          <span key={n} className={`size-[11px] rounded-[3px] ${tone(n)}`} />
        ))}
        mais
      </div>
    </div>
  );
}

function DayPanel({
  sel,
  today,
  now,
  events,
  open,
  done,
  notesOk,
  onEvent,
  onNewEvent,
  onNoteSaved,
  go,
}: {
  sel: string;
  today: string;
  now: number;
  events: CalEvent[];
  open: { id: string; title: string; due: string | null }[];
  done: { id: string; title: string; due: string | null; completed: string }[];
  notesOk: boolean;
  onEvent: (e: CalEvent) => void;
  onNewEvent: () => void;
  onNoteSaved: () => void;
  go: (p: string) => void;
}) {
  const dayOpen = open.filter((t) => t.due === sel);
  const dayDone = done.filter((t) => t.due === sel);
  const overdue = sel === today ? open.filter((t) => t.due && t.due < today) : [];
  const [bringing, setBringing] = useState(false);
  const firstNext = events.find((e) => !e.all_day && e.start > now);
  const total = dayOpen.length + dayDone.length;

  const bring = async () => {
    setBringing(true);
    try {
      await Promise.all(overdue.map((t) => tasksApi.update(t.id, { due: today })));
    } finally {
      setBringing(false);
    }
  };

  const head = "text-[12px] font-bold uppercase tracking-[0.12em] text-muted";

  return (
    <aside aria-label="Dia selecionado" className="flex min-w-0 flex-[1_1_360px] flex-col gap-5 rounded-3xl border border-line bg-panel p-5">
      <div className="flex flex-col gap-1.5">
        <span className="self-start rounded-full bg-ember/15 px-2.5 py-0.5 text-xs font-bold text-accent">{relDay(sel, today)}</span>
        <h2 className="font-display text-[28px] font-medium leading-tight">{longDay(sel)}</h2>
      </div>

      <div className="flex flex-col gap-2.5 rounded-[18px] bg-soft px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted">{events.length ? `${events.length} evento${events.length > 1 ? "s" : ""}` : "Sem eventos"}</span>
          <span className="font-display text-xl">{total ? `${dayDone.length} de ${total} tarefas` : "Sem tarefas"}</span>
        </div>
        <div aria-hidden className="flex gap-1">
          {total === 0 ? (
            <span className="h-2 flex-1 rounded-full bg-line" />
          ) : (
            [...dayDone.map(() => "bg-ok"), ...dayOpen.map(() => (sel < today ? "bg-alert/60" : "bg-line"))].map((c, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${c}`} />
            ))
          )}
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[18px] border border-alert/50 bg-alert/[0.08] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-alert">
              {overdue.length} tarefa{overdue.length > 1 ? "s atrasadas" : " atrasada"}
            </span>
            <button type="button" disabled={bringing} onClick={bring} className="min-h-9 rounded-full bg-alert px-3.5 text-[13px] font-bold text-on-alert disabled:opacity-50">
              {bringing ? "Trazendo…" : "Trazer pra hoje"}
            </button>
          </div>
          <ul className="flex flex-col gap-0.5 text-sm">
            {overdue.slice(0, 4).map((t) => (
              <li key={t.id} className="truncate">
                {t.title} <span className="text-muted">· {diffDays(today, t.due!) === 1 ? "era pra ontem" : `há ${diffDays(today, t.due!)} dias`}</span>
              </li>
            ))}
            {overdue.length > 4 && <li className="text-muted">e mais {overdue.length - 4}</li>}
          </ul>
        </div>
      )}

      <section aria-label="Eventos" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className={head}>Eventos</h3>
          <button type="button" onClick={onNewEvent} className="flex min-h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] font-semibold hover:bg-soft">
            <Icon name="plus" className="size-3.5" />
            Evento
          </button>
        </div>
        {events.length === 0 ? (
          <p className="rounded-[14px] border border-dashed border-line px-4 py-3.5 text-sm text-muted">Nada marcado. Dia livre.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events.map((e) => {
              const live = !e.all_day && e.start <= now && now < e.end;
              const next = e === firstNext && sel === today;
              const badge = live ? "agora" : next ? untilLabel(e.start - now) : null;
              return (
                <li key={e.id + e.start}>
                  <button
                    type="button"
                    onClick={() => onEvent(e)}
                    title={e.editable ? "Editar evento" : "Abrir no Google"}
                    className={`flex w-full items-stretch gap-3 rounded-[14px] border px-3 py-2.5 text-left hover:bg-soft/60 ${
                      badge ? "border-ember/55 bg-ember/[0.08]" : "border-line"
                    } ${!e.all_day && e.end <= now ? "opacity-55" : ""}`}
                  >
                    <span className="flex w-12 shrink-0 flex-col tabular-nums leading-tight">
                      <span className="text-sm font-bold">{e.all_day ? "Dia" : hhmm(e.start)}</span>
                      <span className="text-xs text-muted">{e.all_day ? "todo" : hhmm(e.end)}</span>
                    </span>
                    <span className="w-1 shrink-0 rounded-full" style={{ background: evColor(e) }} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[15px] font-semibold leading-snug">{e.title}</span>
                      <span className="truncate text-[13px] text-muted">
                        {[e.calendar, e.meet && "Google Meet", e.location].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {badge && <span className="self-center whitespace-nowrap rounded-full bg-ember px-2.5 py-0.5 text-xs font-bold text-on-ember">{badge}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Tarefas do dia" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className={head}>Tarefas do dia</h3>
          <button type="button" onClick={() => go("inicio")} className="text-[13px] font-semibold text-accent hover:underline">
            Ver todas →
          </button>
        </div>
        {total === 0 ? (
          <p className="text-sm text-muted">Nenhuma tarefa com prazo neste dia.</p>
        ) : (
          <ul className="flex flex-col">
            {dayOpen.map((t) => (
              <TaskRow key={t.id} t={t} today={today} showDate={false} />
            ))}
            {dayDone.map((t) => (
              <TaskRow key={t.id + "-f"} t={{ ...t, done: true }} today={today} showDate={false} />
            ))}
          </ul>
        )}
        <NewTask today={today} fixedDue={sel} placeholder={`Nova tarefa para ${shortDay(sel)}`} />
        <span className="text-xs text-muted">Vai para Tarefas com data limite {shortDay(sel)}.</span>
      </section>

      <DayNotes day={sel} enabled={notesOk} onSaved={onNoteSaved} go={go} />
    </aside>
  );
}

/** Anotações do dia: salva sozinho (pausa de 0,8 s ou ao sair do campo) na nota diária do Obsidian. */
function DayNotes({ day, enabled, onSaved, go }: { day: string; enabled: boolean; onSaved: () => void; go: (p: string) => void }) {
  const [note, setNote] = useState<DayNote | null>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const pending = useRef<{ text: string; timer?: number } | null>(null);
  const saved = useRef(onSaved);
  saved.current = onSaved;

  useEffect(() => {
    if (!enabled) return;
    let off = false;
    notesApi
      .day(day)
      .then((n) => {
        if (off) return;
        setNote(n);
        setText(n.text);
      })
      .catch(() => !off && setState("error"));
    return () => {
      off = true;
    };
  }, [day, enabled]);

  const flush = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    setState("saving");
    try {
      const n = await notesApi.save(day, p.text);
      setNote(n);
      setState("saved");
      saved.current();
    } catch {
      setState("error");
    }
  }, [day]);

  // trocar de dia (o painel é recriado) ou sair da aba: salva o que ficou pendente
  useEffect(() => () => void flush(), [flush]);

  const change = (v: string) => {
    setText(v);
    setState("dirty");
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = { text: v, timer: window.setTimeout(() => void flush(), 800) };
  };

  return (
    <section aria-label="Anotações" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="anotacoes-dia" className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
          Anotações
        </label>
        {note && (
          <a href={note.obsidian_url} className="text-[13px] font-semibold text-accent hover:underline">
            Abrir no Obsidian ↗
          </a>
        )}
      </div>
      {!enabled ? (
        <p className="text-sm text-muted">
          As anotações ficam na nota diária do Obsidian.{" "}
          <button type="button" onClick={() => go("ajustes")} className="text-accent hover:underline">
            Escolher o vault em Ajustes
          </button>
        </p>
      ) : (
        <>
          <textarea
            id="anotacoes-dia"
            value={text}
            onChange={(e) => change(e.target.value)}
            onBlur={() => void flush()}
            placeholder="Escreva algo sobre este dia… (markdown)"
            className="min-h-[150px] resize-y rounded-[14px] border border-line bg-ink px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-accent placeholder:text-muted/70"
          />
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className={`size-1.5 rounded-full ${
                state === "error" ? "bg-alert" : state === "dirty" || state === "saving" ? "blink bg-ember" : "bg-ok"
              }`}
            />
            {state === "error"
              ? "Não consegui salvar. Tente de novo."
              : state === "saving" || state === "dirty"
                ? "Salvando…"
                : `Na daily note · ${note?.path ?? "…"}`}
          </span>
          {note && note.captures.length > 0 && (
            <div className="flex flex-col gap-1 rounded-[14px] bg-soft px-3.5 py-2.5 text-[13px]">
              <span className="font-semibold text-muted">Capturas por voz</span>
              {note.captures.map((c, i) => (
                <span key={i}>· {c}</span>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
