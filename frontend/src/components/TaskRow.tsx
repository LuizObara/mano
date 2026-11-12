import { useEffect, useState } from "react";
import { addDays, DUE_TONE, dueLabel, goDay, tasksApi } from "../lib/agenda";
import { Icon } from "./ui";

/** Escolher a data limite: atalhos + um dia qualquer. Usado na linha da tarefa e no campo de nova tarefa. */
export function DuePicker({
  due,
  today,
  onPick,
  extra,
}: {
  due: string | null;
  today: string;
  onPick: (due: string | null) => void;
  extra?: React.ReactNode;
}) {
  const chip = "min-h-8 rounded-full border border-line bg-panel px-3 text-[13px] font-semibold hover:bg-soft";
  const base = due && due > today ? due : today;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={chip} onClick={() => onPick(today)}>
        Hoje
      </button>
      <button type="button" className={chip} onClick={() => onPick(addDays(today, 1))}>
        Amanhã
      </button>
      <button type="button" className={chip} onClick={() => onPick(addDays(base, 7))} title="Uma semana depois da data atual (ou de hoje)">
        +1 semana
      </button>
      {due && (
        <button type="button" className={chip} onClick={() => onPick(null)}>
          Sem data
        </button>
      )}
      <label className="flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-panel pl-3 pr-1 text-[13px] font-semibold">
        <span className="sr-only">Escolher dia</span>
        <Icon name="calendar" className="size-3.5 text-muted" />
        <input
          type="date"
          value={due ?? ""}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="w-[8.6rem] bg-transparent text-[13px] outline-none [color-scheme:inherit]"
        />
      </label>
      {extra}
    </div>
  );
}

/** Bolinha de concluir (verde com ✓ quando feita). */
export function CheckDot({ done, busy, onClick, label }: { done: boolean; busy?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={done}
      aria-label={label}
      className="group/check grid size-10 shrink-0 place-items-center rounded-full disabled:opacity-60"
    >
      <span
        className={`grid size-[22px] place-items-center rounded-full border-2 transition-all duration-200 ${
          done ? "scale-105 border-ok bg-ok text-ink" : "border-muted/70 text-transparent group-hover/check:border-ok group-hover/check:text-ok/60"
        }`}
      >
        <Icon name="check" className="size-3" />
      </span>
    </button>
  );
}

export type RowTask = { id: string; title: string; due: string | null; done?: boolean };

/**
 * Uma tarefa: concluir/reabrir, renomear (clique no título), mudar a data pelo chip e excluir.
 * Fica marcada na hora (otimista) e some/volta quando o Google confirma.
 */
export function TaskRow({ t, today, showDate = true }: { t: RowTask; today: string; showDate?: boolean }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const done = optimistic ?? !!t.done;
  const d = dueLabel(t.due, today);
  useEffect(() => setOptimistic(null), [t.done]); // o Google confirmou

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      setOptimistic(null);
    } finally {
      setBusy(false);
    }
  };
  const toggle = () => {
    setOptimistic(!done);
    run(() => (done ? tasksApi.reopen(t.id) : tasksApi.complete(t.id)));
  };
  const setDue = (due: string | null) => {
    setOpen(false);
    run(() => tasksApi.update(t.id, { due }));
  };
  const saveTitle = () => {
    setEditing(false);
    const v = title.trim();
    if (v && v !== t.title) run(() => tasksApi.update(t.id, { title: v }));
    else setTitle(t.title);
  };

  return (
    <li className={`rounded-[14px] transition-colors ${open ? "bg-soft/70" : ""}`}>
      <div className="flex items-center gap-1.5 rounded-[14px] py-0.5 pr-1.5 hover:bg-soft/50">
        <CheckDot done={done} busy={busy} onClick={toggle} label={done ? `Reabrir ${t.title}` : `Concluir ${t.title}`} />
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") {
                setTitle(t.title);
                setEditing(false);
              }
            }}
            aria-label="Título da tarefa"
            className="min-w-0 flex-1 rounded-lg border border-accent bg-ink px-2 py-1 text-[15px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (done) return;
              setTitle(t.title);
              setEditing(true);
            }}
            title={done ? undefined : "Clique para renomear"}
            className={`min-w-0 flex-1 py-1.5 text-left text-[15px] leading-snug ${done ? "text-muted line-through" : ""}`}
          >
            {t.title}
          </button>
        )}
        {!showDate && !done && (
          <button
            type="button"
            onClick={() => setDue(addDays(t.due ?? today, 1))}
            title="Passar para o dia seguinte"
            className="min-h-8 shrink-0 rounded-full px-2.5 text-xs font-bold text-muted hover:bg-soft hover:text-text"
          >
            +1 dia
          </button>
        )}
        {!done && (
          <button
            type="button"
            onClick={() => {
              setOpen(!open);
              setConfirmDel(false);
            }}
            aria-expanded={open}
            aria-label={`Data limite: ${d.label}. Alterar ou excluir`}
            title={showDate && d.tone !== "none" ? undefined : "Mudar a data ou excluir"}
            className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border text-xs font-bold tabular-nums ${
              showDate && d.tone !== "none" ? `px-2.5 ${DUE_TONE[d.tone]}` : "w-8 justify-center border-transparent text-muted hover:border-line hover:text-text"
            } ${open ? "!border-accent" : ""}`}
          >
            <Icon name="calendar" className="size-3" />
            {showDate && d.tone !== "none" && d.label}
          </button>
        )}
      </div>
      {open && (
        <div className="pb-3 pl-11 pr-2 pt-1">
          <DuePicker
            due={t.due}
            today={today}
            onPick={setDue}
            extra={
              <>
                {t.due && (
                  <button
                    type="button"
                    onClick={() => goDay(t.due!)}
                    className="min-h-8 rounded-full border border-line bg-panel px-3 text-[13px] font-semibold text-accent hover:bg-soft"
                  >
                    Ver no calendário
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (confirmDel ? run(() => tasksApi.remove(t.id)) : setConfirmDel(true))}
                  className={`flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${
                    confirmDel ? "bg-alert text-on-alert" : "bg-alert/15 text-alert hover:bg-alert/25"
                  }`}
                >
                  <Icon name="trash" className="size-3.5" />
                  {confirmDel ? "Confirmar exclusão" : "Excluir"}
                </button>
              </>
            }
          />
        </div>
      )}
    </li>
  );
}

/** Campo de nova tarefa com chip de data limite (abre os atalhos). */
export function NewTask({ today, fixedDue, placeholder = "Nova tarefa" }: { today: string; fixedDue?: string; placeholder?: string }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(fixedDue ?? null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const target = fixedDue ?? due;
  const d = dueLabel(target, today);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await tasksApi.add(title.trim(), target);
      setTitle("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={add} className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 rounded-[14px] border border-line bg-ink py-1 pl-3.5 pr-1 focus-within:border-accent">
        <input
          className="min-h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
          placeholder={placeholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Nova tarefa"
        />
        {!fixedDue && (
          <button
            type="button"
            onClick={() => setPicking(!picking)}
            aria-expanded={picking}
            aria-label={`Data limite da nova tarefa: ${d.label}. Trocar`}
            className={`flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-bold ${DUE_TONE[d.tone]}`}
          >
            <Icon name="calendar" className="size-3" />
            {d.label}
          </button>
        )}
        <button disabled={busy || !title.trim()} className="min-h-9 shrink-0 rounded-[10px] bg-ember px-3.5 text-sm font-bold text-on-ember disabled:opacity-40">
          {busy ? "Adicionando…" : "Adicionar"}
        </button>
      </div>
      {picking && !fixedDue && (
        <DuePicker
          due={due}
          today={today}
          onPick={(v) => {
            setDue(v);
            setPicking(false);
          }}
        />
      )}
    </form>
  );
}
