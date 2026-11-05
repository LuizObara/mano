import { useState } from "react";
import { Icon } from "./ui";

const SUGGESTIONS = [
  "timer de 10 minutos pro arroz",
  "me lembra de beber água em 30 minutos",
  "quais hábitos faltam?",
  "o que você sabe fazer?",
];

export function CommandBar({
  onSend,
  busy,
  voice,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  voice: { available: boolean; muted: boolean; reason: string; listening: boolean; onListen: () => void };
}) {
  const [text, setText] = useState("");
  const canTalk = voice.available && !voice.muted;

  const submit = (t: string) => {
    if (!t.trim()) return;
    onSend(t);
    setText("");
  };

  return (
    <div className="w-full max-w-2xl">
      <form
        className="flex items-center gap-2 rounded-full border border-line bg-ink p-1.5 focus-within:border-accent"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={canTalk ? "Digite um comando ou aperte Ctrl+Espaço" : "Digite um comando"}
          aria-label="Comando para o Mano"
          className="min-w-0 flex-1 bg-transparent px-4 py-1 text-base outline-none placeholder:text-muted/80"
        />
        <button
          type="button"
          disabled={!canTalk}
          onClick={voice.onListen}
          title={
            voice.muted ? "Microfone mudo" : voice.available ? "Falar agora (Ctrl+Espaço)" : `Voz indisponível: ${voice.reason}`
          }
          className={`grid size-11 shrink-0 place-items-center rounded-full transition-colors ${
            voice.listening ? "bg-ember text-on-ember" : canTalk ? "bg-panel text-text hover:bg-soft" : "cursor-not-allowed text-muted/50"
          }`}
          aria-label="Falar agora"
          aria-pressed={voice.listening}
        >
          <Icon name={voice.muted ? "mic-off" : "mic"} className="size-[18px]" />
        </button>
        <button
          type="submit"
          disabled={!text.trim()}
          aria-busy={busy}
          className="min-h-11 shrink-0 rounded-full bg-ember px-5 font-semibold text-on-ember disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => submit(s)} className="rounded-full bg-soft px-3 py-1 text-sm text-muted hover:text-text">
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
