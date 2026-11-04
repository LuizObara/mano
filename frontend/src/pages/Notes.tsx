import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, btn, input } from "../components/ui";
import { api, type Mano, type NoteHit } from "../lib/mano";

type NoteFile = { path: string; title: string; content: string; backlinks: NoteHit[]; obsidian_url: string };

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Lê ?n=caminho do hash (#/notas?n=...). */
function useOpenPath(): [string | null, (p: string | null) => void] {
  const read = () => new URLSearchParams(location.hash.split("?")[1] ?? "").get("n");
  const [path, setPath] = useState<string | null>(read);
  useEffect(() => {
    const on = () => setPath(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const open = (p: string | null) => {
    location.hash = p ? `/notas?n=${encodeURIComponent(p)}` : "/notas";
  };
  return [path, open];
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function render(md: string): { html: string; tags: string[] } {
  const fm = md.match(FRONTMATTER);
  const tags = fm ? [...fm[1].matchAll(/^\s*-\s*([\w/-]+)\s*$/gm)].map((m) => m[1]) : [];
  let body = md.replace(FRONTMATTER, "");
  // ![[anexo]] e [[Nota|apelido]] → elementos clicáveis antes de passar pelo marked
  body = body.replace(/!\[\[([^\]]+)\]\]/g, (_m, t) => `<span class="note-embed">📎 ${escapeHtml(t)}</span>`);
  body = body.replace(/\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, target, _h, alias) =>
    `<a href="#" data-wikilink="${escapeHtml(target.trim())}">${escapeHtml((alias ?? target).trim())}</a>`,
  );
  const html = DOMPurify.sanitize(marked.parse(body, { async: false, gfm: true, breaks: true }) as string);
  return { html, tags };
}

function Snippet({ text }: { text: string }) {
  // «termo» vem do índice marcando o trecho encontrado
  const parts = text.split(/(«[^»]*»)/g);
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith("«") ? (
          <mark key={i} className="rounded bg-ember-soft px-0.5 text-ember">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export function NotesPage({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const status = mano.notes;
  const [openPath, open] = useOpenPath();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<NoteHit[]>([]);
  const [note, setNote] = useState<NoteFile | null>(null);
  const [missing, setMissing] = useState("");
  const [capture, setCapture] = useState("");
  const [saved, setSaved] = useState("");
  const viewer = useRef<HTMLDivElement>(null);

  // busca (vazia = recentes), com pequena espera enquanto digita
  useEffect(() => {
    if (!status?.configured) return;
    const id = window.setTimeout(() => {
      api<NoteHit[]>(`/api/notes/search?q=${encodeURIComponent(q)}`).then(setHits).catch(() => setHits([]));
    }, 200);
    return () => window.clearTimeout(id);
  }, [q, status?.configured, status?.total]);

  useEffect(() => {
    setMissing("");
    if (!openPath) {
      setNote(null);
      return;
    }
    api<NoteFile>(`/api/notes/file?path=${encodeURIComponent(openPath)}`)
      .then((n) => {
        setNote(n);
        viewer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      })
      .catch(() => setNote(null));
  }, [openPath, status?.total]);

  const rendered = useMemo(() => (note ? render(note.content) : null), [note]);

  const onViewerClick = async (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    const wl = a.getAttribute("data-wikilink");
    if (wl) {
      e.preventDefault();
      try {
        const r = await api<{ path: string }>(`/api/notes/resolve?link=${encodeURIComponent(wl)}`);
        open(r.path);
      } catch {
        setMissing(wl);
      }
    } else if (a.href.startsWith("http")) {
      e.preventDefault();
      window.open(a.href, "_blank", "noreferrer");
    }
  };

  const doCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capture.trim()) return;
    const r = await api<{ path: string }>("/api/notes/capture", { text: capture });
    setCapture("");
    setSaved(r.path);
    window.setTimeout(() => setSaved(""), 4000);
  };

  if (!status?.configured) {
    return (
      <Card title="Notas">
        <p className="text-sm text-muted">
          Ainda falta dizer onde fica seu vault do Obsidian.{" "}
          <button className="text-ember underline-offset-2 hover:underline" onClick={() => go("ajustes")}>
            Configurar em Ajustes
          </button>
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={doCapture} className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-4 sm:flex-row sm:items-center">
        <input
          className={`${input} min-w-0 flex-1 text-base`}
          placeholder="Capturar uma ideia na nota de hoje…"
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          aria-label="Capturar na nota de hoje"
        />
        <button className={btn.primary} disabled={!capture.trim()}>
          Anotar
        </button>
        <span className="text-xs text-muted sm:w-48 sm:text-right">
          {saved ? (
            <button type="button" className="text-ember hover:underline" onClick={() => open(saved)}>
              ✓ salvo — ver nota
            </button>
          ) : (
            <>em {status.daily?.split("/").pop()?.replace(/\.md$/, "")}</>
          )}
        </span>
      </form>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title={q ? "Resultados" : "Recentes"} action={<span className="text-xs text-muted">{status.total} notas</span>}>
          <input
            className={`${input} mb-3 w-full`}
            placeholder="Buscar no vault (ignora acentos)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar notas"
          />
          {hits.length === 0 && <p className="text-sm text-muted">{q ? "Nada encontrado." : "Nenhuma nota ainda."}</p>}
          <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
            {hits.map((h) => (
              <li key={h.path}>
                <button
                  onClick={() => open(h.path)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-ink/60 ${openPath === h.path ? "bg-ink/80" : ""}`}
                >
                  <div className="truncate font-medium">{h.title}</div>
                  <div className="truncate text-xs text-muted">{h.folder || "raiz"}</div>
                  {h.snippet && (
                    <div className="mt-1 line-clamp-2 text-xs text-text/75">
                      <Snippet text={h.snippet} />
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <div ref={viewer} className="min-w-0 scroll-mt-4">
          {note && rendered ? (
            <article className="rounded-2xl border border-line bg-panel p-5 sm:p-7">
              <div className="mb-4 flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-muted">{note.path.split("/").slice(0, -1).join(" › ") || "raiz"}</div>
                  <h1 className="text-2xl font-medium">{note.title}</h1>
                  {rendered.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rendered.tags.map((t) => (
                        <span key={t} className="rounded-full bg-line px-2 py-0.5 text-xs text-muted">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <a href={note.obsidian_url} className={btn.ghost}>
                  Abrir no Obsidian
                </a>
                <button className={btn.ghost} onClick={() => open(null)} aria-label="Fechar nota">
                  ×
                </button>
              </div>
              {missing && (
                <p className="mb-3 rounded-lg bg-ink/60 px-3 py-2 text-sm text-muted">
                  A nota “{missing}” ainda não existe no vault.
                </p>
              )}
              {note.content.replace(FRONTMATTER, "").trim() ? (
                <div className="note-body" onClick={onViewerClick} dangerouslySetInnerHTML={{ __html: rendered.html }} />
              ) : (
                <p className="text-sm text-muted">Nota vazia.</p>
              )}
              {note.backlinks.length > 0 && (
                <div className="mt-6 border-t border-line pt-4">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Mencionada em</h2>
                  <ul className="flex flex-wrap gap-2">
                    {note.backlinks.map((b) => (
                      <li key={b.path}>
                        <button className={btn.chip} onClick={() => open(b.path)}>
                          {b.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
              Escolha uma nota à esquerda, ou diga “fala Mano, lê a nota sobre…”.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
