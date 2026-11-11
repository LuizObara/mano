import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, hhmm, isoDay, type Dose, type Mano } from "../lib/mano";
import { useStored } from "../lib/prefs";
import { Card, Icon } from "./ui";

/**
 * Histórico de remédios em grade de "contribuições": uma coluna por semana, uma linha por dia (seg → dom).
 * Mel mais forte = mais doses tomadas; telha com ponto = dose esquecida; mel fraco = pulou; tracejado = ainda vai.
 * Passar o mouse mostra o dia; clicar fixa a dica com as ações (tomei, pular, desfazer). No celular vira folha de baixo.
 */

type Status = Dose["status"] | "future";
type Item = { id: number | null; medId: number; name: string; dose: string; time: string; scheduled: number; status: Status; takenAt: number | null };
type Kind = "none" | "future" | "missed" | "skipped" | "open" | "l2" | "l3" | "full";
type Day = { key: string; date: Date; items: Item[]; kind: Kind; run: number; broke: number; idx: number; col: number; row: number };

const RANGES = [
  { weeks: 13, label: "3 meses", long: "últimos 3 meses", cs: 30, gap: 6 },
  { weeks: 26, label: "6 meses", long: "últimos 6 meses", cs: 22, gap: 5 },
  { weeks: 52, label: "1 ano", long: "último ano", cs: 13, gap: 3 },
];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WD = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ROW_LABELS = ["Seg", "", "Qua", "", "Sex", "", "Dom"];
const POP_W = 344;

const CELL: Record<Kind, string> = {
  none: "bg-soft",
  future: "border border-dashed border-muted/45",
  missed: "bg-alert",
  skipped: "bg-muted/25",
  open: "bg-soft",
  l2: "bg-ember/35",
  l3: "bg-ember/60",
  full: "bg-ember",
};
const PILL: Record<Status, [string, string]> = {
  taken: ["tomado", "bg-ok/15 text-ok"],
  missed: ["esqueceu", "bg-alert/15 text-alert"],
  skipped: ["pulado", "bg-soft text-muted"],
  pending: ["em aberto", "bg-ember-soft text-accent"],
  future: ["previsto", "bg-soft text-muted"],
};
const BAR: Record<Status, string> = {
  taken: "bg-ember",
  missed: "bg-alert",
  skipped: "bg-muted/40",
  pending: "ring-1 ring-inset ring-ember",
  future: "bg-line",
};

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const minOfDay = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};
const pyWeekday = (d: Date) => (d.getDay() + 6) % 7; // como o backend: 0 = segunda
const longDate = (d: Date) => `${WD[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
const lateText = (diff: number) => (Math.abs(diff) <= 2 ? "no horário" : diff > 0 ? `${diff} min depois` : `${-diff} min antes`);

function classify(items: Item[]): Kind {
  if (!items.length) return "none";
  const due = items.filter((x) => x.status !== "future");
  if (!due.length) return "future";
  if (due.some((x) => x.status === "missed")) return "missed";
  const taken = due.filter((x) => x.status === "taken").length;
  if (taken === due.length) return "full";
  if (taken === 0) return due.some((x) => x.status === "pending") ? "open" : "skipped";
  return taken / due.length >= 0.6 ? "l3" : "l2";
}

function useNarrow() {
  const q = "(max-width: 639px)";
  const [narrow, setNarrow] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

export function MedHistory({ mano }: { mano: Mano }) {
  const [rangeIdx, setRangeIdx] = useStored<number>("mano.medHistory.range", 1);
  const [filter, setFilter] = useStored<number | "all">("mano.medHistory.filter", "all");
  const R = RANGES[rangeIdx] ?? RANGES[1];
  const [hist, setHist] = useState<Dose[] | null>(null);
  const [reload, setReload] = useState(0);
  const [peek, setPeek] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const narrow = useNarrow();
  const meds = mano.meds;
  const medFilter = filter !== "all" && meds.some((m) => m.id === filter) ? filter : "all";

  useEffect(() => {
    api<Dose[]>(`/api/meds/history?days=${R.weeks * 7}`)
      .then(setHist)
      .catch(() => setHist([]));
  }, [R.weeks, mano.doses, reload]);

  const days = useMemo<Day[]>(() => {
    const today = addDays(new Date(), 0);
    const todayKey = isoDay(today);
    const start = addDays(today, -pyWeekday(today) - (R.weeks - 1) * 7);
    const keep = (medId: number) => medFilter === "all" || medId === medFilter;
    const toItem = (d: Dose): Item => ({
      id: d.id,
      medId: d.medication_id,
      name: d.name,
      dose: d.dose,
      time: hhmm(d.scheduled_at),
      scheduled: d.scheduled_at,
      status: d.status,
      takenAt: d.taken_at,
    });
    const byDay = new Map<string, Item[]>();
    for (const d of hist ?? []) {
      if (!keep(d.medication_id)) continue;
      const k = isoDay(new Date(d.scheduled_at));
      if (k === todayKey) continue; // hoje vem do estado ao vivo
      byDay.set(k, [...(byDay.get(k) ?? []), toItem(d)]);
    }
    byDay.set(todayKey, mano.doses.filter((d) => keep(d.medication_id)).map(toItem));

    const out: Day[] = [];
    for (let i = 0; i < R.weeks * 7; i++) {
      const date = addDays(start, i);
      const key = isoDay(date);
      let items = byDay.get(key) ?? [];
      if (date > today) {
        // dias que ainda vão chegar nesta semana: o que está marcado no cadastro
        items = meds
          .filter((m) => keep(m.id) && m.days.includes(pyWeekday(date)))
          .flatMap((m) =>
            m.times.map((t) => {
              const [h, mi] = t.split(":").map(Number);
              const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi).getTime();
              return { id: null, medId: m.id, name: m.name, dose: m.dose, time: t, scheduled: at, status: "future" as const, takenAt: null };
            }),
          );
      }
      items.sort((a, b) => a.scheduled - b.scheduled || a.name.localeCompare(b.name));
      out.push({ key, date, items, kind: classify(items), run: 0, broke: 0, idx: i, col: Math.floor(i / 7), row: i % 7 });
    }
    // sequência de dias sem esquecer (pular não quebra)
    let run = 0;
    for (const d of out) {
      if (d.kind === "missed") {
        d.broke = run;
        run = 0;
      } else if (d.kind !== "none" && d.kind !== "future" && d.kind !== "open") run += 1;
      d.run = run;
    }
    return out;
  }, [hist, mano.doses, meds, medFilter, R.weeks]);

  const stats = useMemo(() => {
    const past = days.filter((d) => d.kind !== "future");
    const all = past.flatMap((d) => d.items);
    const taken = all.filter((x) => x.status === "taken");
    const missed = all.filter((x) => x.status === "missed").length;
    const skipped = all.filter((x) => x.status === "skipped").length;
    let best = 0;
    for (const d of days) best = Math.max(best, d.run);
    const lastClosed = [...past].reverse().find((d) => d.kind !== "open" && d.kind !== "none");
    const groups = new Map<string, { label: string; sched: number; sum: number; n: number }>();
    for (const x of taken) {
      if (x.takenAt === null) continue;
      const k = `${x.medId}|${x.time}`;
      const g = groups.get(k) ?? { label: `${x.name} das ${x.time}`, sched: minOfDay(x.scheduled), sum: 0, n: 0 };
      g.sum += minOfDay(x.takenAt) - minOfDay(x.scheduled);
      g.n += 1;
      groups.set(k, g);
    }
    const delays = [...groups.values()]
      .sort((a, b) => a.sched - b.sched || a.label.localeCompare(b.label))
      .map((g) => {
        const diff = Math.round(g.sum / g.n);
        const avg = g.sched + diff;
        const clock = `${String(Math.floor(avg / 60)).padStart(2, "0")}:${String(((avg % 60) + 60) % 60).padStart(2, "0")}`;
        return { label: g.label, avg: clock, diff: Math.abs(diff) <= 2 ? "no horário" : diff > 0 ? `+${diff} min` : `${diff} min` };
      });
    return {
      pct: taken.length + missed ? `${Math.round((100 * taken.length) / (taken.length + missed))}%` : "—",
      sub: `${taken.length} tomadas · ${missed} esquecidas · ${skipped} puladas`,
      streak: lastClosed?.run ?? 0,
      best,
      missed,
      delays,
    };
  }, [days]);

  const byKey = useMemo(() => new Map(days.map((d) => [d.key, d])), [days]);
  const shown = pin ?? (narrow ? null : peek);
  const shownDay = shown ? byKey.get(shown) : undefined;

  const cellOf = useCallback((key: string) => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`) ?? null, []);
  const close = useCallback(() => {
    const k = pin;
    setPin(null);
    setPeek(null);
    if (k) cellOf(k)?.focus();
  }, [pin, cellOf]);

  // ações: corrigem a dose no servidor e recarregam o histórico (hoje volta pelo WebSocket)
  const act = async (id: number, action: string) => {
    await api(`/api/meds/doses/${id}/${action}`, {});
    setReload((n) => n + 1);
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLElement;
    const key = el.dataset?.day;
    if (!key) return;
    const d = byKey.get(key);
    if (!d) return;
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = days[d.idx + step];
    if (next) cellOf(next.key)?.focus();
  };

  if (meds.length === 0 && !(hist ?? []).length) return null;
  const filters: { id: number | "all"; name: string; sub: string }[] = [
    { id: "all", name: "Todos", sub: meds.length === 1 ? "" : `${meds.length} remédios` },
    ...meds.map((m) => ({ id: m.id, name: m.name, sub: [m.dose, m.times.join(" e ")].filter(Boolean).join(" · ") })),
  ];
  const radius = Math.max(3, Math.round(R.cs / 5));
  const todayKey = isoDay(new Date());

  return (
    <Card
      title="Histórico"
      action={
        <div role="group" aria-label="Período" className="flex gap-1 rounded-full bg-soft p-1">
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={i === rangeIdx}
              onClick={() => {
                setRangeIdx(i);
                setPeek(null);
                setPin(null);
              }}
              className={`min-h-9 rounded-full px-3.5 text-sm ${i === rangeIdx ? "bg-panel font-semibold text-text shadow-sm" : "font-medium text-muted hover:text-text"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="max-w-[70ch] text-[15px] leading-snug text-muted">
          Cada quadrado é um dia. Quanto mais forte o mel, mais doses tomadas; telha com ponto é dia com dose esquecida.
          {narrow ? " Toque num dia para ver e corrigir." : " Passe o mouse para ver o dia e clique para fixar e corrigir."}
        </p>

        {filters.length > 2 && (
          <div role="group" aria-label="Remédio" className="flex flex-wrap gap-2">
            {filters.map((f) => {
              const on = f.id === medFilter;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setFilter(f.id);
                    setPin(null);
                  }}
                  className={`flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm ${
                    on ? "border-ember bg-ember-soft text-text" : "border-line hover:bg-soft"
                  }`}
                >
                  <span className="font-semibold">{f.name}</span>
                  {f.sub && <span className="text-muted">{f.sub}</span>}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-start gap-7">
          <div className="flex min-w-0 max-w-full flex-[0_1_auto] flex-col gap-3.5">
            <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
              <div
                ref={grid}
                role="group"
                aria-label={`Doses dos ${R.long}. Use as setas para andar entre os dias.`}
                onKeyDown={onGridKey}
                onPointerLeave={() => setPeek(null)}
                onBlur={(e) => {
                  if (!grid.current?.contains(e.relatedTarget as Node)) setPeek(null);
                }}
                className="flex w-max p-1"
                style={{ gap: R.gap }}
              >
                <div aria-hidden className="flex w-[30px] flex-col pt-[22px]" style={{ gap: R.gap }}>
                  {ROW_LABELS.map((l, i) => (
                    <span key={i} className="text-xs text-muted" style={{ height: R.cs, lineHeight: `${R.cs}px` }}>
                      {l}
                    </span>
                  ))}
                </div>
                {Array.from({ length: R.weeks }, (_, c) => {
                  const week = days.slice(c * 7, c * 7 + 7);
                  const mon = week[0]?.date;
                  const month = mon && (c === 0 || mon.getDate() <= 7) ? MONTHS[mon.getMonth()] : "";
                  return (
                    <div key={c} className="flex flex-col" style={{ gap: R.gap, width: R.cs }}>
                      <span aria-hidden className="h-[18px] whitespace-nowrap text-xs text-muted">
                        {month}
                      </span>
                      {week.map((d) => {
                        const due = d.items.filter((x) => x.status !== "future");
                        const taken = due.filter((x) => x.status === "taken").length;
                        const ring =
                          d.key === pin
                            ? "outline-2 outline-offset-2 outline-accent"
                            : d.key === todayKey
                              ? "outline-2 outline-offset-1 outline-text"
                              : "";
                        return (
                          <button
                            key={d.key}
                            type="button"
                            data-day={d.key}
                            aria-label={`${longDate(d.date)}: ${
                              !d.items.length ? "sem dose" : due.length ? `${taken} de ${due.length} tomadas` : "ainda vai"
                            }`}
                            aria-pressed={d.key === pin}
                            onClick={() => {
                              setPeek(null);
                              setPin(pin === d.key ? null : d.key);
                            }}
                            onPointerEnter={(e) => e.pointerType === "mouse" && !pin && setPeek(d.key)}
                            onFocus={() => !pin && !narrow && setPeek(d.key)}
                            className={`grid place-items-center transition-[filter] hover:brightness-110 ${CELL[d.kind]} ${ring}`}
                            style={{ width: R.cs, height: R.cs, borderRadius: radius }}
                          >
                            {d.kind === "missed" && <span aria-hidden className="size-[34%] rounded-full bg-panel" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4.5 gap-y-2 text-[13px] text-muted">
              <span className="flex items-center gap-1.5">
                Menos
                {["bg-soft", "bg-ember/35", "bg-ember/60", "bg-ember"].map((c) => (
                  <span key={c} className={`size-3.5 rounded ${c}`} />
                ))}
                Mais
              </span>
              <Swatch cls="bg-alert grid place-items-center" dot label="esqueceu alguma" />
              <Swatch cls="bg-muted/25" label="pulou" />
              <Swatch cls="border border-dashed border-muted/45" label="ainda vai" />
              <Swatch cls="bg-soft outline-2 outline-offset-1 outline-text" label="hoje" />
            </div>
          </div>

          <aside aria-label="Resumo" className="flex min-w-[min(100%,300px)] flex-[1_1_300px] flex-col gap-3.5">
            <div className="flex flex-col gap-1 rounded-[20px] bg-soft px-5 py-4.5">
              <span className="text-[13px] text-muted">Adesão · {R.long}</span>
              <strong className="font-display text-5xl font-medium leading-none tracking-[-0.02em]">{stats.pct}</strong>
              <span className="text-[13px] text-muted">{stats.sub}</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <Stat value={stats.streak} label="dias seguidos agora" />
              <Stat value={stats.best} label="melhor sequência" />
              <Stat value={stats.missed} label="esquecidas" alert />
            </div>
            {stats.delays.length > 0 && (
              <div className="flex flex-col gap-2.5 rounded-2xl border border-line px-4 py-3.5">
                <span className="text-[13px] text-muted">Horário real, em média</span>
                {stats.delays.map((d) => (
                  <div key={d.label} className="flex items-baseline gap-2.5">
                    <span className="min-w-0 flex-1 text-[14.5px] font-medium">{d.label}</span>
                    <span className="text-[14.5px] tabular-nums">{d.avg}</span>
                    <span className="w-[76px] shrink-0 text-right text-[13px] text-muted">{d.diff}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      {shownDay &&
        (narrow ? (
          <Sheet
            day={shownDay}
            onClose={close}
            onAct={act}
            onStep={(n) => {
              const next = days[shownDay.idx + n];
              if (next) setPin(next.key);
            }}
          />
        ) : (
          <Popover anchor={cellOf(shownDay.key)} pinned={shownDay.key === pin} onClose={close}>
            <DayDetails day={shownDay} pinned={shownDay.key === pin} onClose={close} onAct={act} />
          </Popover>
        ))}
    </Card>
  );
}

const Swatch = ({ cls, label, dot }: { cls: string; label: string; dot?: boolean }) => (
  <span className="flex items-center gap-1.5">
    <span className={`size-3.5 rounded ${cls}`}>{dot && <span className="size-1.5 rounded-full bg-panel" />}</span>
    {label}
  </span>
);

const Stat = ({ value, label, alert }: { value: number; label: string; alert?: boolean }) => (
  <div className="flex flex-col gap-0.5 rounded-2xl border border-line px-3 pb-2.5 pt-3">
    <strong className={`text-[22px] font-semibold tabular-nums ${alert && value > 0 ? "text-alert" : ""}`}>{value}</strong>
    <span className="text-[12.5px] leading-tight text-muted">{label}</span>
  </div>
);

/** Dica flutuante presa ao quadrado do dia (fica por cima de tudo, então não é cortada pela rolagem da grade). */
function Popover({ anchor, pinned, onClose, children }: { anchor: HTMLElement | null; pinned: boolean; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const h = box.current?.offsetHeight ?? 0;
      const left = Math.max(8, Math.min(a.left + a.width / 2 - POP_W / 2, window.innerWidth - POP_W - 8));
      const below = window.innerHeight - a.bottom >= h + 16 || a.top < h + 16;
      setPos({ left, top: below ? a.bottom + 10 : a.top - 10 - h });
    };
    place();
    const ro = new ResizeObserver(place);
    if (box.current) ro.observe(box.current);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  // fixada: Esc ou clique fora fecham; o foco entra na dica para o Tab chegar nas ações
  useEffect(() => {
    if (!pinned) return;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!box.current?.contains(t) && !t.closest?.("[data-day]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [pinned, onClose]);

  return createPortal(
    <div
      ref={box}
      role={pinned ? "dialog" : "tooltip"}
      tabIndex={-1}
      className="fixed z-30 flex flex-col gap-3 rounded-[18px] border border-line bg-panel px-4 pb-3.5 pt-4 shadow-[0_22px_48px_-18px_var(--color-veil)] outline-none"
      style={{ width: POP_W, left: pos?.left ?? -9999, top: pos?.top ?? -9999, pointerEvents: pinned ? "auto" : "none" }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** No celular: folha que sobe de baixo, com setas para o dia anterior e o próximo. */
function Sheet({ day, onClose, onAct, onStep }: { day: Day; onClose: () => void; onAct: (id: number, a: string) => Promise<void>; onStep: (n: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-30">
      <button type="button" aria-label="Fechar" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default bg-veil" />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={longDate(day.date)}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col gap-3 overflow-y-auto rounded-t-[26px] border-t border-line bg-panel px-4.5 pb-6 pt-2.5 outline-none"
      >
        <span aria-hidden className="h-1 w-10 self-center rounded-full bg-line" />
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Dia anterior" onClick={() => onStep(-1)} className="grid size-11 place-items-center rounded-2xl bg-soft">
            <Icon name="chevron-left" className="size-[18px]" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <DayTitle day={day} center />
          </div>
          <button type="button" aria-label="Próximo dia" onClick={() => onStep(1)} className="grid size-11 place-items-center rounded-2xl bg-soft">
            <Icon name="chevron-right" className="size-[18px]" />
          </button>
        </div>
        <DayBody day={day} pinned onAct={onAct} big />
        <button type="button" onClick={onClose} className="min-h-12 rounded-full bg-ember font-semibold text-on-ember">
          Pronto
        </button>
      </div>
    </div>,
    document.body,
  );
}

function badgeOf(day: Day): [string, string] {
  const due = day.items.filter((x) => x.status !== "future");
  const taken = due.filter((x) => x.status === "taken").length;
  if (!day.items.length) return ["sem dose", "bg-soft text-muted"];
  if (!due.length) return ["ainda vai", "bg-soft text-muted"];
  if (day.kind === "missed") return [`${taken} de ${due.length}`, "bg-alert text-on-alert"];
  if (taken === due.length) return ["tudo tomado", "bg-ember text-on-ember"];
  return [`${taken} de ${due.length}`, "bg-ember-soft text-accent"];
}

function whenOf(d: Date) {
  const ago = Math.round((addDays(new Date(), 0).getTime() - d.getTime()) / 864e5);
  return ago === 0 ? "hoje" : ago === 1 ? "ontem" : ago > 0 ? `há ${ago} dias` : ago === -1 ? "amanhã" : `daqui a ${-ago} dias`;
}

function DayTitle({ day, center }: { day: Day; center?: boolean }) {
  const [badge, cls] = badgeOf(day);
  return (
    <div className={`flex flex-col gap-0.5 ${center ? "items-center" : ""}`}>
      <strong className="font-display text-xl font-medium leading-tight">{longDate(day.date)}</strong>
      <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        {whenOf(day.date)}
        <span className={`rounded-full px-2.5 py-px text-[12.5px] font-semibold ${cls}`}>{badge}</span>
      </span>
    </div>
  );
}

function DayDetails({ day, pinned, onClose, onAct }: { day: Day; pinned: boolean; onClose: () => void; onAct: (id: number, a: string) => Promise<void> }) {
  return (
    <>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <DayTitle day={day} />
        </div>
        {pinned && (
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-soft hover:text-text"
          >
            <Icon name="x" className="size-4" />
          </button>
        )}
      </div>
      <DayBody day={day} pinned={pinned} onAct={onAct} />
    </>
  );
}

function DayBody({ day, pinned, onAct, big }: { day: Day; pinned: boolean; onAct: (id: number, a: string) => Promise<void>; big?: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const now = Date.now();
  const run = async (id: number, action: string) => {
    setBusy(`${id}:${action}`);
    setError("");
    try {
      await onAct(id, action);
    } catch (e) {
      setError(String((e as Error).message || "Não deu para salvar."));
    } finally {
      setBusy(null);
    }
  };

  const taken = day.items.filter((x) => x.status === "taken" && x.takenAt !== null);
  const facts: string[] = [];
  if (taken.length) {
    const avg = Math.round(taken.reduce((s, x) => s + (minOfDay(x.takenAt!) - minOfDay(x.scheduled)), 0) / taken.length);
    facts.push(avg <= 2 ? "Tudo no horário" : `Atraso médio de ${avg} min`);
  }
  if (day.kind === "missed") facts.push(day.broke > 1 ? `Quebrou uma sequência de ${day.broke} dias` : "Dia com dose esquecida");
  else if (day.kind !== "future" && day.kind !== "none" && day.kind !== "open" && day.run > 0) facts.push(`${day.run}º dia seguido sem esquecer`);
  if (day.kind === "skipped" || day.items.some((x) => x.status === "skipped")) facts.push("Pular não quebra a sequência");
  if (!day.items.length) facts.push("Nenhum remédio marcado para este dia");

  const btnMain = `rounded-full bg-ember px-3 font-semibold text-on-ember disabled:opacity-50 ${big ? "min-h-11 flex-1 text-sm" : "min-h-8 text-[13px]"}`;
  const btnSoft = `rounded-full border border-line px-3 font-semibold hover:bg-soft disabled:opacity-50 ${big ? "min-h-11 flex-1 text-sm" : "min-h-8 text-[13px]"}`;

  return (
    <>
      {day.items.length > 0 && (
        <div aria-hidden className="flex gap-1">
          {day.items.map((x, i) => (
            <span key={i} className={`h-[5px] flex-1 rounded-full ${BAR[x.status]}`} />
          ))}
        </div>
      )}
      {day.items.length > 0 && (
        <ul className="flex flex-col">
          {day.items.map((x, i) => {
            const [pill, pillCls] = PILL[x.status];
            const later = x.status === "pending" && x.scheduled > now;
            const detail =
              x.status === "taken" && x.takenAt !== null
                ? `às ${hhmm(x.takenAt)} · ${lateText(minOfDay(x.takenAt) - minOfDay(x.scheduled))}`
                : x.status === "missed"
                  ? "ninguém respondeu ao alarme"
                  : x.status === "skipped"
                    ? "pulado de propósito"
                    : x.status === "pending"
                      ? later
                        ? `o Mano avisa às ${x.time}`
                        : "tocando agora, esperando você"
                      : `previsto às ${x.time}`;
            const actions: [string, string, boolean][] =
              x.id === null
                ? []
                : x.status === "pending"
                  ? [["Tomei", "take", true], ["Pular", "skip", false]]
                  : x.status === "missed"
                    ? [["Tomei, marcar", "mark-taken", true], ["Foi pulado", "mark-skipped", false]]
                    : x.status === "skipped"
                      ? [["Tomei, marcar", "mark-taken", false], ["Desfazer", "undo", false]]
                      : x.status === "taken"
                        ? [["Desfazer", "undo", false]]
                        : [];
            return (
              <li key={`${x.medId}-${x.scheduled}-${i}`} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2.5 border-t border-line py-2.5">
                <span className="pt-px text-sm tabular-nums text-muted">{x.time}</span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[15px] font-semibold">{x.name}</span>
                    {x.dose && <span className="text-[13px] text-muted">{x.dose}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                    <span className={`rounded-full px-2 py-px text-xs font-semibold ${pillCls}`}>{pill}</span>
                    {detail}
                  </span>
                  {pinned && actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {actions.map(([label, action, main]) => (
                        <button
                          key={action}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => run(x.id!, action)}
                          className={main ? btnMain : btnSoft}
                        >
                          {busy === `${x.id}:${action}` ? "Salvando…" : label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-[13px] text-alert">{error}</p>}
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
          {facts.map((f) => (
            <span key={f} className="rounded-full bg-soft px-2.5 py-1 text-[12.5px]">
              {f}
            </span>
          ))}
        </div>
      )}
      {!pinned && day.items.some((x) => x.id !== null) && <span className="text-[12.5px] text-muted">Clique no dia para fixar e corrigir.</span>}
    </>
  );
}
