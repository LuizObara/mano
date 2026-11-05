import { useEffect, useRef } from "react";
import { api, hhmm, type Mano } from "../lib/mano";

let audio: AudioContext | null = null;

function tone(notes: number[], gap = 0.18) {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    const t0 = audio.currentTime;
    notes.forEach((f, i) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.frequency.value = f;
      const t = t0 + i * gap;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + gap - 0.02);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t);
      osc.stop(t + gap);
    });
  } catch {
    /* navegador bloqueou o áudio antes do primeiro clique; a voz do backend ainda avisa */
  }
}

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
        { label: "Adiar 10 min", run: () => Promise.all(due.map((d) => api(`/api/meds/doses/${d.id}/snooze`, {}))) },
        { label: "Pular", run: () => Promise.all(due.map((d) => api(`/api/meds/doses/${d.id}/skip`, {}))) },
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

  // bipe contínuo para timer; um "plim" quando surge alerta novo de remédio/lembrete
  const timerRinging = ringing.length > 0;
  useEffect(() => {
    if (!timerRinging) return;
    tone([880, 1175]);
    const id = window.setInterval(() => tone([880, 1175]), 1500);
    return () => window.clearInterval(id);
  }, [timerRinging]);

  const seen = useRef(new Set<string>());
  const softKeys = items.filter((i) => i.tone === "ember").map((i) => i.key).join("|");
  useEffect(() => {
    const keys = softKeys ? softKeys.split("|") : [];
    if (keys.some((k) => !seen.current.has(k))) tone([660, 990, 1320], 0.14);
    seen.current = new Set(keys);
  }, [softKeys]);

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
