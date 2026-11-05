import { api, useNow, type Mano } from "../lib/mano";
import { Card } from "./ui";

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function NowPlaying({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const now = useNow(1000);
  const sp = mano.spotify;
  if (!sp) return null;

  if (!sp.configured || !sp.connected) {
    return (
      <Card title="Música">
        <p className="text-sm text-muted">
          {sp.configured ? "Spotify configurado, falta conectar sua conta." : "Spotify ainda não configurado."}{" "}
          <button className="text-accent underline-offset-2 hover:underline" onClick={() => go("ajustes")}>
            Ir para Ajustes
          </button>
        </p>
      </Card>
    );
  }

  const n = sp.now;
  const ctl = (a: string) => api(`/api/spotify/control/${a}`, {});
  const progress = n ? Math.min(n.duration_ms, n.progress_ms + (n.is_playing ? now - n.at : 0)) : 0;

  return (
    <Card title="Tocando agora">
      {!n ? (
        <p className="text-sm text-muted">Nada tocando. Diga "fala Mano, toca…".</p>
      ) : (
        <div className="flex items-center gap-3">
          {n.image ? (
            <img src={n.image} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="size-16 shrink-0 rounded-lg bg-line" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{n.title}</div>
            <div className="truncate text-sm text-muted">{n.artist}</div>
            <div className="mt-2 flex items-center gap-2 text-xs tabular-nums text-muted">
              <span>{fmt(progress)}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-ember" style={{ width: `${n.duration_ms ? (progress / n.duration_ms) * 100 : 0}%` }} />
              </div>
              <span>{fmt(n.duration_ms)}</span>
            </div>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-center gap-2">
        <CtlButton label="Anterior" onClick={() => ctl("previous")} d="M6 5v14M19 5 9 12l10 7V5Z" />
        {n?.is_playing ? (
          <CtlButton label="Pausar" big onClick={() => ctl("pause")} d="M8 5v14M16 5v14" />
        ) : (
          <CtlButton label="Tocar" big onClick={() => ctl("play")} d="M7 4.5v15L19 12 7 4.5Z" />
        )}
        <CtlButton label="Próxima" onClick={() => ctl("next")} d="M18 5v14M5 5l10 7-10 7V5Z" />
      </div>
      {n?.device && <div className="mt-2 text-center text-xs text-muted">em {n.device}</div>}
    </Card>
  );
}

function CtlButton({ label, d, onClick, big }: { label: string; d: string; onClick: () => void; big?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid place-items-center rounded-full ${big ? "size-11 bg-ember text-on-ember" : "size-9 text-muted hover:text-text"}`}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill={big ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d={d} />
      </svg>
    </button>
  );
}
