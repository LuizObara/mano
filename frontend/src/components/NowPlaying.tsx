import { useLayoutEffect, useState } from "react";
import { api, useNow, type Mano, type NowPlaying as Now } from "../lib/mano";
import { Card } from "./ui";

/**
 * Painel de música. Muda de modelo pelo tamanho do próprio cartão (não da tela), então funciona igual em
 * qualquer lugar da grade do Início:
 *
 * - mini   (baixo, < 190 px): faixa com capa pequena, música e pausar; título do painel menor
 * - padrao (o de sempre): capa de 72–96 px, música, artista · álbum, progresso e controles
 * - largo  (≥ 540 px de largura): a capa ocupa a altura toda, título maior, aparelho e volume
 * - alto   (≥ 470 px de altura, estreito): tocador vertical, capa grande em cima
 * - palco  (≥ 600 × 360 px): capa grande ao lado, título grande, controles e volume
 */

type Variant = "mini" | "padrao" | "largo" | "alto" | "palco";

const EXAMPLES = ["toca Djavan", "toca lo-fi", "toca a playlist de foco"];

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function pick(w: number, h: number): Variant {
  if (!w || !h) return "padrao";
  if (h < 190) return "mini";
  if (w >= 600 && h >= 360) return "palco";
  if (h >= 470) return "alto";
  if (w >= 540) return "largo";
  return "padrao";
}

/** Mede o cartão (para escolher o modelo) e a área de conteúdo (para o tamanho da capa). */
function useSizes() {
  // ref por estado: se o conteúdo do cartão é trocado (ex.: conectou o Spotify), volta a medir o elemento novo
  const [el, root] = useState<HTMLDivElement | null>(null);
  const [s, setS] = useState({ cw: 0, ch: 0, w: 0, h: 0 });
  useLayoutEffect(() => {
    const card = el?.closest("section");
    if (!el || !card) return;
    const run = () =>
      setS((p) => {
        const n = { cw: card.clientWidth, ch: card.clientHeight, w: el.clientWidth, h: el.clientHeight };
        return n.cw === p.cw && n.ch === p.ch && n.w === p.w && n.h === p.h ? p : n;
      });
    run();
    const ro = new ResizeObserver(run);
    ro.observe(card);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return { root, ...s };
}

export function NowPlaying({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const now = useNow(1000);
  const { root, cw, ch, w, h } = useSizes();
  const sp = mano.spotify;
  if (!sp) return null;
  const v = pick(cw, ch);

  if (!sp.configured || !sp.connected) {
    return (
      <Card title="Música" dense={v === "mini"}>
        <div ref={root} className="flex min-h-0 flex-1 flex-col">
          <p className="text-sm text-muted">
            {sp.configured ? "Spotify configurado, falta conectar sua conta." : "Spotify ainda não configurado."}{" "}
            <button className="text-accent underline-offset-2 hover:underline" onClick={() => go("ajustes")}>
              Ir para Ajustes
            </button>
          </p>
        </div>
      </Card>
    );
  }

  const n = sp.now;
  const ctl = (a: string) => api(`/api/spotify/control/${a}`, {}).catch(() => {});
  const progress = n ? Math.min(n.duration_ms, n.progress_ms + (n.is_playing ? now - n.at : 0)) : 0;

  return (
    <Card title={n ? "Tocando agora" : "Música"} dense={v === "mini"}>
      {/* sem `relative` aqui: o brilho de fundo (Ambient) se prende ao cartão inteiro, não só à área de conteúdo */}
      <div ref={root} className="flex min-h-0 flex-1 flex-col">
        {n ? (
          <Playing v={v} n={n} w={w} h={h} progress={progress} ctl={ctl} />
        ) : (
          <Idle v={v} w={w} ctl={ctl} send={(t) => mano.send(t, false)} />
        )}
      </div>
    </Card>
  );
}

function Playing({ v, n, w, h, progress, ctl }: { v: Variant; n: Now; w: number; h: number; progress: number; ctl: (a: string) => void }) {
  const pct = n.duration_ms ? (progress / n.duration_ms) * 100 : 0;
  const big = n.image_large ?? n.image;
  const sub = [n.artist, n.album].filter(Boolean).join(" · ");
  const setVolume = (value: number) => api("/api/spotify/volume", { value: clamp(Math.round(value), 0, 100) }).catch(() => {});
  const playPause = n.is_playing ? (
    <Ctl label="Pausar" onClick={() => ctl("pause")} big size={sizeOf(v)} d="M8 5v14M16 5v14" />
  ) : (
    <Ctl label="Tocar" onClick={() => ctl("play")} big size={sizeOf(v)} d="M7 4.5v15L19 12 7 4.5Z" fill />
  );
  const prev = <Ctl label="Anterior" onClick={() => ctl("previous")} size={sideOf(v)} d="M6 5v14M19 5 9 12l10 7V5Z" />;
  const next = <Ctl label="Próxima" onClick={() => ctl("next")} size={sideOf(v)} d="M18 5v14M5 5l10 7-10 7V5Z" />;
  const bar = (thick: string) => (
    <div className={`${thick} flex-1 overflow-hidden rounded-full bg-line`}>
      <div className="h-full rounded-full bg-ember" style={{ width: `${pct}%` }} />
    </div>
  );
  const times = (cls = "text-xs") => (
    <div className={`flex items-center gap-2.5 tabular-nums text-muted ${cls}`}>
      <span>{fmt(progress)}</span>
      {bar(v === "palco" ? "h-1.5" : v === "padrao" ? "h-1" : "h-[5px]")}
      <span>{fmt(n.duration_ms)}</span>
    </div>
  );

  if (v === "mini") {
    return (
      <div className="flex flex-1 flex-col justify-center gap-2">
        <div className="flex items-center gap-3">
          <Cover src={n.image} size={52} radius="rounded-[10px]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14.5px] font-semibold">{n.title}</div>
            <div className="truncate text-[13px] text-muted">{n.artist}</div>
          </div>
          {playPause}
        </div>
        <div className="flex">{bar("h-[3px]")}</div>
      </div>
    );
  }

  if (v === "padrao") {
    const cover = h >= 180 ? 96 : 72;
    return (
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex gap-4">
          <Cover src={n.image} size={cover} radius="rounded-[14px]" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="line-clamp-2 text-[17px] font-semibold leading-tight">{n.title}</div>
            <div className="mt-0.5 truncate text-sm text-muted">{sub}</div>
            <div className="mt-auto pt-2">{times()}</div>
          </div>
        </div>
        <div className="mt-auto flex items-center gap-1.5">
          <Device n={n} className="flex-1" />
          {prev}
          {playPause}
          {next}
        </div>
      </div>
    );
  }

  if (v === "largo") {
    const cover = clamp(h, 120, 260);
    return (
      <div className="flex flex-1 gap-5.5">
        <Cover src={cover > 150 ? big : n.image} size={cover} radius="rounded-2xl" shadow />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={`truncate font-display font-medium leading-tight ${w >= 760 ? "text-[28px]" : "text-2xl"}`}>{n.title}</div>
          <div className="mt-1 truncate text-[15px] text-text/85">
            {n.artist}
            {n.album && <span className="text-muted"> · {n.album}</span>}
          </div>
          <div className="mt-auto">{times("text-[12.5px]")}</div>
          <div className="mt-2.5 flex items-center gap-1.5">
            {prev}
            {playPause}
            {next}
            <span className="ml-auto flex min-w-0 items-center gap-1.5 rounded-full bg-soft py-1 pl-2.5 pr-3 text-[12.5px] text-muted">
              <DeviceIcon />
              <span className="truncate">
                {n.device}
                {n.volume !== null && ` · ${n.volume}%`}
              </span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (v === "alto") {
    const cover = clamp(Math.min(w, h - 230), 140, 420);
    return (
      <div className="flex flex-1 flex-col items-center gap-3.5">
        <Ambient src={big} />
        <Cover src={big} size={cover} radius="rounded-[20px]" shadow />
        <div className="mt-1.5 flex w-full min-w-0 flex-col items-center gap-1 text-center">
          <div className="max-w-full truncate font-display text-[26px] font-medium leading-tight">{n.title}</div>
          <div className="max-w-full truncate text-[15.5px] text-text/85">
            {n.artist}
            {n.album && <span className="text-muted"> · {n.album}</span>}
          </div>
        </div>
        <div className="w-full">{times("text-[12.5px]")}</div>
        <div className="flex items-center justify-center gap-3.5">
          {prev}
          {playPause}
          {next}
        </div>
        <Device n={n} withVolume className="mt-auto justify-center" />
      </div>
    );
  }

  // palco
  const cover = clamp(Math.min(h, w * 0.42), 200, 440);
  return (
    <div className="flex flex-1 gap-8">
      <Ambient src={big} />
      <Cover src={big} size={cover} radius="rounded-[18px]" shadow />
      <div className="flex min-w-0 flex-1 flex-col py-1.5 pr-1">
        <Device n={n} prefix="no " />
        <div className={`mt-3.5 line-clamp-2 font-display font-medium leading-[1.08] tracking-[-0.01em] ${w >= 900 ? "text-[40px]" : "text-[34px]"}`}>
          {n.title}
        </div>
        <div className="mt-2 truncate text-[19px] font-medium text-text/85">{n.artist}</div>
        {n.album && <div className="mt-0.5 truncate text-[15px] text-muted">{n.album}</div>}
        <div className="mt-auto pt-4">{times("text-[13px]")}</div>
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          {prev}
          {playPause}
          {next}
          {n.volume !== null && (
            <div className="ml-auto flex items-center gap-1" role="group" aria-label={`Volume ${n.volume}%`}>
              <IconBtn label="Diminuir volume" onClick={() => setVolume((n.volume ?? 50) - 10)} d="M11 5L6 9H2v6h4l5 4V5z" />
              <div aria-hidden className="h-1 w-24 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-text/80" style={{ width: `${n.volume}%` }} />
              </div>
              <IconBtn
                label="Aumentar volume"
                onClick={() => setVolume((n.volume ?? 50) + 10)}
                d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"
              />
              <span className="w-10 text-right text-[13px] tabular-nums text-muted">{n.volume}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Nada tocando: um convite em vez do painel vazio. "Continuar" retoma a última música; os exemplos mandam o comando. */
function Idle({ v, w, ctl, send }: { v: Variant; w: number; ctl: (a: string) => void; send: (t: string) => void }) {
  const resume = (label: string, cls: string) => (
    <button
      type="button"
      onClick={() => ctl("play")}
      className={`inline-flex items-center gap-2 rounded-full bg-ember font-semibold text-on-ember hover:brightness-105 ${cls}`}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor" aria-hidden>
        <path d="M7 4.5v15L19 12 7 4.5Z" />
      </svg>
      {label}
    </button>
  );
  const chips = (count: number, cls: string) =>
    EXAMPLES.slice(0, count).map((t) => (
      <button key={t} type="button" onClick={() => send(t)} className={`rounded-full border border-line text-text/85 hover:bg-soft ${cls}`}>
        {t}
      </button>
    ));

  if (v === "mini") {
    return (
      <div className="flex flex-1 items-center gap-3">
        <span className="min-w-0 flex-1 text-sm text-muted">Nada tocando.</span>
        {resume("Continuar", "min-h-10 px-3.5 text-sm")}
      </div>
    );
  }
  if (v === "palco") {
    return (
      <div className="flex flex-1 gap-8">
        <Placeholder size={clamp(w * 0.42, 200, 360)} big />
        <div className="flex min-w-0 flex-1 flex-col py-1.5">
          <div className="font-display text-[34px] font-medium leading-tight">Nada tocando agora</div>
          <p className="mt-2.5 max-w-[42ch] text-base leading-normal text-muted">
            Diga “fala Mano, toca…” e o nome de um artista, música, álbum ou playlist. Ou toque num exemplo:
          </p>
          <div className="mt-4 flex flex-wrap gap-2">{chips(3, "min-h-10 px-3.5 text-sm")}</div>
          <div className="mt-auto flex flex-wrap items-center gap-3.5 pt-4">
            {resume("Continuar de onde parou", "min-h-14 pl-4 pr-5.5 text-base")}
            <span className="text-[13px] text-muted">retoma a última música no Spotify</span>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex flex-1 flex-col gap-3 ${v === "alto" ? "items-center text-center" : ""}`}>
      <div className={`flex gap-4 ${v === "alto" ? "flex-col items-center" : "items-center"}`}>
        <Placeholder size={v === "alto" ? 160 : 96} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[17px] font-semibold">Nada tocando</span>
          <span className="text-[13.5px] leading-snug text-muted">Diga “fala Mano, toca…” ou continue de onde parou.</span>
        </div>
      </div>
      <div className={`mt-auto flex flex-wrap items-center gap-2 ${v === "alto" ? "justify-center" : ""}`}>
        {resume("Continuar", "min-h-11 pl-3 pr-4 text-sm")}
        {/* só os exemplos que cabem numa linha: no celular o padrão fica com um */}
        {chips(w >= 460 ? 3 : w >= 330 ? 2 : 1, "min-h-9 px-3 text-[13px]")}
      </div>
    </div>
  );
}

const sizeOf = (v: Variant) => ({ mini: 44, padrao: 48, largo: 52, alto: 60, palco: 64 })[v];
const sideOf = (v: Variant) => ({ mini: 40, padrao: 44, largo: 44, alto: 48, palco: 48 })[v];

function Cover({ src, size, radius, shadow }: { src: string | null | undefined; size: number; radius: string; shadow?: boolean }) {
  const cls = `shrink-0 ${radius} ${shadow ? "shadow-[0_24px_50px_-24px_rgb(0_0_0/0.75)]" : ""}`;
  return src ? (
    <img src={src} alt="" className={`${cls} bg-line object-cover`} style={{ width: size, height: size }} />
  ) : (
    <div className={`${cls} bg-line`} style={{ width: size, height: size }} />
  );
}

/** Brilho bem leve com as cores da capa ao fundo do cartão (nos tamanhos grandes). */
function Ambient({ src }: { src: string | null | undefined }) {
  if (!src) return null;
  // a moldura recorta o brilho: nada passa da área do painel nem cria barra de rolagem
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <img src={src} alt="" className="absolute -left-16 -top-24 size-[520px] max-w-none object-cover opacity-[0.14] blur-[60px]" />
    </div>
  );
}

function Placeholder({ size, big }: { size: number; big?: boolean }) {
  return (
    <div
      aria-hidden
      className={`grid shrink-0 place-items-center border-[1.5px] border-dashed border-muted/40 text-muted/60 ${big ? "rounded-[18px]" : "rounded-[14px]"}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={big ? 1.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: size * 0.3, height: size * 0.3 }}>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  );
}

const DeviceIcon = () => (
  <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

function Device({ n, withVolume, prefix = "", className = "" }: { n: Now; withVolume?: boolean; prefix?: string; className?: string }) {
  if (!n.device) return <span className={className} />;
  return (
    <span className={`flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted ${className}`}>
      <DeviceIcon />
      <span className="truncate">
        {prefix}
        {n.device}
        {withVolume && n.volume !== null && ` · volume ${n.volume}%`}
      </span>
    </span>
  );
}

function Ctl({ label, d, onClick, big, size, fill }: { label: string; d: string; onClick: () => void; big?: boolean; size: number; fill?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid shrink-0 place-items-center rounded-full ${big ? "bg-ember text-on-ember hover:brightness-105" : "text-muted hover:bg-soft hover:text-text"}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill={fill ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={big && !fill ? 2.4 : 2}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ width: Math.round(size * 0.42), height: Math.round(size * 0.42) }}
      >
        <path d={d} />
      </svg>
    </button>
  );
}

function IconBtn({ label, d, onClick }: { label: string; d: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="grid size-10 place-items-center rounded-xl text-muted hover:bg-soft hover:text-text">
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={d} />
      </svg>
    </button>
  );
}
