import { useCallback, useEffect, useState } from "react";
import { Card, btn, input } from "../components/ui";
import { ago, api, type BriefItem, type FeedInfo, type Mano } from "../lib/mano";

type View = "new" | "all" | "starred";
const VIEWS: { id: View; label: string }[] = [
  { id: "new", label: "Novidades" },
  { id: "all", label: "Últimos 3 dias" },
  { id: "starred", label: "Salvas" },
];

export function BriefingPage({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const b = mano.briefing;
  const llmReady = !!(mano.llm?.enabled && mano.llm.reachable && mano.llm.model);
  const [view, setView] = useState<View>("new");
  const [feedId, setFeedId] = useState<number | null>(null);
  const [items, setItems] = useState<BriefItem[]>([]);
  const [feeds, setFeeds] = useState<FeedInfo[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    const q = new URLSearchParams({ view, days: "3" });
    if (feedId) q.set("feed", String(feedId));
    api<{ items: BriefItem[]; feeds: FeedInfo[] }>(`/api/briefing?${q}`)
      .then((r) => {
        setItems(r.items);
        setFeeds(r.feeds);
      })
      .catch(() => {});
  }, [view, feedId]);

  // recarrega quando o backend avisa que algo mudou (busca, resumo, lido)
  useEffect(load, [load, b?.unread, b?.feeds, b?.pending_summaries, b?.running?.done]);

  const act = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const patch = (it: BriefItem, body: Partial<Pick<BriefItem, "read" | "starred">>) =>
    act(async () => {
      setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, ...body } : x)));
      await api(`/api/briefing/items/${it.id}`, body);
    });

  const running = b?.running;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-3">
          <div className="flex gap-1 rounded-xl bg-ink/60 p-1" role="tablist">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                onClick={() => setView(v.id)}
                className={`rounded-lg px-3 py-1.5 text-sm ${view === v.id ? "bg-ember text-on-ember" : "text-muted hover:text-text"}`}
              >
                {v.label}
                {v.id === "new" && b?.unread ? <span className="ml-1.5 tabular-nums opacity-80">{b.unread}</span> : null}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className={btn.ghost} disabled={!!running || !b?.feeds} onClick={() => act(() => api("/api/briefing/refresh", {}))}>
              Buscar agora
            </button>
            {llmReady && !!b?.pending_summaries && (
              <button className={btn.ghost} disabled={!!running} onClick={() => act(() => api("/api/briefing/summarize", {}))}>
                Resumir {b.pending_summaries} agora
              </button>
            )}
            {view === "new" && items.length > 0 && (
              <button
                className={btn.ghost}
                onClick={() => act(() => api("/api/briefing/read-all", { ids: items.map((i) => i.id) }))}
              >
                Marcar como lidas
              </button>
            )}
          </div>
          {running && (
            <div className="w-full">
              <div className="flex justify-between text-xs text-muted">
                <span>{running.stage === "resumindo" ? "Resumindo com o modelo local…" : "Buscando os feeds…"}</span>
                <span className="tabular-nums">
                  {running.done}/{running.total}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-ember transition-all" style={{ width: `${(100 * running.done) / Math.max(1, running.total)}%` }} />
              </div>
            </div>
          )}
          {error && <p className="w-full text-sm text-alert">{error}</p>}
        </div>

        {feeds.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button className={`${btn.chip} ${feedId === null ? "border-ember/60 text-text" : ""}`} onClick={() => setFeedId(null)}>
              Todos
            </button>
            {feeds.map((f) => (
              <button
                key={f.id}
                className={`${btn.chip} ${feedId === f.id ? "border-ember/60 text-text" : ""}`}
                onClick={() => setFeedId(feedId === f.id ? null : f.id)}
              >
                {f.title}
                {f.unread > 0 && <span className="ml-1 tabular-nums text-accent">{f.unread}</span>}
              </button>
            ))}
          </div>
        )}

        {!b?.feeds ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            Escolha seus blogs e sites ao lado. O Mano busca as novidades a cada 2 horas e, de madrugada, o modelo local resume
            cada artigo em poucas frases.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            {view === "new" ? "Tudo lido por aqui. ✓" : view === "starred" ? "Nenhuma notícia salva." : "Nada nos últimos dias."}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((it) => (
              <li key={it.id} className={`rounded-2xl border border-line bg-panel p-4 sm:p-5 ${it.read && view !== "starred" ? "opacity-70" : ""}`}>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="truncate font-medium text-accent/90">{it.feed}</span>
                  <span>·</span>
                  <span className="shrink-0">{ago(it.published)}</span>
                  <div className="ml-auto flex shrink-0 gap-1">
                    <button
                      className="rounded-md px-2 py-1 hover:bg-ink hover:text-text"
                      onClick={() => patch(it, { starred: !it.starred })}
                      aria-label={it.starred ? "Tirar dos salvos" : "Salvar"}
                      title={it.starred ? "Tirar dos salvos" : "Salvar"}
                    >
                      {it.starred ? <span className="text-accent">★</span> : "☆"}
                    </button>
                    {!it.read && (
                      <button
                        className="rounded-md px-2 py-1 hover:bg-ink hover:text-text"
                        onClick={() => patch(it, { read: true })}
                        aria-label="Marcar como lida"
                        title="Marcar como lida"
                      >
                        ✓
                      </button>
                    )}
                  </div>
                </div>
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => !it.read && patch(it, { read: true })}
                  className="mt-1 block text-lg font-medium leading-snug hover:text-accent"
                >
                  {it.title}
                </a>
                {it.summary && <p className="mt-2 text-sm leading-relaxed text-text/85">{it.summary}</p>}
                {it.summary_kind === "trecho" && llmReady && (
                  <p className="mt-2 text-xs text-muted">Começo do artigo — o resumo do Mano chega na próxima rodada.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <FeedsCard feeds={feeds} onChange={load} />
        <MorningCard mano={mano} />
        {!llmReady && (
          <Card title="Resumos">
            <p className="text-sm text-muted">
              Sem o modelo local, cada notícia mostra o começo do artigo.{" "}
              <button className="text-accent hover:underline" onClick={() => go("ajustes")}>
                Ver o modelo em Ajustes
              </button>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

function FeedsCard({ feeds, onChange }: { feeds: FeedInfo[]; onChange: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<{ title: string; url: string }[]>([]);

  useEffect(() => {
    api<{ title: string; url: string }[]>("/api/briefing/suggestions").then(setSuggestions).catch(() => {});
  }, [feeds.length]);

  const add = async (u: string, title?: string) => {
    setBusy(true);
    setError("");
    try {
      await api("/api/briefing/feeds", { url: u, title });
      setUrl("");
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Seus feeds">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) add(url.trim());
        }}
        className="flex gap-2"
      >
        <input
          className={`${input} min-w-0 flex-1`}
          placeholder="Endereço do blog ou do feed"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Endereço do blog ou do feed RSS"
        />
        <button className={btn.primary} disabled={busy || !url.trim()}>
          {busy ? "…" : "Adicionar"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-alert">{error}</p>}
      <p className="mt-2 text-xs text-muted">Pode colar o endereço do site: o Mano procura o feed RSS sozinho.</p>

      {feeds.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {feeds.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--color-ember)]"
                checked={f.active}
                onChange={(e) => api(`/api/briefing/feeds/${f.id}`, { active: e.target.checked }, "PATCH").then(onChange)}
                aria-label={`Buscar novidades de ${f.title}`}
              />
              <div className="min-w-0 flex-1">
                <div className={`truncate ${f.active ? "" : "text-muted line-through"}`}>{f.title}</div>
                <div className="truncate text-xs text-muted">
                  {f.error ? <span className="text-alert">{f.error}</span> : f.last_fetch ? `buscado ${ago(f.last_fetch)}` : "ainda não buscado"}
                </div>
              </div>
              <button
                className="rounded-md px-2 py-1 text-muted hover:text-alert"
                onClick={() => {
                  if (confirm(`Tirar “${f.title}” e as notícias dele?`)) api(`/api/briefing/feeds/${f.id}`, undefined, "DELETE").then(onChange);
                }}
                aria-label={`Remover ${f.title}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs text-muted">Sugestões</div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s.url} className={btn.chip} disabled={busy} onClick={() => add(s.url, s.title)}>
                + {s.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function MorningCard({ mano }: { mano: Mano }) {
  const b = mano.briefing;
  const [time, setTime] = useState(b?.morning_at ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => setTime(b?.morning_at ?? ""), [b?.morning_at]);

  const save = async (value: string) => {
    await api("/api/briefing/config", { morning_at: value });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <Card title="Bom dia">
      <p className="text-sm text-text/85">
        Diga <b>“fala Mano, bom dia”</b> para ouvir agenda, remédios, hábitos, tarefas, e-mails e as manchetes de uma vez.
      </p>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save(time);
        }}
      >
        <label className="text-sm text-muted" htmlFor="morning-at">
          Falar sozinho às
        </label>
        <input id="morning-at" type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} />
        <button className={btn.ghost} disabled={(b?.morning_at ?? "") === time}>
          Salvar
        </button>
        {b?.morning_at && (
          <button type="button" className={btn.danger} onClick={() => save("")}>
            Desligar
          </button>
        )}
        {saved && <span className="text-xs text-accent">✓</span>}
      </form>
      <p className="mt-3 text-xs text-muted">
        Resumos das notícias: todo dia às {b?.summarize_at ?? "05:00"}, se o notebook estiver ligado.
      </p>
    </Card>
  );
}
