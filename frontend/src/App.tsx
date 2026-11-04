import { useEffect, useState } from "react";
import { Clock } from "./components/Clock";
import { CommandBar } from "./components/CommandBar";
import { History } from "./components/History";
import { Ringer } from "./components/Ringer";
import { Timers } from "./components/Timers";
import { VoiceOrb } from "./components/VoiceOrb";
import { useMano } from "./lib/mano";

function useStoredBool(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === "1";
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value ? "1" : "0");
    } catch {
      /* ignora */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export default function App() {
  const mano = useMano();
  const [speak, setSpeak] = useStoredBool("mano.speak", true);
  const voiceOk = !!mano.voiceStatus?.available;
  const { listen } = mano;

  // Ctrl+Espaço = falar agora (push-to-talk), funciona com o visor em foco
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Space" && voiceOk) {
        e.preventDefault();
        listen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voiceOk, listen]);

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex items-start justify-between gap-4">
        <Clock />
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className={`size-2 rounded-full ${mano.connected ? "bg-emerald-400" : "bg-alert blink"}`} />
          {mano.connected ? "Conectado" : "Sem conexão com o Mano"}
        </div>
      </header>

      <main className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col items-center justify-center gap-6 rounded-3xl border border-line bg-panel p-6 sm:p-10">
          <VoiceOrb state={mano.voice} />
          <div className="min-h-24 w-full max-w-xl text-center">
            {mano.voice === "listening" || (mano.voice === "thinking" && mano.partial) ? (
              <p className="text-2xl italic text-muted">{mano.partial ? `${mano.partial}…` : "Pode falar…"}</p>
            ) : mano.lastReply ? (
              <>
                <p className="text-sm text-muted">“{mano.lastReply.log.text}”</p>
                {mano.lastReply.display.includes("\n") ? (
                  <ul className="mt-3 flex flex-col gap-1.5 text-left text-base text-text/90">
                    {mano.lastReply.display.split("\n").map((line) => (
                      <li key={line} className="rounded-lg bg-ink/60 px-3 py-2">{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-2xl leading-snug">{mano.lastReply.display}</p>
                )}
              </>
            ) : (
              <p className="text-2xl text-muted">
                {voiceOk ? "Diga “fala Mano” ou digite abaixo." : "Oi! Digite um comando abaixo."}
              </p>
            )}
          </div>
          <CommandBar
            onSend={(t) => mano.send(t, speak)}
            busy={mano.busy}
            speak={speak}
            setSpeak={setSpeak}
            voice={{
              available: voiceOk,
              reason: mano.voiceStatus?.reason ?? "conectando",
              listening: mano.voice === "listening",
              onListen: listen,
            }}
          />
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <Timers timers={mano.timers} />
          <History entries={mano.history} />
        </aside>
      </main>

      {/* espaço para a faixa de alarme não cobrir o conteúdo */}
      {mano.timers.some((t) => t.status === "ringing") && <div className="h-24" />}
      <Ringer timers={mano.timers} />
    </div>
  );
}
