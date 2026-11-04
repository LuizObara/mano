import type { VoiceState } from "../lib/mano";

const LABEL: Record<VoiceState, string> = {
  idle: "Pronto",
  listening: "Ouvindo…",
  thinking: "Pensando…",
  speaking: "Falando…",
};

export function VoiceOrb({ state }: { state: VoiceState }) {
  const active = state !== "idle";
  return (
    <div className="flex flex-col items-center gap-3" aria-live="polite">
      <div className="relative size-28 grid place-items-center">
        {active && <span className="absolute inset-0 rounded-full border-2 border-ember orb-ring" />}
        <span
          className={`absolute inset-3 rounded-full bg-ember-soft ${active ? "" : "orb-breathe"}`}
          style={{ boxShadow: active ? "0 0 48px #f2a65a55" : undefined }}
        />
        <span className={`relative size-12 rounded-full ${active ? "bg-ember" : "bg-ember/70"}`} />
      </div>
      <span className="text-sm text-muted">{LABEL[state]}</span>
    </div>
  );
}
