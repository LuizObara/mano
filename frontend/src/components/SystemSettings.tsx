import { useEffect, useState, type ReactNode } from "react";
import { api, type SystemStatus } from "../lib/mano";
import { Card, Icon, Switch, btn } from "./ui";

/** Ajustes → Inicialização: iniciar com o Windows, atalho na Área de Trabalho e fechar o Mano. */
export function SystemSettings() {
  const [st, setSt] = useState<SystemStatus | null>(null);
  const [busy, setBusy] = useState<"" | "autostart" | "shortcut" | "exit">("");
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    api<SystemStatus>("/api/system").then(setSt).catch((e) => setError((e as Error).message));
  }, []);

  const run = async (what: typeof busy, path: string, body: unknown = {}) => {
    setBusy(what);
    setError("");
    try {
      setSt(await api<SystemStatus>(path, body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const exit = async () => {
    if (!confirm("Fechar o Mano? Voz, alarmes e lembretes param até você abrir de novo.")) return;
    setBusy("exit");
    setError("");
    try {
      await api("/api/system/shutdown", {});
      setClosed(true);
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  };

  if (closed) {
    return (
      <Card title="Inicialização">
        <p className="text-sm">
          O Mano foi fechado. Pode fechar esta janela; para abrir de novo, use o atalho <b>Mano</b> na Área de Trabalho.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Inicialização">
      {!st ? (
        <p className="text-sm text-muted">{error || "Carregando…"}</p>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          {!st.supported && (
            <p className="rounded-xl bg-notice px-4 py-3">
              Iniciar com o Windows e o atalho só funcionam com o Mano rodando no Windows.
            </p>
          )}

          {st.supported && (
            <Row icon="power" title="Iniciar com o Windows" sub={autostartText(st)}>
              <Switch
                on={st.autostart}
                disabled={busy === "autostart"}
                set={(v) => run("autostart", "/api/system/autostart", { enabled: v })}
                label="Iniciar o Mano junto com o Windows"
              />
            </Row>
          )}
          {st.supported && st.outdated && (
            <div className="flex flex-wrap items-center gap-3 px-1">
              <span className="min-w-0 flex-1 text-[13px] text-muted">
                O item de inicialização aponta para outra pasta do Mano (o projeto mudou de lugar?).
              </span>
              <button
                className={btn.ghost}
                disabled={busy === "autostart"}
                onClick={() => run("autostart", "/api/system/autostart", { enabled: true })}
              >
                Corrigir
              </button>
            </div>
          )}

          {st.supported && (
            <Row
              icon="monitor"
              title="Atalho na Área de Trabalho"
              sub={
                st.shortcut
                  ? "Pronto. Dois cliques abrem o visor; se o Mano estiver fechado, ele sobe antes, sem janela de terminal."
                  : "Cria o atalho Mano: dois cliques abrem o visor e sobem o Mano se ele estiver fechado."
              }
            >
              <button className={`${btn.ghost} shrink-0`} disabled={busy === "shortcut"} onClick={() => run("shortcut", "/api/system/shortcut")}>
                {busy === "shortcut" ? "Criando…" : st.shortcut ? "Recriar" : "Criar atalho"}
              </button>
            </Row>
          )}

          <Row icon="x" title="Fechar o Mano" sub="Encerra o Mano neste PC: sem voz, alarmes nem lembretes até abrir de novo.">
            <button
              className={`${btn.danger} shrink-0`}
              disabled={!st.can_exit || busy === "exit"}
              title={st.can_exit ? undefined : "Este Mano foi aberto de outro jeito; feche pelo terminal."}
              onClick={exit}
            >
              {busy === "exit" ? "Fechando…" : "Fechar"}
            </button>
          </Row>

          {error && <p className="text-alert">{error}</p>}
        </div>
      )}
    </Card>
  );
}

function autostartText(st: SystemStatus) {
  if (st.blocked) return "Desativado no Gerenciador de Tarefas. Ligue aqui para reativar.";
  if (st.autostart) return "Liga sozinho quando você entra no Windows, em segundo plano e sem abrir janela. O visor abre pelo atalho.";
  return "Desligado: o Mano só sobe quando você abrir pelo atalho.";
}

function Row({ icon, title, sub, children }: { icon: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section className="flex items-center gap-3 rounded-[20px] bg-soft p-4">
      <Icon name={icon} className="size-5 shrink-0 text-muted" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-[13px] text-muted">{sub}</span>
      </div>
      {children}
    </section>
  );
}
