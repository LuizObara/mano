import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Icon, btn } from "../components/ui";
import { api, type Mano, type NoteHit } from "../lib/mano";
import { useStored } from "../lib/prefs";

type NoteFile = { path: string; title: string; content: string; backlinks: NoteHit[]; obsidian_url: string };

type Folder = {
  path: string; // "" = raiz do vault
  name: string;
  num: string | null; // prefixo Johnny.Decimal ("10–19", "21")
  depth: number;
  area: number; // índice da área de topo (para a cor); -1 = raiz
  children: Folder[];
  notes: NoteHit[];
  count: number; // notas nesta pasta e nas de dentro
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const AREA_COLORS = 5;
const areaColor = (area: number) => (area < 0 ? "var(--color-muted)" : `var(--color-area-${area % AREA_COLORS})`);

/** "10-19 Journal" → ["10–19", "Journal"]; "21 Projects" → ["21", "Projects"]; "SIA" → [null, "SIA"]. */
function splitNum(name: string): [string | null, string] {
  const m = name.match(/^(\d{1,3}(?:\s*-\s*\d{1,3})?)[\s.)_-]+(.+)$/);
  return m ? [m[1].replace(/\s*-\s*/, "–"), m[2]] : [null, name];
}

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const DATE_TITLE = /^\d{4}-\d{2}-\d{2}/;

/** Notas diárias (títulos com data) da mais nova para a mais velha; o resto em ordem natural (Aula 2 antes de Aula 10). */
function sortNotes(notes: NoteHit[]) {
  const dated = notes.length > 0 && notes.every((n) => DATE_TITLE.test(n.title));
  return [...notes].sort((a, b) => (dated ? b.title.localeCompare(a.title) : collator.compare(a.title, b.title)));
}

function buildTree(all: NoteHit[]): { root: Folder; byPath: Map<string, Folder> } {
  const root: Folder = { path: "", name: "Vault", num: null, depth: -1, area: -1, children: [], notes: [], count: 0 };
  const byPath = new Map<string, Folder>([["", root]]);
  const ensure = (path: string): Folder => {
    const found = byPath.get(path);
    if (found) return found;
    const cut = path.lastIndexOf("/");
    const parent = ensure(cut < 0 ? "" : path.slice(0, cut));
    const [num, name] = splitNum(path.slice(cut + 1));
    const f: Folder = { path, name, num, depth: parent.depth + 1, area: -1, children: [], notes: [], count: 0 };
    parent.children.push(f);
    byPath.set(path, f);
    return f;
  };
  for (const n of all) ensure(n.folder).notes.push(n);
  const finish = (f: Folder, area: number): number => {
    f.children.sort((a, b) => collator.compare(a.path, b.path));
    f.notes = sortNotes(f.notes);
    f.count = f.notes.length;
    f.children.forEach((c, i) => {
      c.area = f.depth < 0 ? i : area;
      f.count += finish(c, c.area);
    });
    return f.count;
  };
  finish(root, -1);
  return { root, byPath };
}

const crumbs = (folder: string) =>
  folder
    ? folder
        .split("/")
        .map((p) => splitNum(p)[1])
        .join(" › ")
    : "Vault";

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
          <mark key={i} className="rounded bg-ember-soft px-0.5 text-text">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

function Dot({ area }: { area: number }) {
  return <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: areaColor(area) }} />;
}

export function NotesPage({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const status = mano.notes;
  const [openPath, open] = useOpenPath();
  const [all, setAll] = useState<NoteHit[]>([]);
  const [expanded, setExpanded] = useStored<string[]>("mano.notes.expanded", []);
  const [selected, setSelected] = useStored<string | null>("mano.notes.folder", null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<NoteHit[]>([]);
  const [note, setNote] = useState<NoteFile | null>(null);
  const [missing, setMissing] = useState("");
  const [capture, setCapture] = useState("");
  const [saved, setSaved] = useState("");
  const viewer = useRef<HTMLDivElement>(null);

  // todas as notas (a árvore); refaz quando o índice muda
  useEffect(() => {
    if (!status?.configured) return;
    api<NoteHit[]>("/api/notes/tree").then(setAll).catch(() => setAll([]));
  }, [status?.configured, status?.total]);

  const { root, byPath } = useMemo(() => buildTree(all), [all]);
  // sem pasta escolhida (ou ela sumiu do vault): a primeira área
  const folder = (selected !== null && byPath.get(selected)) || root.children[0] || root;

  // busca, com pequena espera enquanto digita
  useEffect(() => {
    if (!status?.configured || !q.trim()) {
      setHits([]);
      return;
    }
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

  // nota aberta por voz ou link: mostra a pasta dela e abre o caminho na árvore
  useEffect(() => {
    if (!openPath) return;
    const dir = openPath.includes("/") ? openPath.slice(0, openPath.lastIndexOf("/")) : "";
    setSelected(dir);
    const parts = dir.split("/").filter(Boolean);
    const chain = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
    setExpanded((cur) => [...new Set([...cur, ...chain])]);
  }, [openPath]); // eslint-disable-line react-hooks/exhaustive-deps

  const rendered = useMemo(() => (note ? render(note.content) : null), [note]);

  const pickFolder = (f: Folder) => {
    const isOpen = expanded.includes(f.path);
    if (f.children.length) {
      // primeiro clique abre e seleciona; clicar de novo na selecionada fecha
      setExpanded(isOpen && selected === f.path ? expanded.filter((p) => p !== f.path) : [...new Set([...expanded, f.path])]);
    }
    setSelected(f.path);
    setQ("");
  };

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
          <button className="text-accent underline-offset-2 hover:underline" onClick={() => go("ajustes")}>
            Configurar em Ajustes
          </button>
        </p>
      </Card>
    );
  }

  // grupos da coluna do meio: resultados da busca por pasta, ou a pasta escolhida e as de dentro
  const groups: { key: string; title: string; area: number; notes: NoteHit[] }[] = [];
  if (q.trim()) {
    const by = new Map<string, NoteHit[]>();
    for (const h of hits) by.set(h.folder, [...(by.get(h.folder) ?? []), h]);
    for (const [dir, list] of by) groups.push({ key: dir, title: crumbs(dir), area: byPath.get(dir)?.area ?? -1, notes: list });
  } else {
    if (folder.notes.length) groups.push({ key: folder.path, title: "Nesta pasta", area: folder.area, notes: folder.notes });
    const walk = (f: Folder, rel: string[]) =>
      f.children.forEach((c) => {
        const r = [...rel, c.name];
        if (c.notes.length) groups.push({ key: c.path, title: r.join(" › "), area: c.area, notes: c.notes });
        walk(c, r);
      });
    walk(folder, []);
  }

  const rows: Folder[] = [];
  const addRows = (f: Folder) =>
    f.children.forEach((c) => {
      rows.push(c);
      if (expanded.includes(c.path)) addRows(c);
    });
  addRows(root);
  const daily = status.daily?.replace(/\.md$/, "") ?? "";

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={doCapture} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[28px] border border-line bg-panel py-2 pl-5 pr-2">
        <Icon name="pen" className="size-[18px] text-accent" />
        <input
          className="min-h-11 min-w-0 flex-[1_1_240px] bg-transparent text-base outline-none placeholder:text-muted/80"
          placeholder="Capturar uma ideia na nota de hoje…"
          value={capture}
          onChange={(e) => setCapture(e.target.value)}
          aria-label="Capturar na nota de hoje"
        />
        <span className="text-[13px] text-muted">
          {saved ? (
            <button type="button" className="font-semibold text-accent hover:underline" onClick={() => open(saved)}>
              ✓ salvo — ver nota
            </button>
          ) : (
            daily && (
              <>
                vai para <strong className="font-semibold text-text">{crumbs(daily)}</strong>
              </>
            )
          )}
        </span>
        <button className={`${btn.primary} min-h-11`} disabled={!capture.trim()}>
          Anotar
        </button>
      </form>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,300px)_minmax(0,380px)_minmax(0,1fr)]">
        <aside className="flex max-h-[55vh] min-w-0 flex-col gap-2.5 overflow-y-auto rounded-3xl border border-line bg-panel px-3 pb-3.5 pt-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
          <div className="flex items-baseline justify-between px-2">
            <h2 className="font-display text-[22px] font-medium">{status.vault_name ?? "Vault"}</h2>
            <span className="text-[13px] text-muted">{status.total} notas</span>
          </div>
          <label className="mx-1 flex items-center gap-2 rounded-full bg-ink px-3">
            <Icon name="search" className="size-4 shrink-0 text-muted" />
            <input
              type="search"
              className="min-h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/80"
              placeholder="Buscar (ignora acentos)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Buscar notas"
            />
          </label>
          <nav aria-label="Pastas do vault" className="flex flex-col gap-px">
            {root.notes.length > 0 && (
              <FolderRow f={root} label="Raiz do vault" selected={!q && folder === root} expanded={false} onPick={() => pickFolder(root)} />
            )}
            {rows.map((f) => (
              <FolderRow
                key={f.path}
                f={f}
                selected={!q && folder.path === f.path}
                expanded={expanded.includes(f.path)}
                onPick={() => pickFolder(f)}
              />
            ))}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col gap-4 rounded-3xl border border-line bg-panel p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {q.trim() ? (
            <div className="flex items-baseline gap-3">
              <h2 className="min-w-0 flex-1 font-display text-[26px] font-medium leading-tight">Resultados</h2>
              <span className="text-sm text-muted">{hits.length === 1 ? "1 nota" : `${hits.length} notas`}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-[13px] text-muted">
                <Dot area={folder.area} />
                {folder.path.includes("/") ? crumbs(folder.path.slice(0, folder.path.lastIndexOf("/"))) : "Vault"}
              </span>
              <div className="flex items-baseline gap-3">
                <h2 className="min-w-0 flex-1 font-display text-[28px] font-medium leading-tight">
                  {folder === root ? "Raiz do vault" : folder.name}
                </h2>
                <span className="shrink-0 text-sm text-muted">
                  {folder.count === 1 ? "1 nota" : `${folder.count} notas`}
                  {folder.children.length > 0 &&
                    ` · ${folder.children.length} ${folder.children.length === 1 ? "subpasta" : "subpastas"}`}
                </span>
              </div>
            </div>
          )}
          {groups.length === 0 && <p className="text-sm text-muted">{q.trim() ? "Nada encontrado." : "Nenhuma nota aqui."}</p>}
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 border-b border-soft px-1 py-1.5">
                {q.trim() ? <Dot area={g.area} /> : <Icon name="folder" className="size-3.5 text-accent" />}
                <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.08em] text-muted">{g.title}</span>
                <span className="text-xs text-muted">{g.notes.length}</span>
              </div>
              {g.notes.map((n) => (
                <button
                  key={n.path}
                  onClick={() => open(n.path)}
                  aria-current={openPath === n.path ? "true" : undefined}
                  className={`flex min-h-11 w-full flex-col justify-center rounded-xl px-2.5 py-1.5 text-left hover:bg-soft ${
                    openPath === n.path ? "bg-ink font-semibold" : ""
                  }`}
                >
                  <span className="flex w-full items-center gap-2.5">
                    <Icon name="file" className="size-[15px] shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-[15px]">{n.title}</span>
                  </span>
                  {n.snippet && (
                    <span className="mt-0.5 line-clamp-2 pl-6 text-xs font-normal text-muted">
                      <Snippet text={n.snippet} />
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </section>

        <div ref={viewer} className="min-w-0 scroll-mt-4">
          {note && rendered ? (
            <article className="flex flex-col gap-4 rounded-3xl border border-line bg-panel p-5 sm:p-9">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
                  <span className="flex items-center gap-1.5 text-[13px] text-muted">
                    <Dot area={byPath.get(note.path.includes("/") ? note.path.slice(0, note.path.lastIndexOf("/")) : "")?.area ?? -1} />
                    <span className="truncate">{crumbs(note.path.split("/").slice(0, -1).join("/"))}</span>
                  </span>
                  <h1 className="font-display text-[clamp(28px,3vw,38px)] font-medium leading-tight tracking-[-0.01em]">{note.title}</h1>
                  {rendered.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {rendered.tags.map((t) => (
                        <span key={t} className="rounded-full bg-soft px-3 py-1 text-[13px] text-muted">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <a href={note.obsidian_url} className={`${btn.ghost} flex min-h-11 items-center gap-2`}>
                  Abrir no Obsidian <Icon name="external" className="size-3.5" />
                </a>
                <button className={`${btn.ghost} min-h-11`} onClick={() => open(null)} aria-label="Fechar nota">
                  ×
                </button>
              </div>
              {missing && <p className="rounded-xl bg-ink px-3 py-2 text-sm text-muted">A nota “{missing}” ainda não existe no vault.</p>}
              {note.content.replace(FRONTMATTER, "").trim() ? (
                <div className="note-body" onClick={onViewerClick} dangerouslySetInnerHTML={{ __html: rendered.html }} />
              ) : (
                <p className="text-sm text-muted">Nota vazia.</p>
              )}
              {note.backlinks.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                  <h2 className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-muted">Mencionada em</h2>
                  {note.backlinks.map((b) => (
                    <button key={b.path} className={btn.chip} onClick={() => open(b.path)}>
                      {b.title}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ) : (
            <div className="rounded-3xl border border-dashed border-line p-10 text-center text-sm text-muted">
              Escolha uma nota, ou diga “fala Mano, lê a nota sobre…”.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FolderRow({
  f,
  label,
  selected,
  expanded,
  onPick,
}: {
  f: Folder;
  label?: string;
  selected: boolean;
  expanded: boolean;
  onPick: () => void;
}) {
  const top = f.depth === 0;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-expanded={f.children.length ? expanded : undefined}
      aria-current={selected ? "true" : undefined}
      style={{ paddingLeft: 10 + Math.max(0, f.depth) * 16 }}
      className={`flex min-h-10 w-full items-center gap-2 rounded-xl pr-2.5 text-left hover:bg-soft ${selected ? "bg-ink" : ""}`}
    >
      <span className="grid w-3.5 shrink-0 place-items-center text-muted">
        {f.children.length > 0 && <Icon name={expanded ? "chevron-down" : "chevron-right"} className="size-3" />}
      </span>
      {top || f.depth < 0 ? <Dot area={f.area} /> : <Icon name="folder" className="size-[15px] shrink-0 text-muted" />}
      {f.num && <span className="font-mono text-xs text-muted">{f.num}</span>}
      <span className={`min-w-0 flex-1 truncate text-[15px] ${selected || top ? "font-semibold" : ""}`}>{label ?? f.name}</span>
      <span className="text-xs tabular-nums text-muted">{f.count}</span>
    </button>
  );
}
