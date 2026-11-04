import { useEffect } from "react";
import { api, type Timer } from "../lib/mano";

let ctx: AudioContext | null = null;

function beep() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [i, f] of [880, 1175].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + i * 0.18);
      osc.stop(t0 + i * 0.18 + 0.17);
    }
  } catch {
    /* navegador bloqueou áudio antes de qualquer clique; a voz do backend ainda avisa */
  }
}

/** Faixa fixa enquanto algum timer está tocando, com bipe repetido. */
export function Ringer({ timers }: { timers: Timer[] }) {
  const ringing = timers.filter((t) => t.status === "ringing");
  const active = ringing.length > 0;

  useEffect(() => {
    if (!active) return;
    beep();
    const id = window.setInterval(beep, 1500);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;
  const names = ringing.map((t) => t.label ?? "timer").join(", ");
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 p-4 sm:p-6" role="alert">
      <div className="mx-auto max-w-3xl flex items-center gap-4 rounded-2xl border border-alert bg-panel p-4 shadow-2xl">
        <span className="size-3 rounded-full bg-alert blink" />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-medium truncate first-letter:uppercase">{names}: acabou!</div>
          <div className="text-sm text-muted">Diga "para" ou clique para dispensar.</div>
        </div>
        <button
          autoFocus
          onClick={() => Promise.all(ringing.map((t) => api(`/api/timers/${t.id}/dismiss`, {})))}
          className="rounded-xl bg-alert px-5 py-2.5 font-medium text-ink"
        >
          Dispensar
        </button>
      </div>
    </div>
  );
}
