import { useEffect } from "react";
import { api, type Mano } from "../lib/mano";

const fmtDur = (s?: number | null) =>
  s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "";

/** Player do YouTube por cima do visor + grade de resultados de busca. Esc fecha. */
export function VideoOverlay({ mano }: { mano: Mano }) {
  const { video, videoResults, setVideo, setVideoResults } = mano;
  const open = !!video || !!videoResults;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setVideo(null);
        setVideoResults(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setVideo, setVideoResults]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex max-h-full w-full max-w-5xl flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 truncate text-lg">
            {video ? video.title : `Vídeos: ${videoResults!.q}`}
          </h2>
          {video && (
            <a
              href={`https://www.youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-ember/50"
            >
              Abrir no YouTube
            </a>
          )}
          <button
            onClick={() => {
              setVideo(null);
              setVideoResults(null);
            }}
            className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-ember/50"
            aria-label="Fechar"
          >
            Fechar (Esc)
          </button>
        </div>

        {video ? (
          <div className="relative w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              key={video.id}
              className="absolute inset-0 size-full"
              src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
              title={video.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : (
          <ul className="grid gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {videoResults!.results.map((v) => (
              <li key={v.id}>
                <button
                  onClick={() => api("/api/youtube/play", { id: v.id, title: v.title })}
                  className="flex w-full flex-col gap-2 rounded-xl border border-line bg-panel p-2 text-left hover:border-ember/50"
                >
                  <div className="relative w-full overflow-hidden rounded-lg bg-line" style={{ aspectRatio: "16 / 9" }}>
                    {v.thumb && <img src={v.thumb} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />}
                    {v.duration ? (
                      <span className="absolute bottom-1 right-1 rounded bg-ink/80 px-1.5 text-xs tabular-nums">{fmtDur(v.duration)}</span>
                    ) : null}
                  </div>
                  <div className="line-clamp-2 text-sm">{v.title}</div>
                  {v.channel && <div className="truncate text-xs text-muted">{v.channel}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
