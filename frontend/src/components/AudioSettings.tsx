import { useEffect, useState } from "react";
import { api, type AudioStatus, type Mano } from "../lib/mano";
import { Card, Icon, Row, btn, input } from "./ui";

/** Ajustes → Voz e áudio: microfone que o Mano escuta e alto-falante da voz, dos alarmes e do "plim". */
export function AudioSettings({ mano }: { mano: Mano }) {
  const { audio: st, setAudio, voiceStatus } = mano;
  const [busy, setBusy] = useState<"" | "input" | "output" | "refresh" | "test">("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<AudioStatus>("/api/audio").then(setAudio).catch((e) => setError((e as Error).message));
  }, [setAudio]);

  const run = async (what: typeof busy, fn: () => Promise<AudioStatus | unknown>) => {
    setBusy(what);
    setError("");
    try {
      const res = await fn();
      if (res && typeof res === "object" && "inputs" in res) {
        const a = res as AudioStatus;
        setAudio(a);
        if (a.error) setError(a.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const choose = (field: "input" | "output", value: string) =>
    run(field, () => api<AudioStatus>("/api/audio", { [field]: value }, "PUT"));

  const muted = !!voiceStatus?.muted;
  const listening = !!st?.voice_available && !muted;
  const micInUse = st ? (st.input && !st.missing_input ? st.input : st.default_input) : null;

  return (
    <Card
      title="Microfone e alto-falante"
      action={
        <button
          className={`${btn.ghost} flex shrink-0 items-center gap-1.5`}
          disabled={!st || busy === "refresh"}
          onClick={() => run("refresh", () => api<AudioStatus>("/api/audio/refresh", {}))}
          title="Conectou um fone depois de abrir o Mano? Atualize para ele aparecer."
          aria-label="Atualizar lista de aparelhos"
        >
          <Icon name="repeat" className="size-4" />
          {/* no celular fica só o ícone, para o título do card caber */}
          <span className="hidden sm:inline">{busy === "refresh" ? "Procurando…" : "Atualizar lista"}</span>
        </button>
      }
    >
      {!st ? (
        <p className="text-sm text-muted">{error || "Procurando aparelhos…"}</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <Row
            icon="mic"
            title="Microfone"
            sub={
              st.voice_available
                ? "Onde o Mano escuta a frase de ativação e os comandos. Muda na hora, sem reiniciar."
                : `A voz está desligada agora (${voiceStatus?.reason ?? "conectando…"}). A escolha fica salva para quando ela ligar.`
            }
            below
          >
            <DeviceSelect
              label="Microfone"
              value={st.input}
              devices={st.inputs}
              fallback={st.default_input}
              missing={st.missing_input}
              disabled={busy === "input"}
              onChange={(v) => choose("input", v)}
            />
            {st.missing_input && <Missing name={st.input} />}
            {micInUse && /hands-?free/i.test(micInUse) && (
              <p className="text-[13px] text-muted">
                Usar o microfone de um fone Bluetooth deixa o som dele com qualidade de telefone enquanto o Mano escuta.
                Se o PC tem microfone próprio, prefira ele.
              </p>
            )}
            {listening ? (
              <LevelMeter />
            ) : (
              muted && st.voice_available && <p className="text-[13px] text-muted">Microfone mudo: o nível aparece quando ligar de novo.</p>
            )}
          </Row>

          <Row
            icon="speaker"
            title="Alto-falante"
            sub="Onde o Mano fala e toca os alarmes, os avisos e o som de “estou ouvindo”."
            below
          >
            <div className="flex flex-wrap gap-2">
              <DeviceSelect
                label="Alto-falante"
                value={st.output}
                devices={st.outputs}
                fallback={st.default_output}
                missing={st.missing_output}
                disabled={busy === "output"}
                onChange={(v) => choose("output", v)}
              />
              <button
                className={`${btn.ghost} shrink-0`}
                disabled={busy === "test"}
                onClick={() => run("test", () => api("/api/audio/test", {}))}
              >
                {busy === "test" ? "Tocando…" : "Testar"}
              </button>
            </div>
            {st.missing_output && <Missing name={st.output} />}
          </Row>

          {error && <p className="text-alert">{error}</p>}
        </div>
      )}
    </Card>
  );
}

function DeviceSelect({
  label,
  value,
  devices,
  fallback,
  missing,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  devices: string[];
  fallback: string | null;
  missing: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      className={`${input} w-full min-w-0 flex-1 truncate`}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Padrão do Windows{fallback ? ` (${fallback})` : ""}</option>
      {devices.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
      {missing && value && !devices.includes(value) && <option value={value}>{value} (desconectado)</option>}
    </select>
  );
}

function Missing({ name }: { name: string }) {
  return (
    <p className="rounded-xl bg-notice px-3 py-2 text-[13px]">
      <b className="font-medium">{name}</b> não está conectado. O Mano usa o padrão do Windows até ele voltar; depois de
      conectar, toque em <b className="font-medium">Atualizar lista</b>.
    </p>
  );
}

/** Barra de nível do microfone: consulta o backend só enquanto está na tela. */
function LevelMeter() {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer = 0;
    const tick = async () => {
      try {
        const r = await api<{ level: number }>("/api/audio/level");
        if (alive) setLevel(r.level);
      } catch {
        /* backend reiniciando: tenta de novo no próximo */
      }
      if (alive) timer = window.setTimeout(tick, 150);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  // raiz quadrada: a fala normal fica no meio da barra em vez de colada no começo
  const pct = Math.min(100, Math.round(Math.sqrt(level) * 100));
  return (
    <div className="flex items-center gap-3" title="Fale algo: a barra deve se mexer">
      <span className="text-[13px] text-muted">Nível</span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-label="Nível do microfone"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-ember transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
