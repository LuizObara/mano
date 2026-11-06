import { useEffect, useState } from "react";
import { ago, api, hhmm, type BriefItem, type FeedInfo, type Mano } from "../lib/mano";
import { Card, Chip, Icon, Modal, ModalHeader } from "./ui";

/** Painel do Briefing no Início: a notícia principal em destaque e mais três; o resto abre num overlay. */
export function BriefingCard({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const b = mano.briefing;
  const top = b?.top ?? [];
  const [open, setOpen] = useState(false);
  const [feat, ...rest] = top;

  return (
    <>
      <Card
        title="Briefing"
        className="flex h-full flex-col"
        action={
          <>
            {!!b?.unread && (
              <span className="shrink-0 rounded-full bg-ember-soft px-2.5 py-0.5 text-[13px] font-semibold text-accent">
                {b.unread === 1 ? "1 novidade" : `${b.unread} novidades`}
              </span>
            )}
            {!!b?.feeds && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Abrir o briefing em tela cheia"
                title="Abrir em tela cheia"
                className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-soft hover:text-text"
              >
                <Icon name="expand" className="size-[18px]" />
              </button>
            )}
          </>
        }
      >
        {!b?.feeds ? (
          <p className="text-sm text-muted">
            Escolha seus blogs na{" "}
            <button className="text-accent hover:underline" onClick={() => go("briefing")}>
              aba Briefing
            </button>
            .
          </p>
        ) : !feat ? (
          <p className="text-sm text-muted">Nada novo nos seus feeds.</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex flex-col gap-1.5 rounded-[18px] bg-soft p-4 text-left hover:bg-ink"
            >
              <span className="text-xs text-muted">
                {feat.feed} · {ago(feat.published)}
              </span>
              <span className="line-clamp-2 font-display text-[21px] leading-tight">{feat.title}</span>
              {feat.summary && <span className="line-clamp-2 text-sm leading-normal text-muted">{feat.summary}</span>}
            </button>
            <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {rest.slice(0, 3).map((it) => (
                <li key={it.id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2.5 text-left hover:bg-soft"
                  >
                    <span className="w-full truncate text-[15px] font-medium">{it.title}</span>
                    <span className="text-xs text-muted">
                      {it.feed} · {ago(it.published)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!!b?.feeds && (
          <div className="mt-auto flex items-center justify-between gap-3 pt-2">
            {b.unread ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="-ml-2 min-h-10 rounded-full px-3.5 text-sm font-semibold text-accent hover:bg-soft"
              >
                {b.unread === 1 ? "Ver a novidade" : `Ver as ${b.unread} novidades`}
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => go("briefing")} className="py-2 text-[13px] text-accent hover:underline">
              aba Briefing →
            </button>
          </div>
        )}
      </Card>
      {open && <BriefingOverlay mano={mano} go={go} onClose={() => setOpen(false)} />}
    </>
  );
}

function BriefingOverlay({ mano, go, onClose }: { mano: Mano; go: (p: string) => void; onClose: () => void }) {
  const b = mano.briefing;
  const [feed, setFeed] = useState<number | null>(null);
  const [items, setItems] = useState<BriefItem[] | null>(null);
  const [feeds, setFeeds] = useState<FeedInfo[]>([]);

  useEffect(() => {
    const q = new URLSearchParams({ view: "new", days: "3" });
    if (feed) q.set("feed", String(feed));
    api<{ items: BriefItem[]; feeds: FeedInfo[] }>(`/api/briefing?${q}`)
      .then((r) => {
        setItems(r.items);
        setFeeds(r.feeds);
      })
      .catch(() => setItems([]));
  }, [feed]);

  // as marcações ficam na lista aberta (o item não some ao marcar como lido)
  const patch = (it: BriefItem, body: Partial<Pick<BriefItem, "read" | "starred">>) => {
    setItems((xs) => xs?.map((x) => (x.id === it.id ? { ...x, ...body } : x)) ?? null);
    api(`/api/briefing/items/${it.id}`, body).catch(() => {});
  };
  const readAll = () => {
    const ids = (items ?? []).filter((x) => !x.read).map((x) => x.id);
    if (!ids.length) return;
    setItems((xs) => xs?.map((x) => ({ ...x, read: true })) ?? null);
    api("/api/briefing/read-all", { ids }).catch(() => {});
  };

  const withNews = feeds.filter((f) => f.active && f.unread > 0);
  const sub = [
    b?.unread ? `${b.unread} ${b.unread === 1 ? "novidade" : "novidades"} de ${withNews.length} ${withNews.length === 1 ? "blog" : "blogs"}` : "Tudo lido",
    b?.last_fetch ? `atualizado às ${hhmm(b.last_fetch)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Modal label="Briefing" onClose={onClose}>
      <ModalHeader title="Briefing" sub={sub} onClose={onClose}>
        <button
          type="button"
          onClick={readAll}
          disabled={!items?.some((x) => !x.read)}
          className="min-h-11 rounded-full border border-line px-4 text-sm font-semibold hover:bg-soft disabled:opacity-40"
        >
          Marcar tudo como lido
        </button>
      </ModalHeader>

      {withNews.length > 1 && (
        <div role="group" aria-label="Filtrar por blog" className="flex flex-wrap gap-2 border-t border-line px-5 py-3.5 sm:px-7">
          <Chip on={feed === null} onClick={() => setFeed(null)}>
            Todos
          </Chip>
          {withNews.map((f) => (
            <Chip key={f.id} on={feed === f.id} onClick={() => setFeed(f.id)}>
              {f.title}
            </Chip>
          ))}
        </div>
      )}

      <ul className="flex flex-col px-5 pb-2 sm:px-7">
        {items === null && <li className="border-t border-line py-10 text-center text-muted">Carregando…</li>}
        {items?.length === 0 && <li className="border-t border-line py-10 text-center text-muted">Nada novo por aqui.</li>}
        {items?.map((it) => (
          <li key={it.id} className={`flex flex-col gap-2 border-t border-line py-4.5 ${it.read ? "opacity-60" : ""}`}>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
              <span className="font-semibold text-text">{it.feed}</span>
              <span>{ago(it.published)}</span>
              {it.summary && (
                <span className="rounded-full bg-soft px-2 py-px text-xs">{it.summary_kind === "llm" ? "resumo do Mano" : "trecho"}</span>
              )}
            </div>
            <a
              href={it.url}
              target="_blank"
              rel="noreferrer"
              className="font-display text-[22px] leading-tight text-text hover:text-accent"
            >
              {it.title}
            </a>
            {it.summary && <p className="max-w-[72ch] text-[15px] leading-relaxed text-muted">{it.summary}</p>}
            <div className="-ml-2.5 flex flex-wrap gap-1">
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center rounded-full px-2.5 text-sm font-semibold text-accent hover:bg-soft"
              >
                Ler no site ↗
              </a>
              <button
                type="button"
                onClick={() => patch(it, { read: !it.read })}
                className="min-h-9 rounded-full px-2.5 text-sm text-muted hover:bg-soft hover:text-text"
              >
                {it.read ? "Marcar como não lido" : "Marcar como lido"}
              </button>
              <button
                type="button"
                onClick={() => patch(it, { starred: !it.starred })}
                aria-pressed={it.starred}
                className={`flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm hover:bg-soft ${it.starred ? "text-accent" : "text-muted hover:text-text"}`}
              >
                <Icon name="star" className="size-4" />
                {it.starred ? "Guardado" : "Guardar"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex justify-end border-t border-line px-5 pb-5 pt-3.5 sm:px-7">
        <button
          type="button"
          onClick={() => {
            onClose();
            go("briefing");
          }}
          className="py-2 text-sm font-semibold text-accent hover:underline"
        >
          Abrir a aba Briefing (feeds e ajustes) →
        </button>
      </div>
    </Modal>
  );
}
