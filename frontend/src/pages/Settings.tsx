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

      <GoogleSettings mano={mano} />

      <Card title="Spotify">
        {sp?.connected ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-sm">
              <span className="size-2 rounded-full bg-emerald-400" /> Conta conectada
            </span>
            <button className={`${btn.danger} ml-auto`} onClick={() => api("/api/spotify/logout", {})}>
              Desconectar
            </button>
          </div>
        ) : (
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
            <li>
              Entre em{" "}
              <a className="text-ember underline-offset-2 hover:underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
                developer.spotify.com/dashboard
              </a>{" "}
              com sua conta e clique em <b>Create app</b>.
            </li>
            <li>
              Preencha nome (ex.: Mano) e descrição. Em <b>Redirect URIs</b> adicione exatamente:
              <code className="mt-1 block select-all rounded-lg bg-ink px-3 py-2 text-ember">
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
    <a className="text-ember underline-offset-2 hover:underline" href={href} target="_blank" rel="noreferrer">
      {text}
    </a>
  );

  return (
    <Card title="Google (Gmail, Agenda, Tarefas)">
      {g?.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full bg-emerald-400" /> Conectado{g.email ? ` como ${g.email}` : ""}
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
            {g?.configured && <span className="ml-2 text-emerald-300">✓ recebido</span>}
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
