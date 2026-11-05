import { useState } from "react";
import { Icon } from "../components/ui";
import { KIND_ICON, renderMessage, suggestFraction } from "../lib/habits";
import { api, fmtAmount, type Habit, type HabitKind, type HabitReminderCfg } from "../lib/mano";
import { habitLink } from "./Habits";

const DAYS = [
  ["S", "segunda"],
  ["T", "terça"],
  ["Q", "quarta"],
  ["Q", "quinta"],
  ["S", "sexta"],
  ["S", "sábado"],
  ["D", "domingo"],
];
const TYPES: [HabitKind, string, string][] = [
  ["check", "Sim ou não", "um toque: feito (exercício)"],
  ["goal", "Com meta", "soma até a meta (3 L de água)"],
  ["free", "Livre", "registra quanto fez (páginas lidas)"],
];
const DEFAULT_MSG: Record<HabitKind, string> = {
  goal: "{nome}: faltam {faltam}. Que tal mais {fração}?",
  free: "{nome} hoje? Registra quanto você fez.",
  check: "Lembrete: {nome}.",
};
const VARS = [
  ["{faltam}", "quanto falta para a meta"],
  ["{fração}", "fração por lembrete"],
  ["{feito}", "quanto já fez hoje"],
  ["{meta}", "a meta"],
  ["{nome}", "o nome do hábito"],
];
const BLANK: HabitReminderCfg = {
  enabled: false,
  mode: "interval",
  every: 30,
  start: "08:00",
  end: "22:00",
  times: ["19:00"],
  message: "",
  fraction: null,
  beep: true,
  popup: true,
  toast: true,
  speak: false,
  dismiss_min: 3,
  stop_on_goal: true,
  skip_recent: true,
  snooze_min: 15,
  respect_pause: true,
};

const field = "min-h-11 rounded-[14px] border border-line bg-ink px-3.5 text-base font-normal text-text outline-none focus:border-accent";
const num = (s: string) => parseFloat(s.replace(",", "."));

export function HabitConfig({ habit }: { habit: Habit | null }) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? "");
  const [days, setDays] = useState<number[]>(habit?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [kind, setKind] = useState<HabitKind>(habit?.kind ?? "check");
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [goal, setGoal] = useState(habit?.goal ? String(habit.goal) : "");
  const [period, setPeriod] = useState<"day" | "week">(habit?.goal_period ?? "day");
  const [quick, setQuick] = useState<number[]>(habit?.quick ?? []);
  const [newQuick, setNewQuick] = useState("");
  const [rem, setRem] = useState<HabitReminderCfg>({ ...BLANK, ...(habit?.reminder ?? {}) });
  const [newTime, setNewTime] = useState("21:00");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tested, setTested] = useState(false);

  const set = <K extends keyof HabitReminderCfg>(k: K, v: HabitReminderCfg[K]) => setRem((r) => ({ ...r, [k]: v }));
  const goalNum = kind !== "check" && num(goal) > 0 ? num(goal) : null;
  const dailyGoal = kind === "goal" && period === "day" ? goalNum : null;
  const suggested = suggestFraction(dailyGoal, unit, rem.start, rem.end, rem.every);
  const fraction = rem.fraction ?? suggested;
  const message = rem.message || DEFAULT_MSG[kind];
  const sampleDone = dailyGoal ? Math.round(dailyGoal * 0.4) : kind === "check" ? 0 : 10;
  const preview = renderMessage(message, { name: name || "Hábito", unit, goal: kind === "goal" ? goalNum : null }, sampleDone, fraction);
  const slots = dailyGoal ? Math.max(1, Math.floor((mins(rem.end) - mins(rem.start)) / Math.max(5, rem.every))) : 0;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Dê um nome ao hábito.");
    if (kind === "goal" && !goalNum) return setError("Hábito com meta precisa de uma meta maior que zero.");
    if (kind !== "check" && !unit.trim()) return setError("Diga a unidade (ml, páginas, min…).");
    setSaving(true);
    setError("");
    const body = {
      name,
      icon,
      days,
      kind,
      unit: kind === "check" ? "" : unit,
      goal: goalNum,
      goal_period: period,
      quick: kind === "check" ? [] : quick,
      reminder: { ...rem, message: rem.message || DEFAULT_MSG[kind] },
    };
    try {
      if (habit) await api(`/api/habits/${habit.id}`, body, "PUT");
      else await api("/api/habits", body);
      location.hash = habit ? habitLink(`h=${habit.id}`).slice(1) : "/habitos";
    } catch (err) {
      setError(String((err as Error).message));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!habit || !confirm(`Arquivar "${habit.name}"? O histórico continua guardado.`)) return;
    await api(`/api/habits/${habit.id}`, undefined, "DELETE");
    location.hash = "/habitos";
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <a href={habit ? habitLink(`h=${habit.id}`) : habitLink()} className="text-sm font-semibold text-accent">
          ← {habit ? habit.name : "Hábitos"}
        </a>
        <h1 className="font-display text-[40px] font-medium leading-tight">{habit ? `Configurar “${habit.name}”` : "Novo hábito"}</h1>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <form onSubmit={save} className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <Section title="O hábito">
            <div className="flex flex-wrap gap-3.5">
              <label className="flex flex-[0_0_84px] flex-col gap-1.5 text-sm font-semibold">
                Ícone
                <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="💧" maxLength={4} className={`${field} text-center`} />
              </label>
              <label className="flex min-w-0 flex-[2_1_220px] flex-col gap-1.5 text-sm font-semibold">
                Nome
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Água, Leitura, Exercício…" className={field} />
              </label>
              <div className="flex flex-[1_1_240px] flex-col gap-1.5 text-sm font-semibold">
                Dias
                <div className="flex gap-1">
                  {DAYS.map(([s, full], i) => {
                    const on = days.includes(i);
                    return (
                      <button
                        key={full}
                        type="button"
                        aria-pressed={on}
                        aria-label={full}
                        onClick={() => setDays(on ? days.filter((d) => d !== i) : [...days, i].sort())}
                        className={`min-h-11 min-w-8 flex-1 rounded-xl font-bold ${on ? "bg-ember text-on-ember" : "bg-soft text-muted"}`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Tipo</span>
              <div role="radiogroup" aria-label="Tipo de hábito" className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
                {TYPES.map(([k, label, hint]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => {
                      setKind(k);
                      if (!rem.message || Object.values(DEFAULT_MSG).includes(rem.message)) set("message", DEFAULT_MSG[k]);
                    }}
                    className={`flex min-h-18 flex-col items-start gap-0.5 rounded-2xl border-2 px-3.5 py-3 text-left ${
                      kind === k ? "border-ember bg-ember-soft" : "border-line hover:bg-soft"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Icon name={KIND_ICON[k]} className="size-4 text-accent" />
                      {label}
                    </span>
                    <span className="text-[13px] text-muted">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
            {kind !== "check" && (
              <div className="flex flex-wrap items-end gap-3.5">
                <label className="flex flex-[0_1_130px] flex-col gap-1.5 text-sm font-semibold">
                  Unidade
                  <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="ml, páginas" className={field} />
                </label>
                <label className="flex flex-[0_1_140px] flex-col gap-1.5 text-sm font-semibold">
                  Meta{kind === "free" && <span className="font-normal text-muted"> (opcional)</span>}
                  <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={kind === "goal" ? "3000" : "—"} className={field} />
                </label>
                <label className="flex flex-[0_1_140px] flex-col gap-1.5 text-sm font-semibold">
                  Por
                  <select value={period} onChange={(e) => setPeriod(e.target.value as "day" | "week")} className={field}>
                    <option value="day">dia</option>
                    <option value="week">semana</option>
                  </select>
                </label>
                <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5 text-sm font-semibold">
                  Botões rápidos
                  <div className="flex flex-wrap gap-1.5">
                    {quick.map((q) => (
                      <span key={q} className="flex min-h-9 items-center gap-1 rounded-full bg-soft pl-3 pr-1.5 font-semibold">
                        {fmtAmount(q, unit)}
                        <button
                          type="button"
                          aria-label={`Remover ${fmtAmount(q, unit)}`}
                          onClick={() => setQuick(quick.filter((x) => x !== q))}
                          className="grid size-6 place-items-center rounded-full text-muted hover:text-alert"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <span className="flex items-center gap-1">
                      <input
                        inputMode="decimal"
                        value={newQuick}
                        onChange={(e) => setNewQuick(e.target.value)}
                        placeholder="+"
                        aria-label="Novo botão rápido"
                        className="min-h-9 w-20 rounded-full border border-dashed border-line bg-transparent px-3 font-normal outline-none focus:border-accent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const v = num(newQuick);
                          if (v > 0 && !quick.includes(v)) setQuick([...quick, v].sort((a, b) => a - b));
                          setNewQuick("");
                        }}
                        className="min-h-9 rounded-full px-3 text-muted hover:bg-soft"
                      >
                        adicionar
                      </button>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section
            title="Cobrança"
            action={
              <button
                type="button"
                role="switch"
                aria-checked={rem.enabled}
                aria-label="Cobrar este hábito"
                onClick={() => set("enabled", !rem.enabled)}
                className="flex min-h-11 items-center gap-2.5"
              >
                {rem.enabled ? "Ligada" : "Desligada"}
                <span className={`flex h-7.5 w-13 rounded-full p-[3px] ${rem.enabled ? "justify-end bg-ember" : "justify-start bg-line"}`}>
                  <span className="size-6 rounded-full bg-panel shadow" />
                </span>
              </button>
            }
          >
            {rem.enabled && (
              <>
                <div role="radiogroup" aria-label="Quando avisar" className="flex flex-wrap gap-1 self-start rounded-full bg-soft p-1">
                  {(
                    [
                      ["interval", "A cada X minutos"],
                      ["fixed", "Em horários fixos"],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={rem.mode === m}
                      onClick={() => set("mode", m)}
                      className={`min-h-10 rounded-full px-4 ${rem.mode === m ? "bg-panel font-semibold shadow-sm" : "text-muted"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {rem.mode === "interval" ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2.5">
                      A cada
                      <select value={rem.every} onChange={(e) => set("every", Number(e.target.value))} aria-label="Intervalo" className={field}>
                        {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                          <option key={m} value={m}>
                            {m < 60 ? `${m} min` : m === 60 ? "1 hora" : `${m / 60} horas`.replace(".", ",")}
                          </option>
                        ))}
                      </select>
                      das
                      <input type="time" value={rem.start} onChange={(e) => set("start", e.target.value)} aria-label="Começa às" className={field} />
                      às
                      <input type="time" value={rem.end} onChange={(e) => set("end", e.target.value)} aria-label="Termina às" className={field} />
                    </div>
                    {dailyGoal && suggested && (
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[18px] bg-ink px-4 py-3.5">
                        <span className="min-w-0 flex-[1_1_280px] leading-snug">
                          <strong>Fração por lembrete:</strong> {fmtAmount(dailyGoal, unit)} em {slots} lembretes dá uns{" "}
                          {fmtAmount(Math.round(dailyGoal / slots), unit)}. O Mano sugere
                        </span>
                        <label className="flex items-center gap-2">
                          <input
                            inputMode="decimal"
                            value={rem.fraction ?? suggested}
                            onChange={(e) => set("fraction", num(e.target.value) > 0 ? num(e.target.value) : null)}
                            aria-label="Fração por lembrete"
                            className={`${field} w-24 bg-panel`}
                          />
                          {unit}
                        </label>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    Nos horários
                    {rem.times.map((t) => (
                      <span key={t} className="flex min-h-10 items-center gap-1 rounded-full bg-soft pl-3.5 pr-1.5 font-semibold">
                        {t}
                        <button
                          type="button"
                          aria-label={`Remover ${t}`}
                          onClick={() => set("times", rem.times.filter((x) => x !== t))}
                          className="grid size-7 place-items-center rounded-full text-muted hover:text-alert"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} aria-label="Novo horário" className={field} />
                    <button
                      type="button"
                      onClick={() => newTime && !rem.times.includes(newTime) && set("times", [...rem.times, newTime].sort())}
                      className="min-h-10 rounded-full border border-dashed border-line px-3.5 text-muted hover:bg-soft"
                    >
                      + horário
                    </button>
                    <span className="basis-full text-[13px] text-muted">Só avisa se ainda não tiver registrado nada no dia.</span>
                  </div>
                )}

                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Mensagem
                  <textarea rows={2} value={message} onChange={(e) => set("message", e.target.value)} className={`${field} py-3 leading-snug`} />
                </label>
                <div className="-mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] text-muted">Inserir:</span>
                  {VARS.map(([token, hint]) => (
                    <button
                      key={token}
                      type="button"
                      title={hint}
                      onClick={() => set("message", `${message} ${token}`)}
                      className="min-h-8 rounded-full bg-soft px-2.5 font-mono text-[13px]"
                    >
                      {token}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">Como avisar</span>
                  <Check on={rem.beep} set={(v) => set("beep", v)} label="Bip" hint="toca pelo PC, mesmo com o visor fechado" />
                  <Check on={rem.popup} set={(v) => set("popup", v)} label="Pop-up no visor" hint="com os botões de registrar" />
                  <Check on={rem.toast} set={(v) => set("toast", v)} label="Notificação do Windows" hint="aparece por cima de outras janelas" />
                  <Check on={rem.speak} set={(v) => set("speak", v)} label="Falar a mensagem" hint="a voz do Mano lê o aviso" />
                  <label className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                    O pop-up some sozinho depois de
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={rem.dismiss_min}
                      onChange={(e) => set("dismiss_min", Math.max(1, Number(e.target.value) || 3))}
                      aria-label="Minutos até sumir"
                      className={`${field} w-18`}
                    />
                    min
                  </label>
                </div>
              </>
            )}
          </Section>

          {rem.enabled && (
            <Section title="Sem encher o saco">
              <Check
                on={rem.stop_on_goal}
                set={(v) => set("stop_on_goal", v)}
                label="Parar quando bater a meta"
                hint={dailyGoal ? `no dia em que chegar a ${fmtAmount(dailyGoal, unit)}, chega de lembrete` : "vale para hábitos com meta diária"}
              />
              <Check
                on={rem.skip_recent}
                set={(v) => set("skip_recent", v)}
                label="Pular se eu registrei há pouco"
                hint={`registrou nos últimos ${rem.every} min, o próximo aviso não toca`}
              />
              <label className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl px-2.5">
                “Agora não” adia
                <select value={rem.snooze_min} onChange={(e) => set("snooze_min", Number(e.target.value))} aria-label="Adiar por" className={field}>
                  {[5, 10, 15, 30, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </label>
              <Check
                on={rem.respect_pause}
                set={(v) => set("respect_pause", v)}
                label="Respeitar a pausa geral"
                hint="o botão “Pausar cobranças” da aba Hábitos silencia todos de uma vez"
              />
            </Section>
          )}

          {error && <p className="rounded-xl bg-alert/15 px-4 py-2.5 text-alert">{error}</p>}
          <div className="flex flex-wrap items-center gap-2.5">
            <button disabled={saving} className="min-h-12 rounded-full bg-ember px-7 font-semibold text-on-ember disabled:opacity-50">
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <a href={habit ? habitLink(`h=${habit.id}`) : habitLink()} className="flex min-h-12 items-center rounded-full border border-line px-6 hover:bg-soft">
              Cancelar
            </a>
            {habit && (
              <button type="button" onClick={archive} className="ml-auto min-h-11 px-4 font-semibold text-alert">
                Arquivar hábito
              </button>
            )}
          </div>
        </form>

        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-3 lg:sticky lg:top-4">
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-muted">Prévia do aviso</span>
          <div className="overflow-hidden rounded-3xl border border-line bg-panel shadow-xl">
            <div className="flex flex-col gap-3.5 p-4.5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8.5 place-items-center rounded-[11px] bg-ember text-on-ember">
                  {icon ? <span className="text-base leading-none">{icon}</span> : <Icon name={KIND_ICON[kind]} className="size-[18px]" />}
                </span>
                <strong className="flex-1 truncate">{name || "Hábito"}</strong>
                <span className="text-[13px] text-muted">agora</span>
              </div>
              <p className="font-display text-[22px] leading-snug">{preview}</p>
              {dailyGoal && (
                <div className="flex items-center gap-2.5 text-[13px] text-muted">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-soft">
                    <div className="h-full w-2/5 bg-ember" />
                  </div>
                  {fmtAmount(sampleDone, unit)} de {fmtAmount(dailyGoal, unit)}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {kind === "check" ? (
                  <span className="grid min-h-11 flex-1 place-items-center rounded-full bg-ember font-semibold text-on-ember">Feito</span>
                ) : (
                  [fraction, ...quick.filter((q) => q !== fraction)]
                    .filter((v): v is number => !!v)
                    .slice(0, 2)
                    .map((v, i) => (
                      <span
                        key={v}
                        className={`grid min-h-11 flex-1 place-items-center rounded-full font-semibold ${
                          i === 0 ? "bg-ember text-on-ember" : "border border-line"
                        }`}
                      >
                        +{fmtAmount(v, unit)}
                      </span>
                    ))
                )}
              </div>
              <div className="flex justify-between text-sm text-muted">
                <span>Agora não</span>
                <span>Chega por hoje</span>
              </div>
            </div>
            <div className="h-1 bg-soft">
              <div className="h-full w-3/4 bg-muted/50" />
            </div>
          </div>
          <span className="text-[13px] text-muted">
            Exemplo com {fmtAmount(sampleDone, unit)} feitos. A barrinha de baixo mostra quanto falta para o aviso sumir sozinho (
            {rem.dismiss_min} min).
          </span>
          {habit && (
            <button
              type="button"
              onClick={() => api(`/api/habits/${habit.id}/test`, {}).then(() => setTested(true))}
              className="flex min-h-11 items-center gap-2 self-start rounded-full border border-line bg-panel px-4.5 font-medium hover:bg-soft"
            >
              <Icon name="bell" className="size-4" />
              {tested ? "Enviado: veja no canto da tela" : "Testar o aviso salvo"}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function mins(s: string) {
  const [a, b] = s.split(":").map(Number);
  return a * 60 + b;
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[26px] border border-line bg-panel p-5.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[22px] font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Check({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1 hover:bg-soft">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="size-[18px] shrink-0 accent-accent" />
      <span className="flex flex-1 flex-col">
        <span>{label}</span>
        <span className="text-[13px] text-muted">{hint}</span>
      </span>
    </label>
  );
}
