import { fmtLeft, hhmm, useNow, type Mano } from "../lib/mano";
import { ClockShelf } from "./ClockShelf";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

function greeting(h: number) {
  if (h < 5) return "Boa noite.";
  if (h < 12) return "Bom dia.";
  if (h < 18) return "Boa tarde.";
  return "Boa noite.";
}

type Next = { key: string; at: number; time: string; label: string; kind: string };

/** O que vem a seguir hoje: compromissos, doses de remédio e timers. */
function upcoming(mano: Mano, now: number): Next[] {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const items: Next[] = [];
  for (const e of mano.calendar?.events ?? []) {
    if (!e.all_day && e.end > now && e.start <= end.getTime()) {
      items.push({ key: `e${e.id}`, at: e.start, time: e.start <= now ? "agora" : hhmm(e.start), label: e.title, kind: "agenda" });
    }
  }
  for (const d of mano.doses) {
    if (d.status === "pending") {
      items.push({ key: `d${d.id}`, at: d.scheduled_at, time: hhmm(d.scheduled_at), label: d.name, kind: "remédio" });
    }
  }
  for (const t of mano.timers) {
    if (t.status === "running") {
      items.push({ key: `t${t.id}`, at: t.ends_at, time: fmtLeft(t.ends_at - now), label: t.label ?? "Timer", kind: "timer" });
    }
  }
  return items.sort((a, b) => a.at - b.at).slice(0, 4);
}

/** Bloco escuro do Início: saudação, relógio grande e o que vem a seguir. */
export function Clock({ mano }: { mano: Mano }) {
  const now = useNow(1000);
  const d = new Date(now);
  const next = upcoming(mano, now);
  return (
    <section className="flex min-w-0 flex-[1_1_340px] flex-col gap-5 rounded-[30px] bg-deep p-6 text-deep-text sm:p-8">
      <div className="flex flex-col gap-1.5">
        <span className="font-display text-2xl italic text-glow">{greeting(d.getHours())}</span>
        <span className="font-display text-[clamp(76px,9vw,124px)] font-light leading-[0.88] tracking-[-0.04em] tabular-nums">
          {String(d.getHours()).padStart(2, "0")}
          <span className="blink text-glow">:</span>
          {String(d.getMinutes()).padStart(2, "0")}
        </span>
        <span className="text-base text-deep-muted first-letter:uppercase">{dateFmt.format(d)}</span>
      </div>
      <div className="flex flex-col border-t border-deep-line pt-4">
        <span className="pb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-deep-muted">A seguir</span>
        {next.length === 0 && <span className="py-2 text-deep-muted">Nada marcado para o resto do dia.</span>}
        {next.map((n) => (
          <div key={n.key} className="flex items-center gap-3.5 py-2.5">
            <span className="w-14 shrink-0 font-semibold tabular-nums text-glow">{n.time}</span>
            <span className="min-w-0 flex-1 truncate">{n.label}</span>
            <span className="text-sm text-deep-muted">{n.kind}</span>
          </div>
        ))}
      </div>
      <ClockShelf mano={mano} />
    </section>
  );
}
