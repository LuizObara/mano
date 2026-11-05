import type { VoiceState } from "../lib/mano";
import { Icon } from "./ui";

const LABEL: Record<VoiceState | "muted", string> = {
  idle: "Pronto",
  listening: "Ouvindo…",
  thinking: "Pensando…",
  speaking: "Falando…",
  muted: "Microfone mudo",
};

export function VoiceOrb({ state, muted }: { state: VoiceState; muted: boolean }) {
  const s = muted && state !== "speaking" ? "muted" : state;
  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite">
      <div className="relative grid size-32 place-items-center" aria-hidden="true">
        {s === "idle" && <span className="orb-breathe absolute inset-3.5 rounded-full bg-ember-soft" />}
        {s === "listening" && (
          <>
            <span className="orb-ring absolute inset-0 rounded-full border-2 border-ember" />
            <span className="absolute inset-3.5 rounded-full bg-ember/30" style={{ boxShadow: "0 0 56px var(--color-ember)" }} />
          </>
        )}
        {s === "thinking" && <span className="orb-spin absolute inset-3.5 rounded-full border-[3px] border-dotted border-think" />}
        {s === "speaking" && (
          <>
            <span className="orb-wave absolute inset-1.5 rounded-full border-2 border-ember/40" />
            <span className="orb-wave absolute inset-5 rounded-full border-2 border-ember" />
          </>
        )}
        {s === "muted" && <span className="absolute inset-3.5 rounded-full border-2 border-dashed border-line" />}
        <span
          className={`relative grid size-13 place-items-center rounded-full ${
            s === "muted" ? "bg-soft text-muted" : s === "thinking" ? "bg-think" : "bg-ember"
          }`}
        >
          {s === "muted" && <Icon name="mic-off" className="size-6" />}
        </span>
      </div>
      <span className="text-sm font-semibold uppercase tracking-[0.08em] text-muted">{LABEL[s]}</span>
    </div>
  );
}
