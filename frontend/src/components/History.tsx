import { useEffect, useState } from "react";
import { api, hhmm, isoDay, type LogEntry, type Mano } from "../lib/mano";
import { Card, Chip, Icon, Modal, ModalHeader } from "./ui";

const CARD_PAGE = 6;
const OV_PAGE = 10;
type Page = { items: LogEntry[]; total: number };

const KINDS = [
  { id: "todos", label: "Todos" },
  { id: "voz", label: "Por voz" },
  { id: "texto", label: "Digitados" },
  { id: "erro", label: "Não entendidos" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

function dayLabel(ms: number, now = new Date()) {
  const d = new Date(ms);
  if (isoDay(d) === isoDay(now)) return "Hoje";
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (isoDay(d) === isoDay(y)) return "Ontem";
  const s = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function SourceIcon({ e, className }: { e: LogEntry; className: string }) {
  const voice = e.source === "voice";
  return (
    <span title={voice ? "por voz" : "digitado"} className="pt-0.5 text-muted">
      <Icon name={voice ? "mic" : "keyboard"} className={className} />
      <span className="sr-only">{voice ? "por voz" : "digitado"}</span>
    </span>
  );
}

/** Painel "Últimos comandos": 6 por página, setas para os mais antigos e o histórico completo num overlay. */
export function History({ mano, speak }: { mano: Mano; speak: boolean }) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [open, setOpen] = useState(false);
  const latest = mano.history[0]?.id;

  // recarrega a página aberta sempre que chega um comando novo
  useEffect(() => {
    api<Page>(`/api/history/page?offset=${page * CARD_PAGE}&limit=${CARD_PAGE}`)
      .then(setData)
      .catch(() => {});
  }, [page, latest]);

  const rows = data?.items ?? (page === 0 ? mano.history.slice(0, CARD_PAGE) : []);
  const total = Math.max(data?.total ?? 0, mano.history.length);
  const pages = Math.max(1, Math.ceil(total / CARD_PAGE));
  const today = isoDay(new Date());

  return (
    <>
      <Card
        title="Últimos comandos"
        className="flex h-full flex-col"
        action={
          total > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir o histórico de comandos em tela cheia"
              title="Abrir em tela cheia"
              className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-soft hover:text-text"
            >
              <Icon name="expand" className="size-[18px]" />
            </button>
          )
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted">Nada ainda.</p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {rows.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[44px_18px_minmax(0,1fr)] items-start gap-x-2 border-b border-line py-2 last:border-b-0"
              >
                <span className="flex flex-col pt-px text-[13px] tabular-nums leading-tight text-muted" title={new Date(e.at).toLocaleString("pt-BR")}>
                  {hhmm(e.at)}
                  {isoDay(new Date(e.at)) !== today && <span className="text-[11px]">{dayLabel(e.at).toLowerCase()}</span>}
                </span>
                <SourceIcon e={e} className="size-[15px]" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-medium">{e.text}</span>
                  <span className={`truncate text-[13px] ${e.intent ? "text-muted" : "text-alert"}`}>{e.reply}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {total > 0 && (
          <div className="mt-auto flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                aria-label="Comandos mais recentes"
                className="grid size-10 place-items-center rounded-full text-muted hover:bg-soft hover:text-text disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <Icon name="chevron-left" className="size-4" />
              </button>
              <span className="min-w-[88px] text-center text-[13px] tabular-nums text-muted">
                {page * CARD_PAGE + 1}–{Math.min(total, (page + 1) * CARD_PAGE)} de {total}
              </span>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= pages - 1}
                aria-label="Comandos mais antigos"
                className="grid size-10 place-items-center rounded-full text-muted hover:bg-soft hover:text-text disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <Icon name="chevron-right" className="size-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="min-h-10 rounded-full px-3.5 text-sm font-semibold text-accent hover:bg-soft"
            >
              Ver histórico completo
            </button>
          </div>
        )}
      </Card>
      {open && <HistoryOverlay mano={mano} speak={speak} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Números de página com reticências: 1 … 4 5 6 … 12. */
function pageList(cur: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const keep = [...new Set([0, count - 1, cur - 1, cur, cur + 1])].filter((i) => i >= 0 && i < count).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  keep.forEach((i, k) => {
    if (k > 0 && i - keep[k - 1] > 1) out.push(null);
    out.push(i);
  });
  return out;
}

function HistoryOverlay({ mano, speak, onClose }: { mano: Mano; speak: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>("todos");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [errors, setErrors] = useState(0);
  const latest = mano.history[0]?.id;

  useEffect(() => {
    const id = window.setTimeout(() => {
      setQ(text.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(id);
  }, [text]);

  useEffect(() => {
    const p = new URLSearchParams({ offset: String(page * OV_PAGE), limit: String(OV_PAGE), kind, q });
    api<Page>(`/api/history/page?${p}`)
      .then(setData)
      .catch(() => setData({ items: [], total: 0 }));
  }, [page, kind, q, latest]);

  useEffect(() => {
    api<Page>("/api/history/page?kind=erro&limit=1")
      .then((r) => setErrors(r.total))
      .catch(() => {});
  }, [latest]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / OV_PAGE));
  const all = kind === "todos" && !q ? total : null;
  const groups: { day: string; rows: LogEntry[] }[] = [];
  for (const e of data?.items ?? []) {
    const day = dayLabel(e.at);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.rows.push(e);
    else groups.push({ day, rows: [e] });
  }

  const repeat = (e: LogEntry) => {
    onClose();
    mano.send(e.text, speak);
  };

  return (
    <Modal label="Histórico de comandos" onClose={onClose} className="max-w-[860px]">
      <ModalHeader
        title="Últimos comandos"
        sub={
          data === null
            ? "Carregando…"
            : all !== null
            ? `${all} ${all === 1 ? "comando guardado" : "comandos guardados"}${errors ? ` · ${errors} não ${errors === 1 ? "entendido" : "entendidos"}` : ""}`
            : `${total} ${total === 1 ? "resultado" : "resultados"}`
        }
        onClose={onClose}
      />
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 pb-4 sm:px-7">
        <label className="flex min-h-11 flex-[1_1_240px] items-center gap-2 rounded-full border border-line bg-ink px-3.5 text-muted focus-within:border-accent">
          <Icon name="search" className="size-4 shrink-0" />
          <span className="sr-only">Buscar nos comandos</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar comando ou resposta"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted/80"
          />
        </label>
        <div role="group" aria-label="Filtrar" className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <Chip
              key={k.id}
              on={kind === k.id}
              onClick={() => {
                setKind(k.id);
                setPage(0);
              }}
            >
              {k.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col px-5 pb-2.5 pt-1.5 sm:px-7">
        {data === null && <p className="py-10 text-center text-muted">Carregando…</p>}
        {data && total === 0 && <p className="py-10 text-center text-muted">Nenhum comando com esse filtro.</p>}
        {groups.map((g) => (
          <section key={g.day} className="flex flex-col">
            <h3 className="pb-1.5 pt-4 text-xs font-bold uppercase tracking-[0.08em] text-muted">{g.day}</h3>
            <ul>
              {g.rows.map((e) => (
                <li key={e.id} className="grid grid-cols-[48px_20px_minmax(0,1fr)_auto] items-start gap-x-2.5 border-t border-line py-3">
                  <span className="pt-0.5 text-sm tabular-nums text-muted">{hhmm(e.at)}</span>
                  <SourceIcon e={e} className="size-4" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium [overflow-wrap:anywhere]">{e.text}</span>
                    <span
                      title={e.reply.length > 220 ? e.reply : undefined}
                      className={`line-clamp-3 text-sm leading-snug [overflow-wrap:anywhere] ${e.intent ? "text-muted" : "text-alert"}`}
                    >
                      {e.reply}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => repeat(e)}
                    aria-label={`Repetir “${e.text}”`}
                    title="Repetir este comando"
                    className="grid size-10 place-items-center rounded-xl text-muted hover:bg-soft hover:text-text"
                  >
                    <Icon name="repeat" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {total > OV_PAGE && (
        <nav
          aria-label="Páginas do histórico"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-t border-line px-5 pb-5 pt-3.5 sm:pl-7 sm:pr-6"
        >
          <span className="text-sm tabular-nums text-muted">
            {page * OV_PAGE + 1}–{Math.min(total, (page + 1) * OV_PAGE)} de {total}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
              className="flex min-h-10 items-center gap-1 rounded-full pl-2 pr-3 text-sm text-muted hover:bg-soft hover:text-text disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <Icon name="chevron-left" className="size-4" />
              Mais recentes
            </button>
            {pageList(page, pages).map((i, k) =>
              i === null ? (
                <span key={`gap${k}`} className="px-1 text-muted" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  aria-current={i === page ? "page" : undefined}
                  aria-label={`Página ${i + 1}`}
                  className={`size-10 rounded-full text-sm tabular-nums ${
                    i === page ? "bg-ember font-bold text-on-ember" : "text-muted hover:bg-soft hover:text-text"
                  }`}
                >
                  {i + 1}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => setPage(page + 1)}
              disabled={page >= pages - 1}
              className="flex min-h-10 items-center gap-1 rounded-full pl-3 pr-2 text-sm text-muted hover:bg-soft hover:text-text disabled:opacity-35 disabled:hover:bg-transparent"
            >
              Mais antigos
              <Icon name="chevron-right" className="size-4" />
            </button>
          </div>
        </nav>
      )}
    </Modal>
  );
}
