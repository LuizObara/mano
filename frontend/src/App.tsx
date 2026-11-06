import { useEffect, useState, type ReactNode } from "react";
import { Alerts } from "./components/Alerts";
import { BriefingCard } from "./components/BriefingCard";
import { Clock } from "./components/Clock";
import { Conversation } from "./components/Conversation";
import { AgendaCard, InboxCard, TasksCard } from "./components/GoogleCards";
import { HabitNudge } from "./components/HabitNudge";
import { History } from "./components/History";
import { NowPlaying } from "./components/NowPlaying";
import { Timers } from "./components/Timers";
import { Today } from "./components/Today";
import { Icon, PanelHide } from "./components/ui";
import { VideoOverlay } from "./components/VideoOverlay";
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
const WIDE: PanelId[] = ["briefing", "historico"];

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
  // aviso de mudo ocultado fica oculto até o microfone ser ligado de novo
  const [muteNoticeHidden, setMuteNoticeHidden] = useStored<boolean>("mano.muteNoticeHidden", false);
  useEffect(() => {
    if (mano.voiceStatus && !muted && muteNoticeHidden) setMuteNoticeHidden(false);
  }, [mano.voiceStatus, muted, muteNoticeHidden, setMuteNoticeHidden]);
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

      {muted && !muteNoticeHidden && (
        <div role="status" className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl bg-notice py-2.5 pl-4.5 pr-2.5">
          <Icon name="mic-off" className="size-[18px] shrink-0 text-muted" />
          <span className="min-w-0 flex-[1_1_320px] text-[15px] leading-snug text-muted">
            O Mano não está ouvindo o “fala Mano”. A barra de comando continua funcionando e os avisos de remédio continuam tocando.
          </span>
          <button
            onClick={() => mano.setMicMuted(false)}
            className="min-h-10 rounded-full px-4 text-sm font-semibold text-accent hover:bg-soft"
          >
            Ligar microfone
          </button>
          <button
            onClick={() => setMuteNoticeHidden(true)}
            aria-label="Ocultar aviso"
            title="Ocultar aviso (o botão do microfone continua mostrando que está mudo)"
            className="grid size-10 place-items-center rounded-full text-muted hover:bg-soft hover:text-text"
          >
            <Icon name="x" className="size-4" />
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
      <HabitNudge mano={mano} />
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
    historico: <History mano={mano} speak={speak} />,
  };
  const visible = PANELS.filter((p) => !hidden.includes(p.id) && panels[p.id]);
  // Briefing e Últimos comandos ficam lado a lado no fim, com a mesma altura; o resto em colunas
  const small = visible.filter((p) => !WIDE.includes(p.id));
  const wide = visible.filter((p) => WIDE.includes(p.id));
  const slot = (p: (typeof PANELS)[number]) => (
    <PanelHide.Provider value={{ label: p.label, hide: () => setHidden([...hidden, p.id]) }}>{panels[p.id]}</PanelHide.Provider>
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-stretch gap-5">
        <Conversation mano={mano} go={go} voiceOk={voiceOk} muted={muted} speak={speak} />
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
          <div className="flex flex-col gap-3">
            {small.length > 0 && (
              // pb (e não mb) em cada painel: a margem do último de cada coluna é cortada na quebra de coluna
              <div className="gap-5 sm:columns-2 xl:columns-3">
                {small.map((p) => (
                  <div key={p.id} className="break-inside-avoid pb-5">
                    {slot(p)}
                  </div>
                ))}
              </div>
            )}
            {wide.length > 0 && (
              <div
                className={`grid grid-cols-[repeat(auto-fit,minmax(min(100%,480px),1fr))] gap-5 ${small.length ? "border-t border-line pt-8" : ""}`}
              >
                {wide.map((p) => (
                  <div key={p.id} className="h-[500px] min-w-0">
                    {slot(p)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

