import { useState } from "react";
import { api, hhmm, isoDay, useNow, type CalEvent, type Mano } from "../lib/mano";
import { Card, input } from "./ui";

/** Aviso padrão quando a conta Google ainda não está pronta. */
function NotReady({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const g = mano.google;
  return (
    <p className="text-sm text-muted">
      {g?.configured ? "Falta conectar sua conta Google." : "Conta Google não configurada."}{" "}
      <button className="text-ember underline-offset-2 hover:underline" onClick={() => go("ajustes")}>
        Ir para Ajustes
      </button>
    </p>
  );
}

const dayTitle = (d: Date, today: Date) => {
  const diff = Math.round((new Date(isoDay(d)).getTime() - new Date(isoDay(today)).getTime()) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "short" });
};

export function AgendaCard({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const now = useNow(30000);
  const ready = mano.google?.connected;
  const events = (mano.calendar?.events ?? []).filter((e) => e.end > now);

  // agrupa por dia (só os 4 primeiros dias com eventos)
  const groups: { label: string; items: CalEvent[] }[] = [];
  for (const e of events) {
    const label = dayTitle(new Date(Math.max(e.start, now)), new Date(now));
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(e);
    else if (groups.length < 4) groups.push({ label, items: [e] });
  }

  return (
    <Card title="Agenda" action={ready && mano.calendar?.error ? <span className="text-xs text-alert">{mano.calendar.error}</span> : null}>
      {!ready ? (
        <NotReady mano={mano} go={go} />
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted">Nada marcado nos próximos dias.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="mb-1.5 text-sm text-muted first-letter:uppercase">{g.label}</h3>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((e) => {
                  const live = !e.all_day && e.start <= now && now < e.end;
                  return (
                    <li key={e.id + e.start}>
                      <a
                        href={e.meet ?? e.link ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex gap-3 rounded-lg border-l-2 px-2 py-1 text-sm hover:bg-ink/50 ${live ? "bg-ember-soft" : ""}`}
                        style={{ borderColor: e.color ?? "var(--color-ember)" }}
                      >
                        <span className="w-12 shrink-0 tabular-nums text-muted">{e.all_day ? "dia" : hhmm(e.start)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{e.title}</span>
                          {e.location && <span className="block truncate text-xs text-muted">{e.location}</span>}
                        </span>
                        {live && <span className="self-center text-xs text-ember">agora</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function TasksCard({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const ready = mano.google?.connected;
  const today = isoDay(new Date());
  const tasks = mano.tasks?.tasks ?? [];

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy("new");
    try {
      await api("/api/tasks", { title });
      setTitle("");
    } finally {
      setBusy(null);
    }
  };

  const complete = async (id: string) => {
    setBusy(id);
    try {
      await api(`/api/tasks/${id}/complete`, {});
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Tarefas" action={ready && tasks.length > 0 ? <span className="text-xs tabular-nums text-muted">{tasks.length}</span> : null}>
      {!ready ? (
        <NotReady mano={mano} go={go} />
      ) : (
        <>
          {tasks.length === 0 && <p className="text-sm text-muted">Nenhuma tarefa pendente.</p>}
          <ul className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {tasks.map((t) => {
              const late = t.due && t.due < today;
              return (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-ink/50">
                    <input
                      type="checkbox"
                      checked={busy === t.id}
                      disabled={busy === t.id}
                      onChange={() => complete(t.id)}
                      aria-label={`Concluir ${t.title}`}
                      className="mt-0.5 size-4 shrink-0 accent-ember"
                    />
                    <span className="min-w-0 flex-1">{t.title}</span>
                    {t.due && (
                      <span className={`shrink-0 text-xs tabular-nums ${late ? "text-alert" : "text-muted"}`}>
                        {t.due === today ? "hoje" : t.due.split("-").reverse().slice(0, 2).join("/")}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
          <form onSubmit={add} className="mt-2 flex gap-2">
            <input
              className={`${input} min-w-0 flex-1 py-1.5`}
              placeholder="Nova tarefa"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Nova tarefa"
            />
            <button className="rounded-lg bg-line px-3 py-1.5 text-sm hover:bg-ember hover:text-ink disabled:opacity-40" disabled={busy === "new"}>
              Adicionar
            </button>
          </form>
        </>
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
      )}
    </Card>
  );
}
