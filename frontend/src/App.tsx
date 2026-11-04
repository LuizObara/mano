import { useEffect, useState } from "react";
import { Alerts } from "./components/Alerts";
import { Clock } from "./components/Clock";
import { CommandBar } from "./components/CommandBar";
import { History } from "./components/History";
import { Timers } from "./components/Timers";
import { Today } from "./components/Today";
import { VoiceOrb } from "./components/VoiceOrb";
import { useMano, type Mano } from "./lib/mano";
import { HabitsPage } from "./pages/Habits";
import { MedsPage } from "./pages/Meds";

const PAGES = [
  { id: "inicio", label: "Início" },
  { id: "remedios", label: "Remédios" },
  { id: "habitos", label: "Hábitos" },
] as const;
type Page = (typeof PAGES)[number]["id"];

function usePage(): [Page, (p: string) => void] {
  const read = (): Page => {
    const h = location.hash.replace(/^#\/?/, "");
    return (PAGES.find((p) => p.id === h)?.id ?? "inicio") as Page;
  };
  const [page, setPage] = useState<Page>(read);
  useEffect(() => {
    const on = () => setPage(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [page, (p: string) => (location.hash = `/${p}`)];
}

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
  const [page, go] = usePage();
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Clock />
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className={`size-2 rounded-full ${mano.connected ? "bg-emerald-400" : "bg-alert blink"}`} />
            {mano.connected ? "Conectado" : "Sem conexão com o Mano"}
          </div>
          <nav className="flex gap-1 rounded-xl border border-line bg-panel p-1" aria-label="Seções">
            {PAGES.map((p) => (
              <button
                key={p.id}
                onClick={() => go(p.id)}
                aria-current={page === p.id ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm ${page === p.id ? "bg-ember text-ink" : "text-muted hover:text-text"}`}
              >
                {p.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {page === "inicio" && <Home mano={mano} go={go} voiceOk={voiceOk} />}
        {page === "remedios" && <MedsPage mano={mano} />}
        {page === "habitos" && <HabitsPage mano={mano} />}
      </main>

      <Alerts mano={mano} />
    </div>
  );
}

function Home({ mano, go, voiceOk }: { mano: Mano; go: (p: string) => void; voiceOk: boolean }) {
  const [speak, setSpeak] = useStoredBool("mano.speak", true);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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
                    <li key={line} className="rounded-lg bg-ink/60 px-3 py-2">
                      {line}
                    </li>
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
            onListen: mano.listen,
          }}
        />
      </section>

      <aside className="flex min-w-0 flex-col gap-6">
        <Today mano={mano} go={go} />
        <Timers timers={mano.timers} />
        <History entries={mano.history} />
      </aside>
    </div>
  );
}
