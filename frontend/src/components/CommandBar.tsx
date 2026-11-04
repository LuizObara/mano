import { useState } from "react";

const SUGGESTIONS = ["que horas são?", "timer de 5 minutos", "timer de 10 minutos pro arroz", "o que você sabe fazer?"];

export function CommandBar({
  onSend,
  busy,
  speak,
  setSpeak,
}: {
  onSend: (text: string) => void;
  busy: boolean;
  speak: boolean;
  setSpeak: (v: boolean) => void;
}) {
  const [text, setText] = useState("");

  const submit = (t: string) => {
    if (!t.trim()) return;
    onSend(t);
    setText("");
  };

  return (
    <div className="w-full">
      <form
        className="flex items-center gap-2 rounded-2xl border border-line bg-ink px-3 py-2 focus-within:border-ember/60"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <button
          type="button"
          disabled
          title="Voz chega na próxima fase"
          className="size-10 shrink-0 grid place-items-center rounded-xl text-muted/60 cursor-not-allowed"
          aria-label="Microfone (em breve)"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" strokeLinecap="round" />
          </svg>
        </button>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Fala, Mano…"
          className="flex-1 min-w-0 bg-transparent outline-none text-lg placeholder:text-muted/70 py-1"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          aria-busy={busy}
          className="shrink-0 rounded-xl bg-ember px-4 py-2 font-medium text-ink disabled:opacity-40"
        >
          Enviar
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => submit(s)}
            className="rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-text hover:border-ember/50"
          >
            {s}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted select-none cursor-pointer">
          <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} className="accent-ember" />
          Falar respostas
        </label>
      </div>
    </div>
  );
}
