import { api, fmtAmount, hhmm, useNow, type Mano } from "../lib/mano";
import { Card, StatusPill } from "./ui";

/** Resumo do dia na tela inicial: remédios, hábitos e próximos lembretes. */
export function Today({ mano, go }: { mano: Mano; go: (page: string) => void }) {
  const now = useNow(30000);
  const habits = mano.habits.filter((h) => h.today_scheduled);
  const doneCount = habits.filter((h) => h.done_today).length;
  const upcoming = mano.reminders.filter((r) => r.status === "pending").slice(0, 3);
  const empty = mano.doses.length === 0 && habits.length === 0 && upcoming.length === 0;

  return (
    <Card title="Remédios e hábitos">
      {empty && (
        <p className="text-sm text-muted">
          Nada marcado. Cadastre{" "}
          <button className="text-accent underline-offset-2 hover:underline" onClick={() => go("remedios")}>
            remédios
          </button>{" "}
          ou{" "}
          <button className="text-accent underline-offset-2 hover:underline" onClick={() => go("habitos")}>
            hábitos
          </button>
          , ou diga "me lembra de… às 8".
        </p>
      )}

      {mano.doses.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm text-muted">Remédios</h3>
          <ul className="flex flex-col gap-1.5">
            {mano.doses.map((d) => {
              const status = d.status === "pending" && d.scheduled_at > now ? "later" : d.status;
              return (
                <li key={d.id} className="flex items-center gap-3 text-sm">
                  <span className="w-12 tabular-nums text-muted">{hhmm(d.scheduled_at)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {d.name} <span className="text-muted">{d.dose}</span>
                  </span>
                  {d.status === "pending" ? (
                    <button
                      onClick={() => api(`/api/meds/doses/${d.id}/take`, {})}
                      className="rounded-lg border border-line px-2 py-0.5 text-xs hover:border-ember/50"
                    >
                      Tomei
                    </button>
                  ) : null}
                  <StatusPill status={status} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {habits.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 flex justify-between text-sm text-muted">
            <span>Hábitos</span>
            <span className="tabular-nums">
              {doneCount}/{habits.length}
            </span>
          </h3>
          <ul className="flex flex-col gap-1">
            {habits.map((h) =>
              h.kind !== "check" ? (
                <li key={h.id} className="flex items-center gap-3 rounded-lg px-1 py-1 text-sm">
                  <span className={`grid size-4 place-items-center rounded-full ${h.done_today ? "bg-ok" : "border border-line"}`} />
                  <a href={`#/habitos?h=${h.id}`} className={`flex-1 ${h.done_today ? "text-muted" : ""}`}>
                    {h.icon && <span className="mr-1.5">{h.icon}</span>}
                    {h.name}
                  </a>
                  <span className="tabular-nums text-muted">
                    {fmtAmount(h.today_amount, h.unit)}
                    {h.goal && h.goal_period === "day" ? ` / ${fmtAmount(h.goal, h.unit)}` : ""}
                  </span>
                  {h.quick[0] && !h.done_today && (
                    <button
                      onClick={() => api(`/api/habits/${h.id}/log`, { amount: h.quick[0] })}
                      className="rounded-full bg-soft px-2 py-0.5 text-xs font-semibold hover:bg-line"
                      aria-label={`Registrar ${fmtAmount(h.quick[0], h.unit)} em ${h.name}`}
                    >
                      +{fmtAmount(h.quick[0], h.unit)}
                    </button>
                  )}
                </li>
              ) : (
              <li key={h.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1 text-sm hover:bg-ink/50">
                  <input
                    type="checkbox"
                    checked={h.done_today}
                    onChange={(e) => api(`/api/habits/${h.id}/toggle`, { done: e.target.checked })}
                    aria-label={`${h.done_today ? "Desmarcar" : "Marcar"} ${h.name}`}
                    className="size-4 accent-accent"
                  />
                  <span className={`flex-1 ${h.done_today ? "text-muted line-through" : ""}`}>
                    {h.icon && <span className="mr-1.5">{h.icon}</span>}
                    {h.name}
                  </span>
                  {h.streak >= 2 && <span className="text-xs text-accent tabular-nums">{h.streak} dias</span>}
                </label>
              </li>
              ),
            )}
          </ul>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm text-muted">Próximos lembretes</h3>
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-muted">{fmtDue(r.due_at, now)}</span>
                <span className="min-w-0 flex-1 truncate">{r.text}</span>
                <button
                  onClick={() => api(`/api/reminders/${r.id}/cancel`, {})}
                  aria-label={`Cancelar lembrete ${r.text}`}
                  className="text-muted hover:text-alert"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function fmtDue(ms: number, now: number) {
  const d = new Date(ms);
  const today = new Date(now);
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000,
  );
  const prefix = days === 0 ? "hoje" : days === 1 ? "amanhã" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${prefix} ${hhmm(ms)}`;
}
