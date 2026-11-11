import { useState } from "react";
import { api, fmtLeft, useNow, type Timer } from "../lib/mano";
import { useStored } from "../lib/prefs";
import { Card } from "./ui";

/**
 * Painel de timers: cada timer num cartão com anel de progresso (+1 min, cancelar; quando acaba, parar e +5 min),
 * atalhos de tempo para começar com um toque (inclui o último timer com nome que você criou) e um seletor de minutos.
 * Em painel largo os timers ficam em duas colunas.
 */

const PRESETS: { seconds: number; label: string | null; sub?: string }[] = [
  { seconds: 60, label: null },
  { seconds: 180, label: "chá", sub: "chá" },
  { seconds: 300, label: null },
  { seconds: 600, label: null },
  { seconds: 1500, label: "foco", sub: "foco" },
];
type Last = { seconds: number; label: string } | null;

const span = (s: number) => (s >= 5400 ? `${(s / 3600).toFixed(1).replace(".", ",").replace(",0", "")} h` : `${Math.round(s / 60)} min`);

export function Timers({ timers }: { timers: Timer[] }) {
  const now = useNow(250);
  const [minutes, setMinutes] = useState(10);
  const [label, setLabel] = useState("");
  const [last, setLast] = useStored<Last>("mano.lastTimer", null);

  const start = (seconds: number, name: string | null) => api("/api/timers", { seconds, label: name }).catch(() => {});
  const startCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!minutes || minutes <= 0) return;
    const seconds = Math.round(minutes * 60);
    const name = label.trim() || null;
    start(seconds, name);
    if (name) setLast({ seconds, label: name });
    setLabel("");
  };

  const running = timers.filter((t) => t.status === "running").length;
  const ringing = timers.length - running;
  const count = [running && `${running} rodando`, ringing && `${ringing} tocando`].filter(Boolean).join(" · ");
  const presets = [
    ...PRESETS,
    ...(last && !PRESETS.some((p) => p.seconds === last.seconds && p.label === last.label)
      ? [{ seconds: last.seconds, label: last.label, sub: `${last.label} · último`, last: true }]
      : []),
  ] as (typeof PRESETS[number] & { last?: boolean })[];
  const empty = timers.length === 0;

  return (
    <Card title="Timers" action={count ? <span className="text-[13px] tabular-nums text-muted">{count}</span> : null}>
      <div className="@container flex flex-col gap-4">
        {empty ? (
          <p className="text-[13.5px] leading-snug text-muted">Nenhum timer rodando. Toque num tempo ou diga “timer de 10 minutos pro arroz”.</p>
        ) : (
          <ul className="grid gap-2.5 @[520px]:grid-cols-2">
            {timers.map((t) => (
              <TimerCard key={t.id} t={t} now={now} />
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2">
          {!empty && <span className="text-[13px] font-semibold text-text/85">Começar rápido</span>}
          <div className={empty ? "grid grid-cols-3 gap-2" : "flex flex-wrap gap-2"}>
            {presets.map((p) => (
              <button
                key={`${p.seconds}-${p.label}`}
                type="button"
                onClick={() => start(p.seconds, p.label)}
                className={
                  empty
                    ? `flex min-h-14 flex-col items-center justify-center rounded-2xl border hover:bg-soft ${p.last ? "border-ember/45 bg-ember/[0.07]" : "border-line"}`
                    : `inline-flex min-h-10 items-baseline gap-1.5 rounded-full border px-3.5 hover:bg-soft ${p.last ? "border-ember/45" : "border-line"}`
                }
              >
                <strong className={`font-semibold ${empty ? "text-[17px]" : "text-sm"}`}>{span(p.seconds)}</strong>
                {p.sub && <span className={`text-xs ${p.last ? "text-accent" : "text-muted"}`}>{p.sub}</span>}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={startCustom} className={`flex items-center gap-2 ${empty ? "" : "border-t border-line pt-3.5"}`}>
          <div role="group" aria-label="Minutos" className="flex shrink-0 items-center rounded-[14px] border border-line bg-ink focus-within:border-accent">
            <button
              type="button"
              aria-label="Menos 1 minuto"
              onClick={() => setMinutes((m) => Math.max(1, Math.round(m) - 1))}
              className="h-11 w-9 rounded-l-[13px] text-lg text-muted hover:bg-soft hover:text-text"
            >
              −
            </button>
            <label className="flex items-baseline gap-1 px-0.5">
              <span className="sr-only">Minutos do timer</span>
              <input
                value={minutes || ""}
                onChange={(e) => setMinutes(Math.min(1440, Number(e.target.value.replace(/\D/g, "")) || 0))}
                inputMode="numeric"
                className="w-8 bg-transparent text-right text-[15px] font-semibold tabular-nums outline-none"
              />
              <span className="text-[13px] text-muted">min</span>
            </label>
            <button
              type="button"
              aria-label="Mais 1 minuto"
              onClick={() => setMinutes((m) => Math.min(1440, Math.round(m) + 1))}
              className="h-11 w-9 rounded-r-[13px] text-lg text-muted hover:bg-soft hover:text-text"
            >
              +
            </button>
          </div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="nome (opcional)"
            aria-label="Nome do timer"
            className="h-11 min-w-0 flex-1 rounded-[14px] border border-line bg-ink px-3 text-sm outline-none placeholder:text-muted/70 focus:border-accent"
          />
          <button
            disabled={!minutes}
            aria-label="Começar o timer"
            className="h-11 shrink-0 rounded-full bg-ember px-4 text-sm font-semibold text-on-ember hover:brightness-105 disabled:opacity-40"
          >
            Começar
          </button>
        </form>
      </div>
    </Card>
  );
}

const C = 2 * Math.PI * 27;

function TimerCard({ t, now }: { t: Timer; now: number }) {
  const ringing = t.status === "ringing";
  const left = Math.max(0, t.ends_at - now);
  const frac = ringing ? 0 : Math.min(1, left / (t.duration_s * 1000));
  const name = t.label ?? "Timer";
  const act = (path: string, body: unknown = {}) => api(`/api/timers/${t.id}/${path}`, body).catch(() => {});
  const btn = "min-h-8 rounded-full px-3 text-[13px] font-semibold";
  return (
    <li className={`flex items-center gap-3.5 rounded-[18px] border py-3 pl-3.5 pr-3 ${ringing ? "border-alert bg-alert/10" : "border-line"}`}>
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
            className={ringing ? "stroke-alert" : "stroke-ember"}
            strokeDasharray={C}
            strokeDashoffset={ringing ? 0 : C * (1 - frac)}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[11.5px] font-semibold text-muted">{span(t.duration_s)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] text-muted first-letter:uppercase">{name}</div>
        <div className={`font-display text-[30px] font-medium leading-tight tabular-nums ${ringing ? "blink text-alert" : ""}`}>
          {ringing ? "Acabou!" : fmtLeft(left)}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ringing ? (
            <>
              <button type="button" onClick={() => act("dismiss")} aria-label={`Parar o timer ${name}`} className={`${btn} bg-alert text-on-alert hover:brightness-105`}>
                Parar
              </button>
              <button type="button" onClick={() => act("extend", { seconds: 300 })} aria-label={`Mais 5 minutos em ${name}`} className={`${btn} border border-line hover:bg-soft`}>
                +5 min
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => act("extend", { seconds: 60 })} aria-label={`Mais 1 minuto em ${name}`} className={`${btn} border border-line hover:bg-soft`}>
                +1 min
              </button>
              <button type="button" onClick={() => act("cancel")} aria-label={`Cancelar o timer ${name}`} className={`${btn} border border-line text-muted hover:bg-soft hover:text-text`}>
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}
