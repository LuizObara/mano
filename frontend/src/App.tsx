import { useEffect, useState, type ReactNode } from "react";
import { Alerts } from "./components/Alerts";
import { BriefingCard } from "./components/BriefingCard";
import { Clock } from "./components/Clock";
import { CommandBar } from "./components/CommandBar";
import { AgendaCard, InboxCard, TasksCard } from "./components/GoogleCards";
import { History } from "./components/History";
import { NowPlaying } from "./components/NowPlaying";
import { Timers } from "./components/Timers";
import { Today } from "./components/Today";
import { Icon, PanelHide } from "./components/ui";
import { VideoOverlay } from "./components/VideoOverlay";
import { VoiceOrb } from "./components/VoiceOrb";
import { useMano, type Mano } from "./lib/mano";
import { useStored, useTheme } from "./lib/prefs";
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

/** Painéis do Início, na ordem em que aparecem. Cada um pode ser ocultado (fica salvo neste aparelho). */
const PANELS = [
  { id: "agenda", label: "Agenda" },
  { id: "hoje", label: "Remédios e hábitos" },
  { id: "tocando", label: "Música" },
  { id: "timers", label: "Timers" },
  { id: "tarefas", label: "Tarefas" },
  { id: "email", label: "E-mail" },
  { id: "briefing", label: "Briefing" },
  { id: "historico", label: "Últimos comandos" },
] as const;
type PanelId = (typeof PANELS)[number]["id"];

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

export default function App() {
  const mano = useMano();
  const [page, go] = usePage();
  const [theme, toggleTheme] = useTheme();
  const [speak, setSpeak] = useStored<boolean>("mano.speak", true);
  const [hidden, setHidden] = useStored<PanelId[]>("mano.hiddenPanels", []);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const voiceOk = !!mano.voiceStatus?.available;
  const muted = !!mano.voiceStatus?.muted;
  const { listen } = mano;

  // Ctrl+Espaço = falar agora (push-to-talk), funciona com o visor em foco
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Space" && voiceOk && !muted) {
        e.preventDefault();
        listen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voiceOk, muted, listen]);

  const toggleHidden = (id: PanelId) => setHidden(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]);

  return (
    <div className="mx-auto flex min-h-full max-w-[1360px] flex-col gap-6 px-4 py-5 sm:px-8 sm:py-6">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <a href="#/inicio" className="font-display text-[40px] italic leading-none tracking-[-0.03em] text-text">
            mano<span className="text-ember">.</span>
          </a>
          <nav className="flex flex-wrap gap-1 rounded-full bg-soft p-1" aria-label="Seções">
            {PAGES.map((p) => (
              <button
                key={p.id}
                onClick={() => go(p.id)}
                aria-current={page === p.id ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-[15px] ${
                  page === p.id ? "bg-panel font-semibold text-text shadow-sm" : "font-medium text-muted hover:text-text"
                }`}
              >
                {p.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 px-2 text-sm text-muted">
            <span className={`size-2 rounded-full ${mano.connected ? "bg-ok" : "blink bg-alert"}`} />
            {mano.connected ? "Conectado" : "Sem conexão"}
          </span>

          <button
            type="button"
            onClick={() => mano.setMicMuted(!muted)}
            aria-pressed={muted}
            aria-label={muted ? "Microfone mudo" : "Microfone"}
            title={muted ? "Ligar o microfone" : voiceOk ? "Silenciar o microfone" : `Voz indisponível: ${mano.voiceStatus?.reason ?? "conectando"}`}
            className={`flex min-h-11 items-center gap-2 rounded-full border pl-3 pr-4 text-[15px] font-medium ${
              muted ? "border-text bg-text text-ink" : "border-line bg-panel hover:bg-soft"
            }`}
          >
            <Icon name={muted ? "mic-off" : "mic"} className="size-[18px]" />
            {muted ? "Microfone mudo" : "Microfone"}
          </button>

          <button
            type="button"
            onClick={() => setSpeak(!speak)}
            aria-pressed={!speak}
            aria-label={speak ? "Respostas faladas ligadas" : "Respostas faladas desligadas"}
            title={speak ? "O Mano fala as respostas do que você digita" : "O Mano só mostra as respostas na tela"}
            className={`grid size-11 place-items-center rounded-full border ${
              speak ? "border-line bg-panel hover:bg-soft" : "border-text bg-text text-ink"
            }`}
          >
            <Icon name={speak ? "volume" : "volume-off"} className="size-[18px]" />
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Tema escuro"
            title={theme === "dark" ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
            onClick={toggleTheme}
            className="flex min-h-11 items-center px-1"
          >
            <span
              className={`flex h-8 w-15 rounded-full border border-line bg-soft p-[3px] ${theme === "dark" ? "justify-end" : "justify-start"}`}
            >
              <span className="grid size-6 place-items-center rounded-full bg-panel text-accent shadow">
                <Icon name={theme === "dark" ? "moon" : "sun"} className="size-3.5" />
              </span>
            </span>
          </button>

          {page === "inicio" && (
            <button
              type="button"
              onClick={() => setPanelsOpen(!panelsOpen)}
              aria-expanded={panelsOpen}
              className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel pl-3 pr-4 text-[15px] font-medium hover:bg-soft"
            >
              <Icon name="panels" className="size-[18px]" />
              Painéis
              {hidden.length > 0 && (
                <span className="grid h-5.5 min-w-5.5 place-items-center rounded-full bg-ember px-1.5 text-xs font-bold text-on-ember">
                  {hidden.length}
                </span>
              )}
            </button>
          )}

          {page === "inicio" && panelsOpen && (
            <PanelsMenu hidden={hidden} toggle={toggleHidden} showAll={() => setHidden([])} close={() => setPanelsOpen(false)} />
          )}
        </div>
      </header>

      {muted && (
        <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-text px-5 py-3.5 text-ink">
          <Icon name="mic-off" />
          <span className="min-w-0 flex-[1_1_320px] text-[15px] leading-snug">
            O Mano não está ouvindo o “fala Mano”. A barra de comando continua funcionando e os avisos de remédio continuam tocando.
          </span>
          <button onClick={() => mano.setMicMuted(false)} className="min-h-10 rounded-full bg-glow px-4 text-sm font-semibold text-on-ember">
            Ligar microfone
          </button>
        </div>
      )}

      <main className="flex-1">
        {page === "inicio" && (
          <Home mano={mano} go={go} voiceOk={voiceOk} muted={muted} speak={speak} hidden={hidden} setHidden={setHidden} />
        )}
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

function PanelsMenu({
  hidden,
  toggle,
  showAll,
  close,
}: {
  hidden: PanelId[];
  toggle: (id: PanelId) => void;
  showAll: () => void;
  close: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <>
      <button type="button" aria-label="Fechar" tabIndex={-1} onClick={close} className="fixed inset-0 z-10 cursor-default" />
      <div
        role="dialog"
        aria-label="Escolher painéis"
        className="absolute right-0 top-[calc(100%+10px)] z-20 flex w-[min(320px,calc(100vw-32px))] flex-col gap-1 rounded-3xl border border-line bg-panel p-4 shadow-xl"
      >
        <div className="flex items-baseline justify-between px-1 pb-2">
          <strong className="font-display text-xl font-medium">Painéis do Início</strong>
          <button type="button" onClick={showAll} className="px-1 py-1.5 text-sm font-semibold text-accent">
            Mostrar todos
          </button>
        </div>
        {PANELS.map((p) => (
          <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2.5 text-[15px] hover:bg-soft">
            <input type="checkbox" checked={!hidden.includes(p.id)} onChange={() => toggle(p.id)} className="size-[18px] accent-accent" />
            <span className="flex-1">{p.label}</span>
          </label>
        ))}
        <p className="mx-1 mt-2 text-[13px] leading-snug text-muted">
          Fica salvo neste aparelho. Painéis ocultos continuam funcionando por voz.
        </p>
        <button type="button" onClick={close} className="mt-2 min-h-11 rounded-full bg-ember font-semibold text-on-ember">
          Pronto
        </button>
      </div>
    </>
  );
}

function Home({
  mano,
  go,
  voiceOk,
  muted,
  speak,
  hidden,
  setHidden,
}: {
  mano: Mano;
  go: (p: string) => void;
  voiceOk: boolean;
  muted: boolean;
  speak: boolean;
  hidden: PanelId[];
  setHidden: (h: PanelId[]) => void;
}) {
  const panels: Record<PanelId, ReactNode> = {
    agenda: <AgendaCard mano={mano} go={go} />,
    hoje: <Today mano={mano} go={go} />,
    tocando: mano.spotify ? <NowPlaying mano={mano} go={go} /> : null,
    timers: <Timers timers={mano.timers} />,
    tarefas: <TasksCard mano={mano} go={go} />,
    email: <InboxCard mano={mano} go={go} />,
    briefing: <BriefingCard mano={mano} go={go} />,
    historico: <History entries={mano.history} />,
  };
  const visible = PANELS.filter((p) => !hidden.includes(p.id) && panels[p.id]);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-stretch gap-5">
        <section className="flex min-w-0 flex-[999_1_560px] flex-col items-center gap-5 rounded-[30px] border border-line bg-panel p-5 sm:p-9">
          <VoiceOrb state={mano.voice} muted={muted} />
          <Reply mano={mano} go={go} voiceOk={voiceOk && !muted} />
          <CommandBar
            onSend={(t) => mano.send(t, Boolean(speak))}
            busy={mano.busy}
            voice={{
              available: voiceOk,
              muted,
              reason: mano.voiceStatus?.reason ?? "conectando",
              listening: mano.voice === "listening",
              onListen: mano.listen,
            }}
          />
        </section>
        <Clock mano={mano} />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="font-display text-[28px] font-medium">Painéis</h2>
          {hidden.length > 0 && (
            <span className="flex items-center gap-3 text-sm text-muted">
              {hidden.length === 1 ? "1 painel oculto" : `${hidden.length} painéis ocultos`}
              <button type="button" onClick={() => setHidden([])} className="py-2 font-semibold text-accent">
                Mostrar todos
              </button>
            </span>
          )}
        </div>
        {visible.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-line p-8 text-center text-muted">
            Todos os painéis estão ocultos. Use o botão “Painéis” lá em cima para escolher o que mostrar.
          </p>
        ) : (
          <div className="gap-5 sm:columns-2 xl:columns-3">
            {visible.map((p) => (
              <div key={p.id} className="mb-5 break-inside-avoid">
                <PanelHide.Provider value={{ label: p.label, hide: () => setHidden([...hidden, p.id]) }}>
                  {panels[p.id]}
                </PanelHide.Provider>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Reply({ mano, go, voiceOk }: { mano: Mano; go: (p: string) => void; voiceOk: boolean }) {
  return (
    <div className="flex min-h-28 w-full max-w-2xl flex-col items-center gap-2 text-center">
      {mano.voice === "listening" || (mano.voice === "thinking" && mano.partial) ? (
        <p className="font-display text-3xl italic text-muted">{mano.partial ? `${mano.partial}…` : "Pode falar…"}</p>
      ) : mano.busy && mano.llm?.busy === "comando" ? (
        <p className="font-display text-3xl italic text-muted">Pensando com o modelo local…</p>
      ) : mano.lastReply ? (
        <>
          <p className="text-[15px] text-muted">“{mano.lastReply.log.text}”</p>
          {mano.lastReply.data?.understood_as && (
            <p className="text-xs text-accent" title="As regras não entenderam; o modelo local reescreveu o pedido">
              entendi como “{mano.lastReply.data.understood_as}”
            </p>
          )}
          {mano.lastReply.data?.card ? (
            <WikiCard card={mano.lastReply.data.card} />
          ) : mano.lastReply.display.includes("\n") ? (
            <ul className="mt-1 flex w-full flex-col gap-1.5 text-left text-base">
              {mano.lastReply.display.split("\n").map((line) => (
                <li key={line} className="rounded-xl bg-ink px-3 py-2">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-display text-[clamp(24px,3vw,34px)] leading-tight">{mano.lastReply.display}</p>
          )}
          {mano.lastReply.data?.notes && (
            <ul className="mt-1 flex w-full flex-col gap-1.5 text-left">
              {mano.lastReply.data.notes.slice(0, 5).map((n) => (
                <li key={n.path}>
                  <button
                    onClick={() => go(`notas?n=${encodeURIComponent(n.path)}`)}
                    className="w-full rounded-xl bg-ink px-3 py-2 text-left text-sm hover:bg-soft"
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
              className="mt-1 inline-block rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:bg-soft hover:text-text"
            >
              {mano.lastReply.data.link.label} ↗
            </a>
          )}
        </>
      ) : (
        <p className="font-display text-3xl text-muted">
          {voiceOk ? "Diga “fala Mano” ou digite abaixo." : "Oi! Digite um comando abaixo."}
        </p>
      )}
    </div>
  );
}

function WikiCard({ card }: { card: { title: string; extract: string; url?: string; image?: string | null } }) {
  return (
    <div className="mt-1 flex gap-4 rounded-2xl border border-line bg-ink p-4 text-left">
      {card.image && <img src={card.image} alt="" className="h-28 w-24 shrink-0 rounded-lg object-cover" />}
      <div className="min-w-0">
        <div className="font-display text-xl font-medium">{card.title}</div>
        <p className="mt-1 line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-text/85">{card.extract}</p>
        {card.url && (
          <a href={card.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent hover:underline">
            Wikipedia ↗
          </a>
        )}
      </div>
    </div>
  );
}
