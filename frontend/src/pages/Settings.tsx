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
