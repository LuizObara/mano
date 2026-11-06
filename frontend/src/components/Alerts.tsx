import { api, hhmm, type Mano } from "../lib/mano";

type Item = {
  key: string;
  tone: "alert" | "ember";
  title: string;
  detail: string;
  actions: { label: string; primary?: boolean; run: () => Promise<unknown> }[];
};

/** Faixa fixa no rodapé com tudo que precisa de resposta agora + avisos passageiros no topo. */
export function Alerts({ mano }: { mano: Mano }) {
  const now = Date.now();
  const items: Item[] = [];

  const due = mano.doses.filter((d) => d.status === "pending" && d.reminders > 0 && d.scheduled_at <= now);
  if (due.length) {
    items.push({
      key: "meds:" + due.map((d) => d.id).join(","),
      tone: "ember",
      title: "Hora do remédio",
      detail: due.map((d) => `${d.name}${d.dose ? ` (${d.dose})` : ""} · ${hhmm(d.scheduled_at)}`).join("  ·  "),
      actions: [
        { label: "Tomei", primary: true, run: () => Promise.all(due.map((d) => api(`/api/meds/doses/${d.id}/take`, {}))) },
        { label: `Adiar ${mano.medSnoozeMin} min`, run: () => Promise.all(due.map((d) => api(`/api/meds/doses/${d.id}/snooze`, {}))) },
        { label: "Pular", run: () => Promise.all(due.map((d) => api(`/api/meds/doses/${d.id}/skip`, {}))) },
        { label: "Silenciar", run: () => api("/api/alarms/stop", {}) },
      ],
    });
  }
  for (const r of mano.reminders.filter((r) => r.status === "fired")) {
    items.push({
      key: "rem:" + r.id,
      tone: "ember",
      title: "Lembrete",
      detail: r.text,
      actions: [{ label: "Ok", primary: true, run: () => api(`/api/reminders/${r.id}/done`, {}) }],
    });
  }
  const ringing = mano.timers.filter((t) => t.status === "ringing");
  if (ringing.length) {
    items.push({
      key: "timers",
      tone: "alert",
      title: ringing.map((t) => t.label ?? "Timer").join(", ") + ": acabou!",
      detail: 'Diga "para" ou clique para dispensar.',
      actions: [
        { label: "Dispensar", primary: true, run: () => Promise.all(ringing.map((t) => api(`/api/timers/${t.id}/dismiss`, {}))) },
      ],
    });
  }

  // o som dos alarmes toca no backend (Ajustes → Alarmes e avisos), mesmo com o visor fechado

  return (
    <>
      {mano.notices.length > 0 && (
        <div className="fixed right-4 top-4 z-20 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
          {mano.notices.map((n) => (
            <button
              key={n.id}
              onClick={() => mano.dismissNotice(n.id)}
              className="rounded-xl border border-line bg-panel/95 p-3 text-left shadow-xl backdrop-blur"
            >
              <div className="text-xs uppercase tracking-widest text-muted">{n.title}</div>
              <div className="mt-1 text-sm">{n.text}</div>
            </button>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <>
          <div style={{ height: `${items.length * 6}rem` }} />
          <div className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-4 sm:p-6" role="alert">
            {items.map((it) => (
              <div
                key={it.key}
                className={`mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 rounded-2xl border bg-panel p-4 shadow-2xl ${
                  it.tone === "alert" ? "border-alert" : "border-ember"
                }`}
              >
                <span className={`size-3 shrink-0 rounded-full blink ${it.tone === "alert" ? "bg-alert" : "bg-ember"}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-medium">{it.title}</div>
                  <div className="truncate text-sm text-muted">{it.detail}</div>
                </div>
                <div className="flex gap-2">
                  {it.actions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => void a.run()}
                      className={
                        a.primary
                          ? `rounded-xl px-5 py-2.5 font-medium ${it.tone === "alert" ? "bg-alert text-on-alert" : "bg-ember text-on-ember"}`
                          : "rounded-xl border border-line px-3 py-2.5 text-sm hover:border-ember/50"
                      }
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
