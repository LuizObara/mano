import { useEffect, useState } from "react";
import { KIND_ICON } from "../lib/habits";
import { api, fmtAmount, hhmm, useNow, type Mano } from "../lib/mano";
import { Icon } from "./ui";

/**
 * Aviso de hábito no canto da tela: chega pelo WebSocket ("habit.remind"), some sozinho no prazo
 * configurado e deixa registrar, adiar ou silenciar sem abrir a aba Hábitos.
 */
export function HabitNudge({ mano }: { mano: Mano }) {
  const n = mano.nudge;
  const now = useNow(1000);
  const [done, setDone] = useState<string | null>(null);
  const [undo, setUndo] = useState<(() => Promise<unknown>) | null>(null);
  const [amount, setAmount] = useState("");
  useEffect(() => {
    setDone(null);
    setUndo(null);
    setAmount("");
  }, [n?.at]);
  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => mano.setNudge(null), 8000);
    return () => window.clearTimeout(id);
  }, [done, mano]);

  if (!n || (now >= n.expires_at && !done)) return null;
  const close = () => mano.setNudge(null);
  const habit = mano.habits.find((h) => h.id === n.habit_id);
  const left = Math.max(0, n.expires_at - now) / (n.expires_at - n.at);

  const log = async (v: number) => {
    const r = await api<{ id: number | null }>(`/api/habits/${n.habit_id}/log`, { amount: v, via: "lembrete" });
    if (r.id) setUndo(() => () => api(`/api/habits/logs/${r.id}`, undefined, "DELETE"));
    const total = n.amount + v;
    setDone(n.goal ? `Anotado. Agora ${fmtAmount(total, n.unit)} de ${fmtAmount(n.goal, n.unit)}.` : `Anotado: ${fmtAmount(v, n.unit)}.`);
  };
  const finish = async () => {
    await api(`/api/habits/${n.habit_id}/toggle`, { done: true });
    setUndo(() => () => api(`/api/habits/${n.habit_id}/toggle`, { done: false }));
    setDone(`${n.name}: feito!`);
  };
  const later = async () => {
    await api(`/api/habits/${n.habit_id}/snooze`, {});
    close();
  };
  const enough = async () => {
    await api(`/api/habits/${n.habit_id}/silence`, {});
    close();
  };

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-30 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-3xl border border-line bg-panel shadow-2xl"
    >
      {done ? (
        <div className="flex items-center gap-3 p-5">
          <span className="grid size-9 place-items-center rounded-full bg-ok text-panel">
            <Icon name="check" className="size-[18px]" />
          </span>
          <span className="flex-1">{done}</span>
          {undo && (
            <button
              onClick={() => undo().catch(() => {}).finally(close)}
              className="min-h-9 rounded-full px-3 text-sm font-semibold text-accent hover:bg-soft"
            >
              Desfazer
            </button>
          )}
          <button onClick={close} aria-label="Fechar" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-soft">
            <Icon name="x" className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 p-4.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8.5 place-items-center rounded-[11px] bg-ember text-on-ember">
              {n.icon ? <span className="text-base leading-none">{n.icon}</span> : <Icon name={KIND_ICON[n.kind]} className="size-[18px]" />}
            </span>
            <strong className="flex-1 truncate">{n.name}</strong>
            <span className="text-[13px] text-muted">{hhmm(n.at)}</span>
            <button onClick={close} aria-label="Fechar aviso" className="-mr-1 grid size-8 place-items-center rounded-lg text-muted hover:bg-soft">
              <Icon name="x" className="size-4" />
            </button>
          </div>
          <p className="font-display text-[22px] leading-snug">{n.message}</p>
          {n.goal && (
            <div className="flex items-center gap-2.5 text-[13px] text-muted">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft">
                <div className="h-full bg-ember" style={{ width: `${Math.min(100, (100 * n.amount) / n.goal)}%` }} />
              </div>
              {fmtAmount(n.amount, n.unit)} de {fmtAmount(n.goal, n.unit)}
            </div>
          )}
          {n.kind === "check" ? (
            <button onClick={finish} className="min-h-12 rounded-full bg-ember text-base font-semibold text-on-ember">
              Feito
            </button>
          ) : n.quick.length ? (
            <div className="flex gap-2">
              {n.quick.map((v, i) => (
                <button
                  key={v}
                  onClick={() => log(v)}
                  className={`min-h-11 flex-1 rounded-full font-semibold ${i === 0 ? "bg-ember text-on-ember" : "border border-line hover:bg-soft"}`}
                >
                  +{fmtAmount(v, n.unit)}
                </button>
              ))}
            </div>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = parseFloat(amount.replace(",", "."));
                if (v > 0) log(v);
              }}
            >
              <label className="flex flex-1 items-center gap-1.5 rounded-full border border-line bg-ink px-4 text-sm text-muted focus-within:border-accent">
                <input
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-label={`Quantidade em ${n.unit}`}
                  className="min-h-11 w-full min-w-0 bg-transparent text-base text-text outline-none"
                />
                {n.unit}
              </label>
              <button className="min-h-11 rounded-full bg-ember px-4.5 font-semibold text-on-ember">Registrar</button>
            </form>
          )}
          <div className="flex justify-between text-sm">
            <button onClick={later} className="min-h-9 text-muted hover:text-text">
              Agora não{habit ? ` (${habit.reminder.snooze_min} min)` : ""}
            </button>
            <button onClick={enough} className="min-h-9 text-muted hover:text-text">
              Chega por hoje
            </button>
          </div>
        </div>
      )}
      {!done && (
        <div className="h-1 bg-soft">
          <div className="h-full bg-muted/50 transition-[width] duration-1000 ease-linear" style={{ width: `${left * 100}%` }} />
        </div>
      )}
    </div>
  );
}
