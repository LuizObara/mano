import { useState } from "react";
import { MedHistory } from "../components/MedHistory";
import { Card, StatusPill, btn, input } from "../components/ui";
import { api, hhmm, WEEKDAYS, type Dose, type Mano, type Med } from "../lib/mano";

type Form = { name: string; dose: string; times: string[]; days: number[]; stock: string; low_stock: string; notes: string };
const EMPTY: Form = { name: "", dose: "", times: ["08:00"], days: [0, 1, 2, 3, 4, 5, 6], stock: "", low_stock: "7", notes: "" };

export function MedsPage({ mano }: { mano: Mano }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <MedHistory mano={mano} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card
            title="Meus remédios"
            action={
              editing === null && (
                <button className={btn.ghost} onClick={() => setEditing("new")}>
                  + Adicionar
                </button>
              )
            }
          >
            {editing === "new" && <MedForm onDone={() => setEditing(null)} />}
            {mano.meds.length === 0 && editing !== "new" && (
              <p className="text-sm text-muted">Nenhum remédio cadastrado ainda.</p>
            )}
            <ul className="flex flex-col gap-3">
              {mano.meds.map((m) =>
                editing === m.id ? (
                  <li key={m.id}>
                    <MedForm med={m} onDone={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={m.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {m.name} <span className="font-normal text-muted">{m.dose}</span>
                        </div>
                        <div className="mt-1 text-sm text-muted">
                          {m.times.join(" · ")} — {m.days.length === 7 ? "todo dia" : m.days.map((d) => WEEKDAYS[d]).join(", ")}
                        </div>
                        {m.stock !== null && (
                          <div className={`mt-1 text-sm ${m.stock <= m.low_stock ? "text-alert" : "text-muted"}`}>
                            Estoque: {m.stock} {m.stock <= m.low_stock && "— providenciar receita"}
                          </div>
                        )}
                        {m.notes && <div className="mt-1 text-sm text-muted">{m.notes}</div>}
                      </div>
                      <button className={btn.ghost} onClick={() => setEditing(m.id)}>
                        Editar
                      </button>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </Card>
          <p className="px-1 text-sm text-muted">
            No horário, o Mano avisa por voz, na tela e com notificação do Windows, e repete até você dizer "tomei" (ou
            clicar). Passado o limite sem resposta, a dose fica como não tomada; o som, a repetição e o limite se ajustam em
            Ajustes → Alarmes e avisos. Com o notebook desligado ou suspenso não há aviso. Esqueceu de marcar? Corrija pelo
            Histórico.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Doses de hoje">
            {mano.doses.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma dose hoje.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {mano.doses.map((d) => (
                  <DoseRow key={d.id} d={d} />
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function DoseRow({ d }: { d: Dose }) {
  const later = d.status === "pending" && d.scheduled_at > Date.now();
  return (
    <li className="flex items-center gap-3 text-sm">
      <span className="w-12 tabular-nums text-muted">{hhmm(d.scheduled_at)}</span>
      <span className="min-w-0 flex-1 truncate">
        {d.name} <span className="text-muted">{d.dose}</span>
        {d.taken_at && <span className="text-muted"> · tomado {hhmm(d.taken_at)}</span>}
      </span>
      {d.status === "pending" && (
        <>
          <button className={btn.ghost} onClick={() => api(`/api/meds/doses/${d.id}/take`, {})}>
            Tomei
          </button>
          {!later && (
            <button className={btn.ghost} onClick={() => api(`/api/meds/doses/${d.id}/skip`, {})}>
              Pular
            </button>
          )}
        </>
      )}
      <StatusPill status={later ? "later" : d.status} />
    </li>
  );
}

function MedForm({ med, onDone }: { med?: Med; onDone: () => void }) {
  const [f, setF] = useState<Form>(
    med
      ? {
          name: med.name, dose: med.dose, times: med.times, days: med.days,
          stock: med.stock === null ? "" : String(med.stock), low_stock: String(med.low_stock), notes: med.notes,
        }
      : EMPTY,
  );
  const [error, setError] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const body = {
      name: f.name, dose: f.dose, notes: f.notes, days: f.days,
      times: f.times.filter(Boolean),
      stock: f.stock.trim() === "" ? null : Number(f.stock),
      low_stock: Number(f.low_stock || 7),
    };
    try {
      await api(med ? `/api/meds/${med.id}` : "/api/meds", body, med ? "PUT" : "POST");
      onDone();
    } catch (err) {
      setError(String((err as Error).message));
    }
  };

  const remove = async () => {
    if (!med || !confirm(`Remover ${med.name}? O histórico fica guardado.`)) return;
    await api(`/api/meds/${med.id}`, undefined, "DELETE");
    onDone();
  };

  return (
    <form onSubmit={save} className="mb-3 flex flex-col gap-3 rounded-xl border border-ember/40 bg-ink/40 p-3">
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
        <input className={input} placeholder="Nome (ex.: Ritalina)" value={f.name} onChange={(e) => set("name", e.target.value)} required autoFocus />
        <input className={input} placeholder="Dose (ex.: 10 mg)" value={f.dose} onChange={(e) => set("dose", e.target.value)} />
      </div>

      <div>
        <div className="mb-1 text-xs text-muted">Horários</div>
        <div className="flex flex-wrap items-center gap-2">
          {f.times.map((t, i) => (
            <span key={i} className="flex items-center gap-1">
              <input
                type="time"
                className={`${input} py-1.5`}
                value={t}
                onChange={(e) => set("times", f.times.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`Horário ${i + 1}`}
              />
              {f.times.length > 1 && (
                <button type="button" className="px-1 text-muted hover:text-alert" aria-label="Remover horário"
                  onClick={() => set("times", f.times.filter((_, j) => j !== i))}>
                  ×
                </button>
              )}
            </span>
          ))}
          <button type="button" className={btn.chip} onClick={() => set("times", [...f.times, "20:00"])}>
            + horário
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs text-muted">Dias</div>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((w, i) => {
            const on = f.days.includes(i);
            return (
              <button
                type="button"
                key={w}
                aria-pressed={on}
                onClick={() => set("days", on ? f.days.filter((d) => d !== i) : [...f.days, i])}
                className={`rounded-lg px-2.5 py-1 text-sm ${on ? "bg-ember text-on-ember" : "border border-line text-muted"}`}
              >
                {w}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Estoque (opcional)
          <input className={input} inputMode="numeric" placeholder="comprimidos" value={f.stock} onChange={(e) => set("stock", e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Avisar quando restar
          <input className={input} inputMode="numeric" value={f.low_stock} onChange={(e) => set("low_stock", e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>
      <input className={input} placeholder="Observações (ex.: depois do café)" value={f.notes} onChange={(e) => set("notes", e.target.value)} />

      {error && <p className="text-sm text-alert">{error}</p>}
      <div className="flex gap-2">
        <button className={btn.primary}>Salvar</button>
        <button type="button" className={btn.ghost} onClick={onDone}>
          Cancelar
        </button>
        {med && (
          <button type="button" className={`${btn.danger} ml-auto`} onClick={remove}>
            Remover
          </button>
        )}
      </div>
    </form>
  );
}
