import { useState } from "react";
import { api, fmtLeft, useNow, type Timer } from "../lib/mano";
import { Card } from "./ui";

export function Timers({ timers }: { timers: Timer[] }) {
  const now = useNow(250);
  const [minutes, setMinutes] = useState("");
  const [label, setLabel] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseFloat(minutes.replace(",", "."));
    if (!m || m <= 0) return;
    await api("/api/timers", { seconds: Math.round(m * 60), label: label.trim() || null });
    setMinutes("");
    setLabel("");
  };

  return (
    <Card title="Timers">
      {timers.length === 0 && <p className="text-muted text-sm">Nenhum timer. Diga "timer de 10 minutos pro arroz".</p>}
      <ul className="flex flex-col gap-2">
        {timers.map((t) => {
          const ringing = t.status === "ringing";
          const left = t.ends_at - now;
          const pct = ringing ? 100 : Math.min(100, 100 - (left / (t.duration_s * 1000)) * 100);
          return (
            <li key={t.id} className={`rounded-xl border p-3 ${ringing ? "border-alert bg-alert/10" : "border-line"}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm text-muted first-letter:uppercase">{t.label ?? "Timer"}</div>
                  <div className={`text-2xl tabular-nums ${ringing ? "text-alert blink" : ""}`}>
                    {ringing ? "Acabou!" : fmtLeft(left)}
                  </div>
                </div>
                <button
                  onClick={() => api(`/api/timers/${t.id}/${ringing ? "dismiss" : "cancel"}`, {})}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-ember/50"
                >
                  {ringing ? "Dispensar" : "Cancelar"}
                </button>
              </div>
              <div className="mt-2 h-1 rounded-full bg-line overflow-hidden">
                <div className={`h-full ${ringing ? "bg-alert" : "bg-ember"}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="mt-3 flex gap-2">
        <input
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          inputMode="decimal"
          placeholder="min"
          aria-label="Minutos"
          className="w-16 rounded-lg border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-ember/60"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="nome (opcional)"
          aria-label="Nome do timer"
          className="flex-1 min-w-0 rounded-lg border border-line bg-ink px-2 py-1.5 text-sm outline-none focus:border-ember/60"
        />
        <button className="rounded-lg bg-line px-3 py-1.5 text-sm hover:bg-ember hover:text-ink">Criar</button>
      </form>
    </Card>
  );
}
