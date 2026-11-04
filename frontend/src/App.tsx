import { useEffect, useState } from "react";
import { Alerts } from "./components/Alerts";
import { BriefingCard } from "./components/BriefingCard";
import { Clock } from "./components/Clock";
import { CommandBar } from "./components/CommandBar";
import { AgendaCard, InboxCard, TasksCard } from "./components/GoogleCards";
import { History } from "./components/History";
import { NowPlaying } from "./components/NowPlaying";
import { Timers } from "./components/Timers";
import { Today } from "./components/Today";
import { VideoOverlay } from "./components/VideoOverlay";
import { VoiceOrb } from "./components/VoiceOrb";
import { useMano, type Mano } from "./lib/mano";
import { BriefingPage } from "./pages/Briefing";
import { HabitsPage } from "./pages/Habits";
import { MedsPage } from "./pages/Meds";
import { NotesPage } from "./pages/Notes";
import { SettingsPage } from "./pages/Settings";

const PAGES = [
  { id: "inicio", label: "Início" },
  { id: "remedios", label: "Remédios" },
  { id: "habitos", label: "Hábitos" },
  { id: "notas", label: "Notas" },
  { id: "briefing", label: "Briefing" },
  { id: "ajustes", label: "Ajustes" },
] as const;
type Page = (typeof PAGES)[number]["id"];

function usePage(): [Page, (p: string) => void] {
  const read = (): Page => {
    const h = location.hash.replace(/^#\/?/, "").split("?")[0];
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
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Clock />
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className={`size-2 rounded-full ${mano.connected ? "bg-emerald-400" : "bg-alert blink"}`} />
            {mano.connected ? "Conectado" : "Sem conexão com o Mano"}
          </div>
          <nav className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1" aria-label="Seções">
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
        {page === "notas" && <NotesPage mano={mano} go={go} />}
        {page === "briefing" && <BriefingPage mano={mano} go={go} />}
        {page === "ajustes" && <SettingsPage mano={mano} />}
      </main>

      <Alerts mano={mano} />
      <VideoOverlay mano={mano} />
    </div>
  );
}

function Home({ mano, go, voiceOk }: { mano: Mano; go: (p: string) => void; voiceOk: boolean }) {
  const [speak, setSpeak] = useStoredBool("mano.speak", true);
  return (
    <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">
      <section className="flex min-w-0 flex-col items-center justify-center gap-6 rounded-3xl border border-line bg-panel p-6 sm:p-8">
        <VoiceOrb state={mano.voice} />
        <div className="min-h-24 w-full max-w-xl text-center">
          {mano.voice === "listening" || (mano.voice === "thinking" && mano.partial) ? (
            <p className="text-2xl italic text-muted">{mano.partial ? `${mano.partial}…` : "Pode falar…"}</p>
          ) : mano.busy && mano.llm?.busy === "comando" ? (
            <p className="text-2xl italic text-muted">Pensando com o modelo local…</p>
          ) : mano.lastReply ? (
            <>
              <p className="text-sm text-muted">“{mano.lastReply.log.text}”</p>
              {mano.lastReply.data?.understood_as && (
                <p className="mt-1 text-xs text-ember/80" title="As regras não entenderam; o modelo local reescreveu o pedido">
                  entendi como “{mano.lastReply.data.understood_as}”
                </p>
              )}
              {mano.lastReply.data?.card ? (
                <WikiCard card={mano.lastReply.data.card} />
              ) : mano.lastReply.display.includes("\n") ? (
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
              {mano.lastReply.data?.notes && (
                <ul className="mt-3 flex flex-col gap-1.5 text-left">
                  {mano.lastReply.data.notes.slice(0, 5).map((n) => (
                    <li key={n.path}>
                      <button
                        onClick={() => go(`notas?n=${encodeURIComponent(n.path)}`)}
                        className="w-full rounded-lg bg-ink/60 px-3 py-2 text-left text-sm hover:bg-ink"
                      >
                        <span className="font-medium">{n.title}</span>
                        <span className="ml-2 text-xs text-muted">{n.folder}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {mano.lastReply.data?.link && (
                <a
                  href={mano.lastReply.data.link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-ember/50 hover:text-text"
                >
                  {mano.lastReply.data.link.label} ↗
                </a>
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
        <NowPlaying mano={mano} go={go} />
        <Timers timers={mano.timers} />
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <AgendaCard mano={mano} go={go} />
        <TasksCard mano={mano} go={go} />
        <BriefingCard mano={mano} go={go} />
      </div>

      <div className="flex min-w-0 flex-col gap-6 md:col-span-2 xl:col-span-1">
        <Today mano={mano} go={go} />
        <InboxCard mano={mano} go={go} />
        <History entries={mano.history} />
      </div>
    </div>
  );
}

function WikiCard({ card }: { card: { title: string; extract: string; url?: string; image?: string | null } }) {
  return (
    <div className="mt-3 flex gap-4 rounded-2xl border border-line bg-ink/60 p-4 text-left">
      {card.image && <img src={card.image} alt="" className="h-28 w-24 shrink-0 rounded-lg object-cover" />}
      <div className="min-w-0">
        <div className="text-lg font-medium">{card.title}</div>
        <p className="mt-1 line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-text/85">{card.extract}</p>
        {card.url && (
          <a href={card.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-ember hover:underline">
            Wikipedia ↗
          </a>
        )}
      </div>
    </div>
  );
}
