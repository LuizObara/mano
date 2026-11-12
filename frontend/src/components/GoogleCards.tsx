import { useState } from "react";
import { addDays, eventsOn, evColor, goDay, parseDay, untilLabel, WD_SHORT, longDay } from "../lib/agenda";
import { hhmm, isoDay, useNow, type CalEvent, type Mano } from "../lib/mano";
import { EventModal } from "./EventModal";
import { NewTask, TaskRow, type RowTask } from "./TaskRow";
import { Card, Icon } from "./ui";

/** Aviso padrão quando a conta Google ainda não está pronta. */
export function NotReady({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const g = mano.google;
  return (
    <p className="text-sm text-muted">
      {g?.configured ? "Falta conectar sua conta Google." : "Conta Google não configurada."}{" "}
      <button className="text-accent underline-offset-2 hover:underline" onClick={() => go("ajustes")}>
        Ir para Ajustes
      </button>
    </p>
  );
}

const pill = "rounded-full bg-soft px-2.5 py-1 text-xs font-bold tabular-nums text-muted";
const softBtn = "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13.5px] font-semibold hover:bg-soft";

/** Anel de contagem até o próximo evento (enche conforme chega a hora) ou do andamento do atual. */
function Ring({ frac, children, live }: { frac: number; children: React.ReactNode; live: boolean }) {
  const C = 2 * Math.PI * 27;
  return (
    <div className="relative size-16 shrink-0">
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r="27" fill="none" strokeWidth="5" className="stroke-line" />
        <circle
          cx="32"
          cy="32"
          r="27"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.max(0.02, Math.min(1, frac)))}
          className={`${live ? "stroke-ok" : "stroke-ember"} transition-[stroke-dashoffset] duration-700`}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">{children}</span>
    </div>
  );
}

export function AgendaCard({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const now = useNow(30000);
  const today = isoDay(new Date(now));
  const ready = mano.google?.connected;
  const events = mano.calendar?.events ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const sel = picked && picked >= today ? picked : today;
  const [modal, setModal] = useState<{ event?: CalEvent; day: string } | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => {
    const iso = addDays(today, i);
    const evs = eventsOn(events, iso);
    return { iso, i, evs, d: parseDay(iso) };
  });
  const dayEvents = eventsOn(events, sel);
  const todayCount = days[0].evs.length;

  // destaque: o que está acontecendo agora ou o próximo (de hoje ou dos próximos dias)
  const timed = events.filter((e) => !e.all_day && e.end > now);
  const live = timed.find((e) => e.start <= now);
  const next = timed.find((e) => e.start > now);
  const hero = sel === today ? (live ?? next) : undefined;
  const heroLive = !!hero && hero === live;
  const heroDay = hero ? isoDay(new Date(hero.start)) : today;

  const open = (e: CalEvent) => (e.editable ? setModal({ event: e, day: sel }) : e.link && window.open(e.link, "_blank"));

  return (
    <Card title="Agenda" action={ready ? <span className={pill}>Hoje · {todayCount}</span> : null}>
      {!ready ? (
        <NotReady mano={mano} go={go} />
      ) : (
        <div className="flex flex-col gap-4">
          {mano.calendar?.error && <p className="text-xs text-alert">{mano.calendar.error}</p>}

          <div role="group" aria-label="Escolher dia" className="grid grid-cols-7 gap-1">
            {days.map(({ iso, i, evs, d }) => {
              const on = iso === sel;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setPicked(iso)}
                  aria-pressed={on}
                  aria-label={`${longDay(iso)}${evs.length ? `, ${evs.length} eventos` : ", livre"}`}
                  className={`flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-[14px] border transition-colors ${
                    on ? "border-ember bg-ember text-on-ember" : i === 0 ? "border-ember/45 hover:bg-soft" : "border-line hover:bg-soft"
                  }`}
                >
                  <span className="text-[10.5px] font-bold uppercase tracking-wide opacity-80">{i === 0 ? "Hoje" : WD_SHORT[d.getDay()]}</span>
                  <span className="font-display text-lg leading-none">{d.getDate()}</span>
                  <span className="flex h-[5px] gap-[3px]">
                    {evs.slice(0, 3).map((e) => (
                      <span key={e.id + e.start} className="size-[5px] rounded-full" style={{ background: on ? "var(--color-on-ember)" : evColor(e) }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          {hero && (
            <div className={`flex items-center gap-3.5 rounded-[18px] border p-3.5 ${heroLive ? "border-ok/50 bg-ok/[0.08]" : "border-ember/55 bg-ember/[0.08]"}`}>
              <Ring
                live={heroLive}
                frac={heroLive ? (now - hero.start) / (hero.end - hero.start) : 1 - Math.min(hero.start - now, 3600000) / 3600000}
              >
                {heroLive ? (
                  <span className="text-[11px] font-bold text-ok">agora</span>
                ) : hero.start - now < 3600000 ? (
                  <>
                    <span className="font-display text-xl tabular-nums">{Math.max(1, Math.round((hero.start - now) / 60000))}</span>
                    <span className="text-[10px] font-bold text-muted">min</span>
                  </>
                ) : (
                  <span className="font-display text-[15px] tabular-nums">{hhmm(hero.start)}</span>
                )}
              </Ring>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-[11.5px] font-bold uppercase tracking-wider ${heroLive ? "text-ok" : "text-accent"}`}>
                  {heroLive ? `Agora · até ${hhmm(hero.end)}` : `Próximo · ${heroDay === today ? untilLabel(hero.start - now) : `${longDay(heroDay).split(",")[0].toLowerCase()} ${hhmm(hero.start)}`}`}
                </span>
                <span className="truncate text-base font-bold leading-tight">{hero.title}</span>
                <span className="truncate text-[13px] text-muted">
                  {hhmm(hero.start)}–{hhmm(hero.end)}
                  {hero.location ? ` · ${hero.location}` : hero.calendar ? ` · ${hero.calendar}` : ""}
                </span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {hero.meet && (
                    <a href={hero.meet} target="_blank" rel="noreferrer" className="flex min-h-8 items-center gap-1.5 rounded-full bg-ember px-3 text-[13px] font-bold text-on-ember">
                      <Icon name="video" className="size-3.5" />
                      Entrar no Meet
                    </a>
                  )}
                  <button type="button" onClick={() => goDay(heroDay)} className="min-h-8 rounded-full border border-line px-3 text-[13px] font-semibold hover:bg-soft">
                    Ver no dia
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between px-1 text-[12px] font-bold uppercase tracking-wider text-muted">
              <span>{sel === today ? "Hoje" : longDay(sel)}</span>
              <span className="normal-case tracking-normal">{dayEvents.length ? `${dayEvents.length} evento${dayEvents.length > 1 ? "s" : ""}` : ""}</span>
            </div>
            {dayEvents.length === 0 ? (
              <div className="flex flex-col items-start gap-2.5 rounded-[18px] bg-soft p-4">
                <span className="font-display text-lg">Dia livre</span>
                <span className="text-sm text-muted">Nada marcado. Quer reservar um horário?</span>
                <button type="button" onClick={() => setModal({ day: sel })} className="min-h-9 rounded-full bg-ember px-4 text-[13px] font-bold text-on-ember">
                  Marcar algo
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {dayEvents.map((e) => {
                  const past = !e.all_day && e.end <= now;
                  const isLive = !e.all_day && e.start <= now && now < e.end;
                  return (
                    <li key={e.id + e.start} className={`flex items-center gap-1 rounded-[14px] hover:bg-soft/60 ${past ? "opacity-50" : ""} ${isLive ? "bg-ember-soft" : ""}`}>
                      <button type="button" onClick={() => open(e)} className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2 text-left" title={e.editable ? "Editar evento" : "Abrir no Google"}>
                        <span className="flex w-11 shrink-0 flex-col tabular-nums leading-tight">
                          <span className="text-sm font-bold">{e.all_day ? "Dia" : hhmm(e.start)}</span>
                          <span className="text-xs text-muted">{e.all_day ? "todo" : hhmm(e.end)}</span>
                        </span>
                        <span className="w-1 self-stretch rounded-full" style={{ background: evColor(e) }} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-semibold">{e.title}</span>
                          <span className="truncate text-[13px] text-muted">{e.location || e.calendar}</span>
                        </span>
                        {isLive && <span className="shrink-0 rounded-full bg-ember px-2 py-0.5 text-[11px] font-bold text-on-ember">agora</span>}
                      </button>
                      {e.meet && !past && (
                        <a href={e.meet} target="_blank" rel="noreferrer" aria-label={`Entrar no Meet de ${e.title}`} title="Entrar no Meet" className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-soft hover:text-text">
                          <Icon name="video" className="size-4" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-3.5">
            <button type="button" onClick={() => setModal({ day: sel })} className={softBtn}>
              <Icon name="plus" className="size-3.5" />
              Evento
            </button>
            <button type="button" onClick={() => goDay(sel)} className="py-2 text-sm font-bold text-accent hover:underline">
              Abrir calendário →
            </button>
          </div>
        </div>
      )}
      {modal && <EventModal event={modal.event} day={modal.day} calendars={mano.calendar?.calendars ?? []} onClose={() => setModal(null)} />}
    </Card>
  );
}

export function TasksCard({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const now = useNow(60000);
  const today = isoDay(new Date(now));
  const ready = mano.google?.connected;
  const tasks = mano.tasks?.tasks ?? [];
  const doneToday = (mano.tasks?.done ?? []).filter((t) => t.completed === today);

  const late = tasks.filter((t) => t.due && t.due < today);
  const dueToday = tasks.filter((t) => t.due === today);
  const soon = tasks.filter((t) => t.due && t.due > today);
  const none = tasks.filter((t) => !t.due);
  const groups: { label: string; tone: string; items: RowTask[] }[] = [
    { label: "Atrasadas", tone: "text-alert", items: late },
    { label: "Hoje", tone: "text-accent", items: dueToday },
    { label: "Próximos dias", tone: "text-muted", items: soon },
    { label: "Sem data", tone: "text-muted", items: none },
    { label: "Feitas hoje", tone: "text-ok", items: doneToday.map((t) => ({ ...t, done: true })) },
  ].filter((g) => g.items.length > 0);

  const total = doneToday.length + late.length + dueToday.length;

  return (
    <Card title="Tarefas" action={ready && tasks.length > 0 ? <span className={pill}>{tasks.length} abertas</span> : null}>
      {!ready ? (
        <NotReady mano={mano} go={go} />
      ) : (
        <div className="flex flex-col gap-3.5">
          {mano.tasks?.error && <p className="text-xs text-alert">{mano.tasks.error}</p>}
          {total > 0 && (
            <div className="flex items-center gap-4 rounded-[18px] bg-soft px-4 py-3">
              <div className="flex shrink-0 flex-col">
                <span className="text-[12.5px] text-muted">Feito hoje</span>
                <span className="font-display text-[26px] font-medium leading-none">
                  {doneToday.length} <span className="text-base text-muted">de {total}</span>
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div aria-hidden className="flex gap-1">
                  {[...doneToday.map(() => "bg-ok"), ...dueToday.map(() => "bg-line"), ...late.map(() => "bg-alert/60")].map((c, i) => (
                    <span key={i} className={`h-2 flex-1 rounded-full ${c}`} />
                  ))}
                </div>
                <span className="truncate text-[12.5px] text-muted">
                  {[dueToday.length > 0 && `${dueToday.length} para hoje`, late.length > 0 && `${late.length} atrasada${late.length > 1 ? "s" : ""}`]
                    .filter(Boolean)
                    .join(" · ") || "tudo feito por hoje"}
                </span>
              </div>
            </div>
          )}

          {groups.length === 0 ? (
            <div className="flex flex-col gap-1 rounded-[18px] bg-soft p-4">
              <span className="font-display text-lg">Tudo em dia</span>
              <span className="text-sm text-muted">Nenhuma tarefa pendente.</span>
            </div>
          ) : (
            <div className="-mx-1 flex max-h-[440px] flex-col gap-3 overflow-y-auto px-1 [scrollbar-width:thin]">
              {groups.map((g) => (
                <section key={g.label} className="flex flex-col">
                  <h3 className={`flex justify-between px-1 pb-0.5 text-[11.5px] font-bold uppercase tracking-wider ${g.tone}`}>
                    {g.label}
                    <span className="text-muted">{g.items.length}</span>
                  </h3>
                  <ul className="flex flex-col">
                    {g.items.map((t) => (
                      <TaskRow key={t.id + (t.done ? "-f" : "")} t={t} today={today} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-line pt-3.5">
            <NewTask today={today} />
            <button type="button" onClick={() => goDay(today)} className="self-end py-1 text-sm font-bold text-accent hover:underline">
              Ver no calendário →
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function InboxCard({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const ready = mano.google?.connected;
  const g = mano.gmail;
  const msgs = g?.messages ?? [];
  return (
    <Card
      title="E-mail"
      action={
        ready && g?.unread != null ? (
          <a href="https://mail.google.com/mail/u/0/#inbox" target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-text">
            {g.unread} não lidos ↗
          </a>
        ) : null
      }
    >
      {!ready ? (
        <NotReady mano={mano} go={go} />
      ) : msgs.length === 0 ? (
        <p className="text-sm text-muted">{g?.updated ? "Nada novo na caixa principal." : "Carregando…"}</p>
      ) : (
        <>
        {g?.summary ? (
          <p className="mb-3 rounded-xl bg-ember-soft px-3 py-2 text-sm leading-relaxed">{g.summary.text}</p>
        ) : mano.llm?.enabled && mano.llm.reachable && mano.llm.model ? (
          <button
            className="mb-2 text-xs text-accent hover:underline disabled:opacity-50"
            disabled={mano.llm.busy === "e-mails"}
            onClick={() => mano.send("resume meus e-mails", false)}
          >
            {mano.llm.busy === "e-mails" ? "Resumindo…" : "Resumir com o modelo local"}
          </button>
        ) : null}
        <ul className="flex flex-col divide-y divide-line">
          {msgs.map((m) => (
            <li key={m.id}>
              <a href={m.url} target="_blank" rel="noreferrer" className="block py-2 text-sm hover:bg-ink/40">
                <div className="flex gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{m.from}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {isoDay(new Date(m.date)) === isoDay(new Date()) ? hhmm(m.date) : new Date(m.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                </div>
                <div className="truncate">{m.subject}</div>
                <div className="truncate text-xs text-muted">{m.snippet}</div>
              </a>
            </li>
          ))}
        </ul>
        </>
      )}
    </Card>
  );
}
