"""Acesso ao vault do Obsidian: índice de busca (SQLite FTS5), leitura e captura na nota diária.

Na nota do dia o Mano só ACRESCENTA capturas e reescreve apenas a própria seção "## Anotações" (a da aba
Calendário); o resto do arquivo fica como está.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path

SKIP_DIRS = {".obsidian", ".git", ".trash", "node_modules"}
DAILY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}\.md$")
FRONTMATTER_RE = re.compile(r"^---\r?\n.*?\r?\n---\r?\n?", re.S)
CAPTURE_HEADING = "## Capturas"
NOTES_HEADING = "## Anotações"


def fold(text: str) -> str:
    """minúsculo e sem acento, mantendo o mesmo tamanho (1 caractere → 1 caractere)."""
    out = []
    for c in text:
        base = "".join(x for x in unicodedata.normalize("NFD", c.lower()) if unicodedata.category(x) != "Mn")
        out.append(base[:1] if base else c)
    return "".join(out)


def frontmatter_tags(fm: str) -> list[str]:
    """tags em lista YAML (- a) ou inline (tags: [a, b] / tags: a b)."""
    m = re.search(r"^tags:\s*(.*?)(?=^\w[\w-]*:|\Z|^---)", fm, flags=re.M | re.S)
    if not m:
        return []
    block = m.group(1)
    items = re.findall(r"^\s*-\s+([^\s#][^\n]*?)\s*$", block, flags=re.M)
    if not items:
        items = re.split(r"[,\s]+", block.strip().strip("[]"))
    return [t.strip().strip("'\"#") for t in items if t.strip().strip("'\"#")]


def plain(md: str) -> str:
    """Markdown → texto corrido para falar ou mostrar em resumo."""
    t = FRONTMATTER_RE.sub("", md)
    t = re.sub(r"```.*?```", " ", t, flags=re.S)
    t = re.sub(r"!\[\[[^\]]*\]\]", " ", t)  # embeds
    t = re.sub(r"\[\[([^\]|#]*)(?:#[^\]|]*)?\|([^\]]*)\]\]", r"\2", t)
    t = re.sub(r"\[\[([^\]|#]*)(?:#[^\]]*)?\]\]", r"\1", t)
    t = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", t)
    t = re.sub(r"^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+", "", t, flags=re.M)
    t = re.sub(r"[*_`~=]{1,3}", "", t)
    t = re.sub(r"^\s*- \[[ x]\]\s*", "", t, flags=re.M)
    return re.sub(r"\s+", " ", t).strip()


def moment_to_strftime(fmt: str) -> str | None:
    """Converte o formato de data do Obsidian (moment.js) nos casos comuns."""
    out, i = "", 0
    tokens = [("YYYY", "%Y"), ("MM", "%m"), ("DD", "%d"), ("YY", "%y")]
    while i < len(fmt):
        for tok, rep in tokens:
            if fmt.startswith(tok, i):
                out += rep
                i += len(tok)
                break
        else:
            ch = fmt[i]
            if ch.isalpha():
                return None  # token que não sabemos traduzir
            out += ch
            i += 1
    return out


@dataclass
class DailyConfig:
    folder: str  # relativo ao vault ("" = raiz)
    strftime: str
    template: str | None


class Vault:
    def __init__(self, root: Path, db_path: Path):
        self.root = root
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    # ---------- banco ----------

    def _conn(self) -> sqlite3.Connection:
        c = sqlite3.connect(self.db_path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        return c

    def _init_db(self) -> None:
        with self._conn() as c:
            c.execute("CREATE TABLE IF NOT EXISTS notes_meta (path TEXT PRIMARY KEY, mtime REAL, title TEXT, "
                      "folder TEXT, size INTEGER, links TEXT)")
            c.execute("CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(path UNINDEXED, title, body, "
                      "tokenize = 'unicode61 remove_diacritics 2')")

    # ---------- arquivos ----------

    def iter_files(self):
        for p in self.root.rglob("*.md"):
            rel = p.relative_to(self.root)
            if any(part in SKIP_DIRS for part in rel.parts[:-1]):
                continue
            yield rel.as_posix(), p

    def resolve(self, rel: str) -> Path:
        p = (self.root / rel).resolve()
        if self.root.resolve() not in p.parents or p.suffix.lower() != ".md":
            raise ValueError("caminho fora do vault")
        return p

    def read(self, rel: str) -> str:
        return self.resolve(rel).read_text(encoding="utf-8", errors="replace")

    # ---------- índice ----------

    def reindex(self) -> dict:
        """Atualiza só o que mudou (compara mtime). Retorna contagens."""
        with self._lock, self._conn() as c:
            known = {r["path"]: r["mtime"] for r in c.execute("SELECT path, mtime FROM notes_meta")}
            seen, changed = set(), 0
            for rel, p in self.iter_files():
                seen.add(rel)
                st = p.stat()
                if known.get(rel) == st.st_mtime:
                    continue
                raw = p.read_text(encoding="utf-8", errors="replace")
                links = sorted(set(re.findall(r"\[\[([^\]|#]+)", raw)))
                # indexa o texto sem o frontmatter, mas mantém as tags pesquisáveis
                fm = FRONTMATTER_RE.match(raw)
                tags = frontmatter_tags(fm.group(0)) if fm else []
                body = ("tags: " + " ".join(tags) + "\n" if tags else "") + FRONTMATTER_RE.sub("", raw)
                title = p.stem
                folder = str(Path(rel).parent.as_posix()) if "/" in rel else ""
                c.execute("DELETE FROM notes_fts WHERE path = ?", (rel,))
                c.execute("INSERT INTO notes_fts(path, title, body) VALUES (?, ?, ?)", (rel, title, body))
                c.execute("INSERT OR REPLACE INTO notes_meta VALUES (?, ?, ?, ?, ?, ?)",
                          (rel, st.st_mtime, title, folder, st.st_size, json.dumps(links, ensure_ascii=False)))
                changed += 1
            removed = [r for r in known if r not in seen]
            for rel in removed:
                c.execute("DELETE FROM notes_fts WHERE path = ?", (rel,))
                c.execute("DELETE FROM notes_meta WHERE path = ?", (rel,))
            return {"total": len(seen), "changed": changed, "removed": len(removed)}

    def search(self, query: str, limit: int = 10) -> list[dict]:
        words = re.findall(r"\w+", fold(query))
        words = [w for w in words if len(w) > 1 and w not in _STOPWORDS] or re.findall(r"\w+", fold(query))
        if not words:
            return []
        fts = " ".join(f'"{w}"*' for w in words)  # todos os termos, por prefixo
        with self._conn() as c:
            try:
                rows = c.execute(
                    "SELECT f.path, m.title, m.folder, m.mtime, "
                    "snippet(notes_fts, 2, '«', '»', '…', 14) AS snip, bm25(notes_fts, 0, 8.0, 1.0) AS rank "
                    "FROM notes_fts f JOIN notes_meta m ON m.path = f.path "
                    "WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?", (fts, limit)).fetchall()
                if not rows and len(words) > 1:  # nenhum com todos → qualquer termo
                    rows = c.execute(
                        "SELECT f.path, m.title, m.folder, m.mtime, "
                        "snippet(notes_fts, 2, '«', '»', '…', 14) AS snip, bm25(notes_fts, 0, 8.0, 1.0) AS rank "
                        "FROM notes_fts f JOIN notes_meta m ON m.path = f.path "
                        "WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?",
                        (" OR ".join(f'"{w}"*' for w in words), limit)).fetchall()
            except sqlite3.OperationalError:
                return []
        return [self._row(r, snippet=r["snip"].strip()) for r in rows]

    def recent(self, limit: int = 15) -> list[dict]:
        with self._conn() as c:
            rows = c.execute("SELECT path, title, folder, mtime FROM notes_meta ORDER BY mtime DESC LIMIT ?",
                             (limit,)).fetchall()
        return [self._row(r) for r in rows]

    def all_notes(self) -> list[dict]:
        """Todas as notas, ordenadas pelo caminho (para a árvore de pastas do visor)."""
        with self._conn() as c:
            rows = c.execute("SELECT path, title, folder, mtime FROM notes_meta ORDER BY path").fetchall()
        return [self._row(r) for r in rows]

    def titles(self) -> dict[str, str]:
        with self._conn() as c:
            return {r["path"]: r["title"] for r in c.execute("SELECT path, title FROM notes_meta")}

    def backlinks(self, rel: str) -> list[dict]:
        title = Path(rel).stem
        with self._conn() as c:
            rows = c.execute("SELECT path, title, folder, mtime, links FROM notes_meta WHERE path != ?",
                             (rel,)).fetchall()
        out = []
        for r in rows:
            links = json.loads(r["links"] or "[]")
            if any(Path(link).stem.strip().lower() == title.lower() for link in links):
                out.append(self._row(r))
        return out

    def find_by_link(self, target: str) -> str | None:
        """[[Nome]] → caminho da nota (como o Obsidian resolve: pelo nome do arquivo)."""
        name = Path(target.strip()).stem.lower()
        with self._conn() as c:
            row = c.execute("SELECT path FROM notes_meta WHERE lower(title) = ? ORDER BY length(path) LIMIT 1",
                            (name,)).fetchone()
        return row["path"] if row else None

    @staticmethod
    def _row(r, snippet: str | None = None) -> dict:
        d = {"path": r["path"], "title": r["title"], "folder": r["folder"],
             "mtime": int(r["mtime"] * 1000)}
        if snippet is not None:
            d["snippet"] = snippet
        return d

    # ---------- nota diária ----------

    def daily_config(self) -> DailyConfig:
        cfg = {}
        try:
            cfg = json.loads((self.root / ".obsidian" / "daily-notes.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            pass
        folder = (cfg.get("folder") or "").strip("/")
        if not folder:
            # sem configuração: usa a pasta que mais tem arquivos AAAA-MM-DD.md
            counts: dict[str, int] = {}
            for rel, _ in self.iter_files():
                if DAILY_RE.match(Path(rel).name):
                    parent = Path(rel).parent.as_posix()
                    counts[parent if parent != "." else ""] = counts.get(parent if parent != "." else "", 0) + 1
            if counts:
                folder = max(counts, key=counts.get)
        strf = moment_to_strftime(cfg.get("format") or "YYYY-MM-DD") or "%Y-%m-%d"
        return DailyConfig(folder=folder, strftime=strf, template=cfg.get("template") or None)

    def daily_path(self, day: date | None = None) -> str:
        dc = self.daily_config()
        name = (day or date.today()).strftime(dc.strftime) + ".md"
        return f"{dc.folder}/{name}" if dc.folder else name

    def _new_daily_content(self, dc: DailyConfig, day: date) -> str:
        if dc.template:
            tp = self.root / (dc.template if dc.template.endswith(".md") else dc.template + ".md")
            try:
                t = tp.read_text(encoding="utf-8")
                return (t.replace("{{date}}", day.strftime(dc.strftime)).replace("{{title}}", day.strftime(dc.strftime))
                        .replace("{{time}}", datetime.now().strftime("%H:%M")))
            except OSError:
                pass
        # sem template: copia o frontmatter da nota diária mais recente (mantém seu padrão de tags)
        folder = self.root / dc.folder
        dailies = sorted((p for p in folder.glob("*.md") if DAILY_RE.match(p.name)), reverse=True) \
            if folder.exists() else []
        for p in dailies:
            m = FRONTMATTER_RE.match(p.read_text(encoding="utf-8", errors="replace"))
            if m:
                return m.group(0).rstrip("\r\n") + "\n\n"
        return ""

    def capture(self, text: str, when: datetime | None = None) -> str:
        """Acrescenta '- HH:MM texto' na seção Capturas da nota do dia. Retorna o caminho."""
        when = when or datetime.now()
        dc = self.daily_config()
        rel = self.daily_path(when.date())
        path = self.root / rel
        with self._lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            content = path.read_text(encoding="utf-8") if path.exists() else self._new_daily_content(dc, when.date())
            line = f"- {when:%H:%M} {text.strip()}"
            if CAPTURE_HEADING not in content:
                sep = "" if not content or content.endswith("\n\n") else ("\n" if content.endswith("\n") else "\n\n")
                content += f"{sep}{CAPTURE_HEADING}\n\n{line}\n"
            else:
                # insere no fim da seção Capturas (antes do próximo título de mesmo nível ou do fim)
                start = content.index(CAPTURE_HEADING) + len(CAPTURE_HEADING)
                nxt = re.search(r"^#{1,2} ", content[start:], flags=re.M)
                end = start + nxt.start() if nxt else len(content)
                section = content[start:end].rstrip("\n") or "\n"
                content = content[:start] + section + f"\n{line}\n" + ("\n" + content[end:] if nxt else "")
            path.write_text(content, encoding="utf-8", newline="\n")
        return rel

    # ---------- anotações do dia (aba Calendário) ----------

    @staticmethod
    def _section(content: str, heading: str) -> tuple[int, int, int] | None:
        """(início do título, início do corpo, fim) da seção `heading`, que vai até o próximo # ou ## ."""
        m = re.search(rf"^{re.escape(heading)}[ \t]*\r?$", content, flags=re.M)
        if not m:
            return None
        body = m.end()
        nxt = re.search(r"^#{1,2} ", content[body:], flags=re.M)
        return m.start(), body, body + nxt.start() if nxt else len(content)

    def day_notes(self, day: date) -> str:
        """Texto da seção Anotações da nota do dia ("" se não houver)."""
        try:
            content = self.read(self.daily_path(day))
        except (OSError, ValueError):
            return ""
        b = self._section(content, NOTES_HEADING)
        return content[b[1]:b[2]].strip("\r\n").strip() if b else ""

    def set_day_notes(self, day: date, text: str) -> str:
        """Troca só a seção Anotações da nota do dia (cria a nota se precisar). Retorna o caminho."""
        dc = self.daily_config()
        rel = self.daily_path(day)
        path = self.root / rel
        body = text.replace("\r\n", "\n").strip("\n").rstrip()
        with self._lock:
            exists = path.exists()
            if not exists and not body:
                return rel
            content = path.read_text(encoding="utf-8") if exists else self._new_daily_content(dc, day)
            b = self._section(content, NOTES_HEADING)
            if b:
                head, start, end = b
                rest = content[end:]
                if body:
                    content = content[:start] + f"\n\n{body}\n" + ("\n" + rest if rest else "")
                else:
                    content = content[:head].rstrip("\n") + ("\n\n" + rest if rest else "\n")
            elif body:
                sep = "" if not content or content.endswith("\n\n") else ("\n" if content.endswith("\n") else "\n\n")
                content += f"{sep}{NOTES_HEADING}\n\n{body}\n"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
        return rel

    def days_with_notes(self, year: int, month: int) -> list[str]:
        """Dias do mês cuja nota diária tem algum texto (fora o frontmatter)."""
        out = []
        d = date(year, month, 1)
        while d.month == month:
            p = self.root / self.daily_path(d)
            try:
                if FRONTMATTER_RE.sub("", p.read_text(encoding="utf-8", errors="replace")).strip():
                    out.append(d.isoformat())
            except OSError:
                pass
            d += timedelta(days=1)
        return out

    def captures(self, day: date | None = None) -> list[str]:
        rel = self.daily_path(day)
        try:
            content = self.read(rel)
        except (OSError, ValueError):
            return []
        if CAPTURE_HEADING not in content:
            return []
        start = content.index(CAPTURE_HEADING) + len(CAPTURE_HEADING)
        nxt = re.search(r"^#{1,2} ", content[start:], flags=re.M)
        section = content[start: start + nxt.start() if nxt else len(content)]
        return [re.sub(r"^- (\d\d:\d\d )?", "", ln).strip() for ln in section.splitlines() if ln.startswith("- ")]


_STOPWORDS = {"de", "da", "do", "das", "dos", "a", "o", "as", "os", "e", "em", "no", "na", "nos", "nas", "um",
              "uma", "que", "sobre", "para", "pra", "com", "por", "meu", "minha", "meus", "minhas"}


def detect_vaults(home: Path) -> list[str]:
    """Procura pastas com .obsidian nos lugares comuns (até 4 níveis)."""
    found = []
    for base in ("Documents", "Documentos", "Desktop", "OneDrive", "Dropbox", "Google Drive", "iCloudDrive", ""):
        root = home / base if base else home
        if not root.exists():
            continue
        depth = 0 if base == "" else 4
        stack = [(root, 0)]
        while stack:
            d, lvl = stack.pop()
            try:
                children = list(d.iterdir())
            except OSError:
                continue
            for ch in children:
                if not ch.is_dir() or ch.name in SKIP_DIRS - {".obsidian"} or ch.name == "AppData":
                    continue
                if ch.name == ".obsidian":
                    found.append(str(d))
                elif lvl < depth and not ch.name.startswith("."):
                    stack.append((ch, lvl + 1))
    return sorted(set(found))
