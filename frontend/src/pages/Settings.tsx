import { useEffect, useState } from "react";
import { Card, btn, input } from "../components/ui";
import { api, type Mano } from "../lib/mano";

export function SettingsPage({ mano }: { mano: Mano }) {
  const sp = mano.spotify;
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  // volta do login do Spotify: /#/ajustes?spotify=ok|erro
  useEffect(() => {
    const q = location.hash.split("?")[1];
    if (!q) return;
    const p = new URLSearchParams(q);
    if (p.get("spotify") === "ok") setFlash("Spotify conectado!");
    if (p.get("spotify") === "erro") setFlash(`O Spotify recusou a conexão (${p.get("motivo") ?? "erro"}).`);
    if (p.get("google") === "ok") setFlash("Conta Google conectada! Agenda, e-mail e tarefas já estão no início.");
    if (p.get("google") === "erro") setFlash(`O Google recusou a conexão (${p.get("motivo") ?? "erro"}).`);
    history.replaceState(null, "", "#/ajustes");
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/api/spotify/config", { client_id: clientId });
      setClientId("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {flash && <div className="rounded-xl border border-ember/50 bg-ember-soft px-4 py-3 text-sm">{flash}</div>}

      <VaultSettings mano={mano} />
      <GoogleSettings mano={mano} />
      <LLMSettings mano={mano} />

      <Card title="Spotify">
        {sp?.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full bg-ok" /> Conta conectada
            </span>
            <button className={`${btn.danger} ml-auto`} onClick={() => api("/api/spotify/logout", {})}>
              Desconectar
            </button>
          </div>
        ) : (
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
            <li>
              Entre em{" "}
              <a className="text-accent underline-offset-2 hover:underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                developer.spotify.com/dashboard
              </a>{" "}
              com sua conta e clique em <b>Create app</b>.
            </li>
            <li>
              Preencha nome (ex.: Mano) e descrição. Em <b>Redirect URIs</b> adicione exatamente:
              <code className="mt-1 block select-all rounded-lg bg-ink px-3 py-2 text-accent">
                {sp?.redirect_uri ?? "http://127.0.0.1:8765/api/spotify/callback"}
              </code>
              Marque <b>Web API</b>, aceite os termos e salve.
            </li>
            <li>
              Abra o app criado, copie o <b>Client ID</b> e cole aqui:
              <form onSubmit={save} className="mt-2 flex flex-wrap gap-2">
                <input
                  className={`${input} min-w-0 flex-1 font-mono`}
                  placeholder={sp?.configured ? "Client ID já salvo — cole outro para trocar" : "32 caracteres"}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value.trim())}
                  aria-label="Client ID do Spotify"
                />
                <button className={btn.primary} disabled={!clientId}>
                  Salvar
                </button>
              </form>
              {error && <p className="mt-1 text-alert">{error}</p>}
              <p className="mt-1 text-xs text-muted">Não precisa do Client Secret: o Mano usa o login PKCE.</p>
            </li>
            <li>
              {sp?.configured ? (
                <a href="/api/spotify/login" className={`${btn.primary} inline-block`}>
                  Conectar minha conta
                </a>
              ) : (
                <span className="text-muted">Depois de salvar o Client ID, aparece aqui o botão para conectar.</span>
              )}
            </li>
          </ol>
        )}
        <p className="mt-4 text-xs text-muted">
          Controlar a música exige Spotify Premium. Se nenhum aparelho estiver tocando, o Mano abre o Spotify deste PC.
        </p>
      </Card>

      <Card title="Voz">
        {mano.voiceStatus?.available ? (
          <p className="text-sm">
            Ouvindo pelas frases: {mano.voiceStatus.wake_phrases.map((p) => `“${p}”`).join(", ")}. Atalho para falar sem
            ativação: <kbd className="rounded border border-line px-1.5">Ctrl</kbd>+
            <kbd className="rounded border border-line px-1.5">Espaço</kbd>.
          </p>
        ) : (
          <p className="text-sm text-muted">Voz indisponível: {mano.voiceStatus?.reason ?? "conectando…"}</p>
        )}
      </Card>
    </div>
  );
}

function GoogleSettings({ mano }: { mano: Mano }) {
  const g = mano.google;
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setSending(true);
    try {
      const config = JSON.parse(await file.text());
      await api("/api/google/client", { config });
    } catch (err) {
      setError(err instanceof SyntaxError ? "Esse arquivo não é um JSON válido." : (err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const link = (href: string, text: string) => (
    <a className="text-accent underline-offset-2 hover:underline" href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  );

  return (
    <Card title="Google (Gmail, Agenda, Tarefas)">
      {g?.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full bg-ok" /> Conectado{g.email ? ` como ${g.email}` : ""}
          </span>
          <button className={btn.ghost} onClick={() => api("/api/google/refresh", {})}>
            Atualizar agora
          </button>
          <button className={`${btn.danger} ml-auto`} onClick={() => api("/api/google/logout", {})}>
            Desconectar
          </button>
        </div>
      ) : (
        <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
          <li>
            Em {link("https://console.cloud.google.com/projectcreate", "console.cloud.google.com")}, crie um projeto
            (ex.: Mano).
          </li>
          <li>
            Ative as APIs do projeto: {link("https://console.cloud.google.com/apis/library/gmail.googleapis.com", "Gmail API")},{" "}
            {link("https://console.cloud.google.com/apis/library/calendar-json.googleapis.com", "Google Calendar API")} e{" "}
            {link("https://console.cloud.google.com/apis/library/tasks.googleapis.com", "Google Tasks API")}.
          </li>
          <li>
            Em {link("https://console.cloud.google.com/auth/branding", "Google Auth Platform")}, configure: público{" "}
            <b>Externo</b>, nome Mano e seu e-mail. Em <b>Público-alvo</b>, clique em <b>Publicar app</b> (“Em
            produção”). No modo “Teste” o Google desconecta a cada 7 dias.
          </li>
          <li>
            Em {link("https://console.cloud.google.com/auth/clients", "Clientes")}, crie um cliente OAuth do tipo{" "}
            <b>App para computador</b> e baixe o JSON.
          </li>
          <li>
            Envie o JSON aqui:
            <label className={`${btn.ghost} ml-2 inline-block cursor-pointer`}>
              {sending ? "Enviando…" : g?.configured ? "Trocar arquivo" : "Escolher arquivo"}
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            {g?.configured && <span className="ml-2 text-ok">✓ recebido</span>}
            {error && <p className="mt-1 text-alert">{error}</p>}
          </li>
          <li>
            {g?.configured ? (
              <>
                <a href="/api/google/login" className={`${btn.primary} inline-block`}>
                  Conectar minha conta Google
                </a>
                <p className="mt-2 text-xs text-muted">
                  Vai aparecer “O Google não verificou este app”: é o seu próprio app. Clique em <b>Avançado</b> →{" "}
                  <b>Acessar Mano</b> e marque as permissões.
                </p>
              </>
            ) : (
              <span className="text-muted">Depois de enviar o JSON, aparece aqui o botão para conectar.</span>
            )}
          </li>
        </ol>
      )}
      <p className="mt-4 text-xs text-muted">
        O Mano só lê seus e-mails (não envia nem apaga). Na agenda, ele lê e cria compromissos; nas tarefas, lê, cria e
        conclui. Tudo fica nesta máquina.
      </p>
    </Card>
  );
}

function VaultSettings({ mano }: { mano: Mano }) {
  const st = mano.notes;
  const [found, setFound] = useState<string[] | null>(null);
  const [path, setPath] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!st?.configured) api<string[]>("/api/notes/detect").then(setFound).catch(() => setFound([]));
  }, [st?.configured]);

  const use = async (p: string) => {
    setError("");
    try {
      await api("/api/notes/config", { vault: p });
      setPath("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card title="Segundo cérebro (Obsidian)">
      {st?.configured ? (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="size-2 rounded-full bg-ok" />
            Vault <b>{st.vault_name}</b> · {st.total} notas
          </div>
          <code className="block break-all rounded-lg bg-ink px-3 py-2 text-xs text-muted">{st.vault}</code>
          <p className="text-xs text-muted">
            Capturas vão para <b>{st.daily}</b>, numa seção “## Capturas”. O Mano só acrescenta texto, nunca apaga.
          </p>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Trocar de vault</summary>
            <form onSubmit={(e) => { e.preventDefault(); void use(path); }} className="mt-2 flex gap-2">
              <input className={`${input} min-w-0 flex-1`} placeholder="C:\caminho\do\vault" value={path} onChange={(e) => setPath(e.target.value)} />
              <button className={btn.ghost} disabled={!path.trim()}>Usar</button>
            </form>
          </details>
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {found === null && <p className="text-muted">Procurando vaults neste PC…</p>}
          {found && found.length > 0 && (
            <>
              <p>Encontrei {found.length === 1 ? "este vault" : "estes vaults"}:</p>
              <ul className="flex flex-col gap-2">
                {found.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-ink px-3 py-2 text-xs">{f}</code>
                    <button className={btn.primary} onClick={() => use(f)}>Usar</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {found && found.length === 0 && <p className="text-muted">Não achei nenhum vault automaticamente.</p>}
          <form onSubmit={(e) => { e.preventDefault(); void use(path); }} className="flex gap-2">
            <input className={`${input} min-w-0 flex-1`} placeholder="Ou cole o caminho da pasta do vault" value={path} onChange={(e) => setPath(e.target.value)} aria-label="Caminho do vault" />
            <button className={btn.ghost} disabled={!path.trim()}>Usar</button>
          </form>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-alert">{error}</p>}
    </Card>
  );
}

const gb = (n: number | null | undefined) => (n ? `${(n / 1e9).toFixed(1)} GB` : "");

function LLMSettings({ mano }: { mano: Mano }) {
  const st = mano.llm;
  const [test, setTest] = useState<{ text: string; seconds: number } | null>(null);
  const [testing, setTesting] = useState(false);
  const [pullName, setPullName] = useState("");
  const [error, setError] = useState("");

  const set = async (body: Record<string, unknown>) => {
    setError("");
    try {
      await api("/api/llm/config", body);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setError("");
    setTest(null);
    try {
      setTest(await api<{ text: string; seconds: number }>("/api/llm/test", {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const pull = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/api/llm/pull", { model: pullName.trim() });
      setPullName("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const auto = st?.models.length ? `Automático (${st.chosen ? "melhor instalado" : st.model})` : "Automático";
  const p = st?.pull;

  return (
    <Card title="Modelo local (Ollama)">
      {!st ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`size-2 rounded-full ${!st.enabled ? "bg-line" : st.reachable ? "bg-ok" : "bg-alert"}`}
            />
            {!st.enabled
              ? "Desligado: o Mano usa só as regras."
              : st.reachable
                ? st.model
                  ? <>Pronto, usando <b className="font-medium">{st.model}</b>{st.busy && <span className="text-muted"> · gerando {st.busy}…</span>}</>
                  : "O Ollama está rodando, mas não tem nenhum modelo baixado."
                : st.installed
                  ? "O Ollama está parado (o Mano tenta abrir sozinho)."
                  : <>Ollama não encontrado. Instale em <a className="text-accent hover:underline" href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com</a>.</>}
            <span className="ml-auto text-xs text-muted">{st.url}</span>
          </div>

          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[var(--color-ember)]" checked={st.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            Usar o modelo local (resumos de notícias e e-mails)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="accent-[var(--color-ember)]"
              checked={st.fallback}
              disabled={!st.enabled}
              onChange={(e) => set({ fallback: e.target.checked })}
            />
            Quando eu falar algo fora dos comandos, tentar entender pelo modelo
          </label>

          {st.models.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="llm-model" className="text-muted">
                Modelo
              </label>
              <select
                id="llm-model"
                className={input}
                value={st.chosen ?? ""}
                onChange={(e) => set({ model: e.target.value })}
              >
                <option value="">{auto}</option>
                {st.models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name} {m.params ? `· ${m.params}` : ""} {m.size ? `· ${gb(m.size)}` : ""}
                  </option>
                ))}
              </select>
              <button className={btn.ghost} onClick={runTest} disabled={testing || !st.reachable || !st.model}>
                {testing ? "Testando…" : "Testar"}
              </button>
            </div>
          )}
          {testing && <p className="text-xs text-muted">A primeira resposta demora: o modelo precisa carregar na memória.</p>}
          {test && (
            <p className="rounded-lg bg-ink/60 px-3 py-2">
              “{test.text}” <span className="text-xs text-muted">({test.seconds} s)</span>
            </p>
          )}

          {st.reachable && (
            <form onSubmit={pull} className="flex flex-wrap items-center gap-2">
              <input
                className={`${input} min-w-0 flex-1 font-mono`}
                placeholder="Baixar outro modelo (ex.: qwen3:1.7b)"
                value={pullName}
                onChange={(e) => setPullName(e.target.value)}
                aria-label="Nome do modelo para baixar"
                disabled={!!p && p.status !== "erro"}
              />
              <button className={btn.ghost} disabled={!pullName.trim() || (!!p && p.status !== "erro")}>
                Baixar
              </button>
            </form>
          )}
          {p && (
            <div>
              <div className="flex justify-between text-xs text-muted">
                <span>
                  {p.model}: {p.status === "erro" ? <span className="text-alert">{p.error}</span> : p.status}
                </span>
                {p.total > 0 && <span className="tabular-nums">{gb(p.completed)} / {gb(p.total)}</span>}
              </div>
              {p.total > 0 && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-ember" style={{ width: `${(100 * p.completed) / p.total}%` }} />
                </div>
              )}
            </div>
          )}
          {error && <p className="text-alert">{error}</p>}
          <p className="text-xs text-muted">
            Neste notebook a primeira pergunta leva cerca de 40 s (o modelo carrega na memória); as seguintes saem em poucos
            segundos. Depois de 5 min sem uso ele libera a memória. Comandos conhecidos nunca passam pelo modelo.
          </p>
        </div>
      )}
    </Card>
  );
}
