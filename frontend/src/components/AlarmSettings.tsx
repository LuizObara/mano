import { useEffect, useRef, useState } from "react";
import { api, type AlarmCfg, type AlarmKind, type AlarmsState, type QuietCfg } from "../lib/mano";
import { Card, Icon, Modal, ModalHeader, btn } from "./ui";

const ORDER: AlarmKind[] = ["med", "timer", "reminder", "habit"];
const HINT: Record<AlarmKind, string> = {
  med: "Hora do remédio, até você dizer “tomei”.",
  timer: "Quando um timer acaba.",
  reminder: "“Me lembra de…” na hora marcada.",
  habit: "Som das cobranças de hábito. Quando cobrar fica em cada hábito.",
};
const field =
  "min-h-11 rounded-[14px] border border-line bg-ink px-3 text-base text-text outline-none focus:border-accent disabled:opacity-50";

/** "30 s", "5 min", "1 h 30" */
function dur(s: number) {
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60}` : `${h} h`;
}

function opts(values: number[], current: number) {
  return [...new Set([...values, current])].sort((a, b) => a - b);
}

const EVERY: Record<AlarmKind, number[]> = {
  timer: [15, 30, 60, 120, 300],
  med: [60, 120, 300, 600, 900, 1800],
  reminder: [60, 120, 300, 600, 900, 1800],
  habit: [],
};
const STOP: Record<AlarmKind, number[]> = {
  timer: [60, 120, 300, 600, 900, 1800],
  med: [1800, 3600, 7200, 10800, 14400, 21600],
  reminder: [300, 600, 900, 1800, 3600],
  habit: [],
};

function summary(a: AlarmsState, k: AlarmKind) {
  const c = a.kinds[k];
  const sound = c.sound === "none" ? "Sem som" : (a.sounds.find((s) => s.id === c.sound)?.label ?? c.sound);
  const parts = [c.sound === "none" ? sound : `${sound} · ${c.volume}%`];
  if (k === "habit") return parts.join(" · ");
  if (c.sound !== "none") parts.push(c.style === "loop" ? "contínuo" : "toque único");
  if (c.speak) parts.push("fala");
  parts.push(c.repeat ? `repete a cada ${dur(c.every_s)}` : "não repete");
  return parts.join(" · ");
}

/** Ajustes → Alarmes e avisos: um item por tipo de alarme (abre o editor) e o horário silencioso. */
export function AlarmSettings() {
  const [a, setA] = useState<AlarmsState | null>(null);
  const [open, setOpen] = useState<AlarmKind | null>(null);
  const [testing, setTesting] = useState<AlarmKind | null>(null);
  const [error, setError] = useState("");
  const stopTimer = useRef<number>(0);

  useEffect(() => {
    api<AlarmsState>("/api/alarms").then(setA).catch((e) => setError((e as Error).message));
  }, []);

  const test = async (k: AlarmKind) => {
    setError("");
    window.clearTimeout(stopTimer.current);
    try {
      const r = await api<{ loop?: boolean; stop_in?: number; duration?: number }>(`/api/alarms/${k}/test`, {});
      setTesting(k);
      const ms = r.loop ? (r.stop_in ?? 8) * 1000 : Math.max(2500, (r.duration ?? 2) * 1000 + 2500);
      stopTimer.current = window.setTimeout(() => setTesting(null), ms);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const stop = async () => {
    window.clearTimeout(stopTimer.current);
    setTesting(null);
    await api("/api/alarms/stop", {}).catch(() => {});
  };

  if (!a) {
    return (
      <Card title="Alarmes e avisos">
        <p className="text-sm text-muted">{error || "Carregando…"}</p>
      </Card>
    );
  }

  return (
    <Card title="Alarmes e avisos">
      <div className="flex flex-col gap-4">
        {!a.sound_enabled && (
          <p className="rounded-xl bg-notice px-3.5 py-2.5 text-sm">
            O som dos alarmes está desligado neste PC (<code>MANO_SOUND_ENABLED=false</code> no <code>.env</code>). Voz e
            notificação continuam valendo.
          </p>
        )}
        <ul className="flex flex-col">
          {ORDER.map((k) => (
            <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-3 last:border-b-0">
              <button type="button" onClick={() => setOpen(k)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                <span className="font-medium">{a.labels[k]}</span>
                <span className="text-[13px] text-muted">{summary(a, k)}</span>
              </button>
              <div className="flex items-center gap-1.5">
                <TestButton active={testing === k} onTest={() => test(k)} onStop={stop} />
                <button type="button" className={btn.ghost} onClick={() => setOpen(k)}>
                  Ajustar
                </button>
              </div>
            </li>
          ))}
        </ul>
        <Quiet a={a} setA={setA} />
        {error && <p className="text-sm text-alert">{error}</p>}
      </div>
      {open && (
        <AlarmEditor
          kind={open}
          a={a}
          setA={setA}
          testing={testing === open}
          onTest={() => test(open)}
          onStop={stop}
          onClose={() => setOpen(null)}
        />
      )}
    </Card>
  );
}

function TestButton({ active, onTest, onStop, big = false }: { active: boolean; onTest: () => void; onStop: () => void; big?: boolean }) {
  return active ? (
    <button type="button" onClick={onStop} className={big ? `${btn.primary} flex items-center gap-2` : `${btn.ghost} flex items-center gap-1.5`}>
      <Icon name="stop" className="size-4" /> Parar
    </button>
  ) : (
    <button type="button" onClick={onTest} className={big ? `${btn.primary} flex items-center gap-2` : `${btn.ghost} flex items-center gap-1.5`}>
      <Icon name="play" className="size-4" /> Testar
    </button>
  );
}

function Switch({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} className="flex min-h-11 items-center">
      <span className={`flex h-7.5 w-13 rounded-full p-[3px] ${on ? "justify-end bg-ember" : "justify-start bg-line"}`}>
        <span className="size-6 rounded-full bg-panel shadow" />
      </span>
    </button>
  );
}

function Quiet({ a, setA }: { a: AlarmsState; setA: (s: AlarmsState) => void }) {
  const q = a.quiet;
  const save = (patch: Partial<QuietCfg>) => {
    const next = { ...q, ...patch };
    setA({ ...a, quiet: next });
    api<AlarmsState>("/api/alarms/quiet", next, "PUT").then(setA).catch(() => {});
  };
  return (
    <section className="flex flex-col gap-3 rounded-[20px] bg-soft p-4">
      <div className="flex items-center gap-3">
        <Icon name="moon" className="size-5 shrink-0 text-muted" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">Horário silencioso</span>
          <span className="text-[13px] text-muted">
            {q.enabled
              ? `Sem som e sem voz das ${q.start} às ${q.end}${a.quiet_now ? " (agora está silencioso)" : ""}. Tela e notificação continuam.`
              : "Desligado. Os alarmes tocam a qualquer hora."}
          </span>
        </div>
        <Switch on={q.enabled} set={(v) => save({ enabled: v })} label="Horário silencioso" />
      </div>
      {q.enabled && (
        <div className="flex flex-wrap items-center gap-2.5 pl-8 text-sm">
          Das
          <input type="time" value={q.start} onChange={(e) => e.target.value && save({ start: e.target.value })} aria-label="Silencioso a partir de" className={field} />
          às
          <input type="time" value={q.end} onChange={(e) => e.target.value && save({ end: e.target.value })} aria-label="Silencioso até" className={field} />
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5">
            <input type="checkbox" checked={q.meds_ring} onChange={(e) => save({ meds_ring: e.target.checked })} className="size-[18px] accent-accent" />
            Remédio toca mesmo assim
          </label>
        </div>
      )}
    </section>
  );
}

function AlarmEditor({
  kind,
  a,
  setA,
  testing,
  onTest,
  onStop,
  onClose,
}: {
  kind: AlarmKind;
  a: AlarmsState;
  setA: (s: AlarmsState) => void;
  testing: boolean;
  onTest: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const c = a.kinds[kind];
  const [saved, setSaved] = useState<"" | "saving" | "ok" | "erro">("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const isHabit = kind === "habit";
  const changed = JSON.stringify(c) !== JSON.stringify(a.defaults[kind]);

  const set = async (patch: Partial<AlarmCfg>) => {
    setError("");
    setA({ ...a, kinds: { ...a.kinds, [kind]: { ...c, ...patch } } });
    setSaved("saving");
    try {
      setA(await api<AlarmsState>(`/api/alarms/${kind}`, patch, "PUT"));
      setSaved("ok");
    } catch (e) {
      setSaved("erro");
      setError((e as Error).message);
    }
  };
  const preview = (sound: string, volume = c.volume) => api("/api/alarms/preview", { sound, volume }).catch(() => {});

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const data = await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => fail(new Error("Não consegui ler o arquivo."));
        r.readAsDataURL(file);
      });
      const res = await api<AlarmsState & { sound: string }>("/api/alarms/sounds", { name: file.name, data });
      setA(res);
      await set({ sound: res.sound });
      void preview(res.sound);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const removeSound = async (id: string) => {
    setA(await api<AlarmsState>(`/api/alarms/sounds/${encodeURIComponent(id.replace(/^custom:/, ""))}`, undefined, "DELETE"));
  };

  const sounds = [...a.sounds, { id: "none", label: "Sem som", custom: false }];
  const noSound = c.sound === "none" || c.volume === 0;

  return (
    <Modal label={`Alarme: ${a.labels[kind]}`} onClose={onClose} className="max-w-[680px]">
      <ModalHeader
        title={a.labels[kind]}
        sub={
          <span>
            {HINT[kind]}{" "}
            <span className="text-muted/80" aria-live="polite">
              {saved === "saving" ? "Salvando…" : saved === "ok" ? "Salvo ✓" : saved === "erro" ? "Não salvou" : ""}
            </span>
          </span>
        }
        onClose={onClose}
      />

      <div className="flex flex-col gap-6 border-t border-line px-5 py-5 sm:px-7">
        {/* som */}
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 font-display text-lg">Som</legend>
          <div role="radiogroup" aria-label="Som" className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
            {sounds.map((s) => {
              const on = c.sound === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex min-h-12 items-center gap-1 rounded-[14px] border pl-3.5 pr-1 ${on ? "border-accent bg-ember-soft" : "border-line hover:bg-soft"}`}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      void set({ sound: s.id });
                      if (s.id !== "none") void preview(s.id);
                    }}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className={`size-3.5 shrink-0 rounded-full border-2 ${on ? "border-accent bg-accent" : "border-line"}`} />
                    <span className="truncate">{s.label}</span>
                  </button>
                  {s.id !== "none" && (
                    <button
                      type="button"
                      onClick={() => preview(s.id)}
                      aria-label={`Ouvir ${s.label}`}
                      title="Ouvir"
                      className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-soft hover:text-text"
                    >
                      <Icon name="play" className="size-4" />
                    </button>
                  )}
                  {s.custom && (
                    <button
                      type="button"
                      onClick={() => removeSound(s.id)}
                      aria-label={`Apagar o som ${s.label}`}
                      title="Apagar este som"
                      className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-soft hover:text-alert"
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <label className={`${btn.ghost} flex w-fit cursor-pointer items-center gap-2`}>
            <Icon name="upload" className="size-4" />
            {uploading ? "Enviando…" : "Usar um som meu (.wav)"}
            <input type="file" accept=".wav,audio/wav,audio/x-wav" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </fieldset>

        {/* volume */}
        <div className="flex flex-col gap-2">
          <label htmlFor={`vol-${kind}`} className="flex items-baseline justify-between font-display text-lg">
            Volume <span className="font-sans text-sm text-muted">{c.volume}%</span>
          </label>
          <div className="flex items-center gap-3">
            <Icon name="volume-off" className="size-5 shrink-0 text-muted" />
            <input
              id={`vol-${kind}`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={c.volume}
              disabled={c.sound === "none"}
              onChange={(e) => setA({ ...a, kinds: { ...a.kinds, [kind]: { ...c, volume: Number(e.target.value) } } })}
              onPointerUp={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                void set({ volume: v }).then(() => v > 0 && preview(c.sound, v));
              }}
              onKeyUp={(e) => {
                const v = Number((e.target as HTMLInputElement).value);
                void set({ volume: v }).then(() => v > 0 && preview(c.sound, v));
              }}
              className="h-11 flex-1 accent-accent"
            />
            <Icon name="volume" className="size-5 shrink-0 text-muted" />
          </div>
          <p className="text-[13px] text-muted">Ao soltar, toca uma amostra. É relativo ao volume do Windows.</p>
        </div>

        {!isHabit && (
          <>
            {/* tipo */}
            <fieldset className="flex flex-col gap-2.5" disabled={noSound}>
              <legend className="mb-2.5 font-display text-lg">Tipo de alarme</legend>
              <div role="radiogroup" aria-label="Tipo de alarme" className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ["once", "Toque único", "Toca uma vez a cada aviso."],
                    ["loop", "Contínuo", "Toca sem parar até você responder (ou dizer “para”)."],
                  ] as const
                ).map(([v, label, hint]) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={c.style === v}
                    onClick={() => set({ style: v })}
                    className={`flex flex-col gap-0.5 rounded-[14px] border p-3.5 text-left disabled:opacity-50 ${
                      c.style === v ? "border-accent bg-ember-soft" : "border-line hover:bg-soft"
                    }`}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-[13px] text-muted">{hint}</span>
                  </button>
                ))}
              </div>
              {noSound && <p className="text-[13px] text-muted">Escolha um som para usar o tipo de alarme.</p>}
            </fieldset>

            {/* como avisar */}
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-2 font-display text-lg">Como avisar</legend>
              <Check
                on={c.speak}
                set={(v) => set({ speak: v })}
                label="Falar o aviso"
                hint={a.voice_enabled ? "O Mano fala o texto depois do toque." : "A voz do Mano está desligada no .env."}
              />
              <Check
                on={c.toast}
                set={(v) => set({ toast: v })}
                label="Notificação do Windows"
                hint={a.toast_enabled ? "Aparece mesmo com o visor fechado." : "Notificações desligadas no .env (MANO_TOAST_ENABLED)."}
              />
              <p className="px-2.5 pt-1 text-[13px] text-muted">O aviso na tela do Mano aparece sempre.</p>
            </fieldset>

            {/* repetição */}
            <fieldset className="flex flex-col gap-3" aria-label="Repetição">
              <div className="flex items-center justify-between gap-3">
                <span className="font-display text-lg">Repetir até eu responder</span>
                <Switch on={c.repeat} set={(v) => set({ repeat: v })} label="Repetir até eu responder" />
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-sm">
                {c.repeat && (
                  <>
                    A cada
                    <select value={c.every_s} onChange={(e) => set({ every_s: Number(e.target.value) })} aria-label="Intervalo da repetição" className={field}>
                      {opts(EVERY[kind], c.every_s).map((v) => (
                        <option key={v} value={v}>
                          {dur(v)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {(c.repeat || c.style === "loop" || kind === "med") && (
                  <>
                    {kind === "med"
                      ? `${c.repeat ? "· m" : "M"}arcar como não tomado depois de`
                      : c.repeat
                        ? "· desistir depois de"
                        : "Parar de tocar depois de"}
                    <select value={c.stop_after_s} onChange={(e) => set({ stop_after_s: Number(e.target.value) })} aria-label="Limite" className={field}>
                      {opts(STOP[kind], c.stop_after_s).map((v) => (
                        <option key={v} value={v}>
                          {dur(v)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              {!c.repeat && <p className="text-[13px] text-muted">Avisa uma vez só{c.style === "loop" && !noSound ? " (o som contínuo segue até o limite)" : ""}.</p>}
            </fieldset>

            {kind === "med" && (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-display text-lg">“Adiar” empurra</span>
                <select value={c.snooze_min} onChange={(e) => set({ snooze_min: Number(e.target.value) })} aria-label="Tempo do adiar" className={field}>
                  {opts([5, 10, 15, 20, 30, 60], c.snooze_min).map((v) => (
                    <option key={v} value={v}>
                      {v} min
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {error && <p className="text-sm text-alert">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 pb-5 pt-4 sm:px-7">
        <button
          type="button"
          disabled={!changed}
          onClick={async () => setA(await api<AlarmsState>(`/api/alarms/${kind}/reset`, {}))}
          className="min-h-11 rounded-full px-3 text-sm text-muted hover:bg-soft hover:text-text disabled:opacity-40"
        >
          Restaurar padrão
        </button>
        <TestButton big active={testing} onTest={onTest} onStop={onStop} />
      </div>
    </Modal>
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
