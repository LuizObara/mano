import { useState } from "react";
import { addDays, eventsApi, longDay, shortDay, tasksApi, type EventBody } from "../lib/agenda";
import { hhmm, isoDay, type CalEvent, type CalInfo } from "../lib/mano";
import { Icon, Modal, ModalHeader, input } from "./ui";

const DURATIONS = [
  { m: 30, label: "30 min" },
  { m: 60, label: "1 h" },
  { m: 90, label: "1 h 30" },
  { m: 120, label: "2 h" },
];

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fromMin = (n: number) => {
  const v = ((n % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

/** Próximo horário "redondo" (de 30 em 30 min) a partir de agora; 09:00 para outros dias. */
function defaultStart(day: string) {
  if (day !== isoDay(new Date())) return "09:00";
  const now = new Date();
  return fromMin(Math.min(23 * 60, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30));
}

/**
 * Criar ou editar um evento do Google Agenda. Na criação dá para pedir uma tarefa de preparo na véspera,
 * que vai para Tarefas com data limite.
 */
export function EventModal({
  event,
  day,
  calendars,
  onClose,
}: {
  event?: CalEvent;
  day: string;
  calendars: CalInfo[];
  onClose: () => void;
}) {
  const editing = !!event;
  const writable = calendars.filter((c) => c.writable);
  const cals = writable.length ? writable : [{ id: "primary", name: "Principal", color: null, primary: true, writable: true }];
  const initMin = event && !event.all_day ? Math.max(5, Math.round((event.end - event.start) / 60000)) : 60;

  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(event ? isoDay(new Date(event.start)) : day);
  const [allDay, setAllDay] = useState(event?.all_day ?? false);
  const [start, setStart] = useState(event && !event.all_day ? hhmm(event.start) : defaultStart(day));
  const [minutes, setMinutes] = useState(initMin);
  const [calId, setCalId] = useState(event?.calendar_id ?? (cals.find((c) => c.primary) ?? cals[0]).id);
  const [meet, setMeet] = useState(!!event?.meet);
  const [description, setDescription] = useState(event?.description ?? "");
  const [prep, setPrep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const save = async () => {
    const name = title.trim();
    if (!name) {
      setError("Dê um título ao evento.");
      return;
    }
    setBusy(true);
    setError(null);
    const when = { day: date, all_day: allDay, minutes, ...(allDay ? {} : { start: `${date}T${start}:00` }) };
    try {
      if (!event) {
        const body: EventBody = { title: name, ...when, calendar_id: calId, description: description.trim() || undefined, meet };
        await eventsApi.create(body);
        if (prep) await tasksApi.add(`Preparar: ${name}`, addDays(date, -1));
      } else {
        const patch: Partial<EventBody> = {};
        if (name !== event.title) patch.title = name;
        if (description !== (event.description ?? "")) patch.description = description;
        const timeChanged =
          date !== isoDay(new Date(event.start)) ||
          allDay !== event.all_day ||
          (!allDay && (start !== hhmm(event.start) || minutes !== initMin));
        if (timeChanged) Object.assign(patch, when);
        if (meet && !event.meet) patch.meet = true;
        if (Object.keys(patch).length) await eventsApi.update(event, patch);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    setBusy(true);
    try {
      await eventsApi.remove(event);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui excluir.");
      setBusy(false);
    }
  };

  const switches: { label: string; hint: string; on: boolean; set: (v: boolean) => void; hide?: boolean; locked?: boolean }[] = [
    { label: "Dia todo", hint: "Sem horário, aparece no topo do dia", on: allDay, set: setAllDay },
    {
      label: "Google Meet",
      hint: event?.meet ? "Este evento já tem link de chamada" : "Cria o link da chamada",
      on: meet,
      set: setMeet,
      locked: !!event?.meet,
    },
    {
      label: "Tarefa de preparo",
      hint: `Cria “Preparar: ${title.trim() || "…"}” para ${shortDay(addDays(date, -1))} em Tarefas`,
      on: prep,
      set: setPrep,
      hide: editing,
    },
  ];

  return (
    <Modal label={editing ? "Editar evento" : "Novo evento"} onClose={onClose} className="max-w-[560px]">
      <ModalHeader title={editing ? "Editar evento" : "Novo evento"} sub={longDay(date)} onClose={onClose} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-4 px-5 pb-6 sm:px-7"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-muted">Título</span>
          <input autoFocus className={`${input} min-h-12 text-[17px] font-semibold`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-muted">Dia</span>
            <input type="date" required className={`${input} min-h-12 text-[15px]`} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          {!allDay && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-muted" id="ev-hora">
                Horário
              </span>
              <div role="group" aria-labelledby="ev-hora" className="flex min-h-12 items-center gap-1 rounded-xl border border-line bg-ink px-1.5">
                <button type="button" onClick={() => setStart(fromMin(toMin(start) - 15))} aria-label="15 minutos antes" className="grid size-9 place-items-center rounded-full text-lg hover:bg-soft">
                  −
                </button>
                <input
                  type="time"
                  value={start}
                  onChange={(e) => e.target.value && setStart(e.target.value)}
                  aria-label="Início"
                  className="w-[4.6rem] bg-transparent text-center font-display text-xl tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:hidden"
                />
                <button type="button" onClick={() => setStart(fromMin(toMin(start) + 15))} aria-label="15 minutos depois" className="grid size-9 place-items-center rounded-full text-lg hover:bg-soft">
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {!allDay && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Duração" className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <button
                  key={d.m}
                  type="button"
                  aria-pressed={minutes === d.m}
                  onClick={() => setMinutes(d.m)}
                  className={`min-h-9 rounded-full border px-3.5 text-[13px] font-bold ${
                    minutes === d.m ? "border-ember bg-ember text-on-ember" : "border-line hover:bg-soft"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <span className="text-[13px] tabular-nums text-muted">
              {start} – {fromMin(toMin(start) + minutes)}
            </span>
          </div>
        )}

        {!editing && cals.length > 1 && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-muted">Agenda</span>
            <div role="group" aria-label="Agenda" className="flex flex-wrap gap-1.5">
              {cals.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={calId === c.id}
                  onClick={() => setCalId(c.id)}
                  className={`flex min-h-9 items-center gap-2 rounded-full border pl-2.5 pr-3.5 text-[13px] font-semibold ${
                    calId === c.id ? "border-text bg-soft" : "border-line hover:bg-soft"
                  }`}
                >
                  <span className="size-2.5 rounded-full" style={{ background: c.color ?? "var(--color-ember)" }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col overflow-hidden rounded-[18px] bg-soft">
          {switches
            .filter((s) => !s.hide)
            .map((s, i, arr) => (
              <button
                key={s.label}
                type="button"
                role="switch"
                aria-checked={s.on}
                disabled={s.locked}
                onClick={() => s.set(!s.on)}
                className={`flex min-h-[52px] items-center gap-3 px-4 py-2 text-left disabled:cursor-default ${i < arr.length - 1 ? "border-b border-line" : ""}`}
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px] font-semibold">{s.label}</span>
                  <span className="text-xs text-muted">{s.hint}</span>
                </span>
                <span className={`flex h-6 w-[42px] shrink-0 rounded-full p-[3px] transition-colors ${s.on ? "justify-end bg-ember" : "justify-start bg-line"}`}>
                  <span className="size-[18px] rounded-full bg-text shadow" />
                </span>
              </button>
            ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-muted">Descrição</span>
          <textarea
            className={`${input} min-h-[72px] resize-y text-[14px] leading-relaxed`}
            placeholder="Pauta, links…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error && <p className="rounded-xl bg-alert/15 px-3 py-2 text-sm text-alert">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {editing && event?.editable !== false && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className={`flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-bold disabled:opacity-50 ${
                confirmDel ? "bg-alert text-on-alert" : "bg-alert/15 text-alert hover:bg-alert/25"
              }`}
            >
              <Icon name="trash" className="size-4" />
              {confirmDel ? "Confirmar exclusão" : "Excluir"}
            </button>
          )}
          {event?.link && (
            <a href={event.link} target="_blank" rel="noreferrer" className="px-2 text-sm font-semibold text-accent hover:underline">
              Abrir no Google ↗
            </a>
          )}
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="min-h-11 rounded-full border border-line px-5 text-sm font-semibold hover:bg-soft">
            Cancelar
          </button>
          <button disabled={busy} className="min-h-11 rounded-full bg-ember px-6 text-sm font-bold text-on-ember disabled:opacity-50">
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
