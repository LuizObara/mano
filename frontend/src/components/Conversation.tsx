import { useLayoutEffect, useRef, useState } from "react";
import { hhmm, type Mano, type Reply } from "../lib/mano";
import { CommandBar } from "./CommandBar";
import { Icon } from "./ui";
import { VoiceOrb } from "./VoiceOrb";

/**
 * Bloco da conversa no Início. Resposta curta: orbe grande e a frase no centro, como sempre.
 * Resposta longa (várias linhas, cartão da Wikipedia, notas): o orbe encolhe para uma linha no topo,
 * a pergunta vira um balão e a resposta fica numa folha com rolagem própria — a barra de comando
 * não é mais empurrada para baixo.
 */
export function Conversation({
  mano,
  go,
  voiceOk,
  muted,
  speak,
}: {
  mano: Mano;
  go: (p: string) => void;
  voiceOk: boolean;
  muted: boolean;
  speak: boolean;
}) {
  const r = mano.lastReply;
  const active =
    mano.voice === "listening" || (mano.voice === "thinking" && !!mano.partial) || (mano.busy && mano.llm?.busy === "comando");
  const long = !!r && !active && isLong(r);

  return (
    <section
      aria-label="Conversa com o Mano"
      className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 rounded-[30px] border border-line bg-panel px-4 py-5 sm:px-9 sm:py-8"
    >
      {long && r ? (
        <Thread r={r} mano={mano} go={go} muted={muted} speak={speak} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <VoiceOrb state={mano.voice} muted={muted} />
          <ShortReply mano={mano} voiceOk={voiceOk && !muted} active={active} />
        </div>
      )}
      <div className="flex justify-center">
        <CommandBar
          onSend={(t) => mano.send(t, speak)}
          busy={mano.busy}
          voice={{
            available: voiceOk,
            muted,
            reason: mano.voiceStatus?.reason ?? "conectando",
            listening: mano.voice === "listening",
            onListen: mano.listen,
          }}
        />
      </div>
    </section>
  );
}

function isLong(r: Reply) {
  return r.display.includes("\n") || !!r.data?.card || (r.data?.notes?.length ?? 0) > 0;
}

type Line =
  | { kind: "examples"; label: string; items: string[] }
  | { kind: "pair"; label: string; value: string }
  | { kind: "text"; value: string };

/** "Rótulo: a; b; c" vira um grupo de exemplos; "Rótulo: valor" vira uma linha rótulo/valor. */
export function parseLines(display: string): Line[] {
  return display
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l): Line => {
      const i = l.indexOf(": ");
      if (i > 0 && i <= 40) {
        const label = l.slice(0, i);
        const rest = l.slice(i + 2);
        const items = rest.split(/;\s+/).map((x) => x.trim()).filter(Boolean);
        return items.length > 1 ? { kind: "examples", label, items } : { kind: "pair", label, value: rest };
      }
      return { kind: "text", value: l };
    });
}

function ShortReply({ mano, voiceOk, active }: { mano: Mano; voiceOk: boolean; active: boolean }) {
  const r = mano.lastReply;
  if (active) {
    const thinkingLlm = mano.busy && mano.llm?.busy === "comando" && !mano.partial;
    return (
      <p className="max-w-2xl text-center font-display text-3xl italic text-muted">
        {thinkingLlm ? "Pensando com o modelo local…" : mano.partial ? `${mano.partial}…` : "Pode falar…"}
      </p>
    );
  }
  if (!r) {
    return (
      <p className="max-w-2xl text-center font-display text-3xl text-muted">
        {voiceOk ? "Diga “fala Mano” ou digite abaixo." : "Oi! Digite um comando abaixo."}
      </p>
    );
  }
  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-2 text-center">
      <p className="text-[15px] text-muted">“{r.log.text}”</p>
      <UnderstoodAs r={r} />
      <p className="font-display text-[clamp(24px,3vw,34px)] leading-tight">{r.display}</p>
      {r.data?.link && <LinkButton link={r.data.link} />}
    </div>
  );
}

function Thread({ r, mano, go, muted, speak }: { r: Reply; mano: Mano; go: (p: string) => void; muted: boolean; speak: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [seen, setSeen] = useState(r.log.id);
  const sheet = useRef<HTMLDivElement>(null);
  if (seen !== r.log.id) {
    setSeen(r.log.id);
    setExpanded(false);
  }

  useLayoutEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [r, expanded]);
  useLayoutEffect(() => {
    sheet.current?.scrollTo({ top: 0 });
  }, [r.log.id]);

  const help = !!r.data?.catalog;
  const card = r.data?.card;
  const notes = r.data?.notes ?? [];
  const lines = card ? [] : parseLines(r.display);
  const allExamples = lines.length > 0 && lines.every((l) => l.kind === "examples");
  const exampleCount = lines.reduce((n, l) => n + (l.kind === "examples" ? l.items.length : 0), 0);

  // frase de abertura: o que o Mano falou, quando é diferente do que já aparece na folha
  const said = r.speech?.trim() ?? "";
  const lead = help
    ? "Sei fazer bastante coisa. Toque num exemplo para usar."
    : card
      ? null
      : !r.display.includes("\n") && notes.length
        ? r.display
        : said && said.length <= 160 && !r.display.includes(said)
          ? said
          : null;
  const foot = help
    ? `${lines.length} assuntos · ${exampleCount} exemplos`
    : lines.length > 1
      ? `${lines.length} itens`
      : notes.length > 1
        ? `${notes.length} notas`
        : "";

  // "adia (quando o alerta de remédio está tocando)": a explicação entre parênteses não vai no comando
  const use = (t: string) => mano.send(t.replace(/\s*\(.*\)\s*$/, ""), speak);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <VoiceOrb state={mano.voice} muted={muted} compact />
        </div>
        <button
          type="button"
          onClick={mano.clearReply}
          className="flex min-h-10 items-center gap-1.5 rounded-full pl-2.5 pr-3.5 text-sm text-muted hover:bg-soft hover:text-text"
        >
          <Icon name="x" className="size-4" />
          Limpar resposta
        </button>
      </div>

      <div className="flex max-w-[78%] flex-col items-end gap-1 self-end">
        <div className="rounded-[20px_20px_6px_20px] bg-soft px-4 py-2.5 leading-snug">{r.log.text}</div>
        <span className="text-xs text-muted">
          você · {hhmm(r.log.at)} · {r.log.source === "voice" ? "por voz" : "digitado"}
        </span>
        <UnderstoodAs r={r} />
      </div>

      <div className="flex min-h-0 flex-col gap-2.5">
        {lead && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-xl italic text-accent">mano.</span>
            <p className="min-w-0 flex-[1_1_260px] font-display text-[22px] leading-snug">{lead}</p>
          </div>
        )}

        <div
          ref={sheet}
          tabIndex={overflows ? 0 : undefined}
          aria-label="Resposta do Mano"
          className={`overflow-y-auto rounded-[22px] bg-ink p-4 [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin] ${
            expanded ? "" : "max-h-[min(340px,48vh)]"
          }`}
        >
          {card && <WikiCard card={card} />}

          {allExamples ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-x-5.5 gap-y-4.5">
              {lines.map(
                (l) =>
                  l.kind === "examples" && (
                    <div key={l.label} className="flex min-w-0 flex-col gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.08em] text-accent">{l.label}</span>
                      <Examples items={l.items} onUse={help ? use : undefined} />
                    </div>
                  ),
              )}
            </div>
          ) : (
            lines.length > 0 && (
              <ul className="flex flex-col">
                {lines.map((l, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 border-b border-line px-1 py-3 leading-snug last:border-b-0"
                  >
                    {l.kind === "text" ? (
                      <span>{l.value}</span>
                    ) : (
                      <>
                        <strong className="shrink-0 font-semibold sm:w-36">{l.label}</strong>
                        {l.kind === "pair" ? (
                          <span className="min-w-0 flex-[1_1_220px] text-muted">{l.value}</span>
                        ) : (
                          <div className="min-w-0 flex-[1_1_220px]">
                            <Examples items={l.items} onUse={help ? use : undefined} />
                          </div>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}

          {notes.length > 0 && (
            <ul className={`flex flex-col gap-1.5 ${lines.length || card ? "mt-3" : ""}`}>
              {notes.slice(0, 8).map((n) => (
                <li key={n.path}>
                  <button
                    onClick={() => go(`notas?n=${encodeURIComponent(n.path)}`)}
                    className="flex w-full items-baseline gap-2 rounded-xl bg-panel px-3.5 py-2.5 text-left hover:bg-soft"
                  >
                    <span className="min-w-0 truncate font-medium">{n.title}</span>
                    <span className="shrink-0 text-xs text-muted">{n.folder}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(foot || overflows || expanded || r.data?.link) && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[13px] text-muted">
            <span>{foot}</span>
            <div className="flex flex-wrap items-center gap-2">
              {r.data?.link && <LinkButton link={r.data.link} />}
              {(overflows || expanded) && (
                <button
                  type="button"
                  onClick={() => setExpanded(!expanded)}
                  aria-expanded={expanded}
                  className="min-h-9 rounded-full px-3 text-sm font-semibold text-accent hover:bg-soft"
                >
                  {expanded ? "Recolher" : "Mostrar tudo"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Examples({ items, onUse }: { items: string[]; onUse?: (t: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) =>
        onUse ? (
          <button
            key={t}
            type="button"
            onClick={() => onUse(t)}
            title="Usar este comando"
            className="min-h-[34px] rounded-full border border-line bg-panel px-3 py-1.5 text-left text-sm leading-tight hover:border-ember hover:bg-ember-soft"
          >
            {t}
          </button>
        ) : (
          <span key={t} className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm leading-tight">
            {t}
          </span>
        ),
      )}
    </div>
  );
}

function UnderstoodAs({ r }: { r: Reply }) {
  if (!r.data?.understood_as) return null;
  return (
    <p className="text-xs text-accent" title="As regras não entenderam; o modelo local reescreveu o pedido">
      entendi como “{r.data.understood_as}”
    </p>
  );
}

function LinkButton({ link }: { link: { label: string; url: string } }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-9 items-center rounded-full border border-line px-4 text-sm text-muted hover:bg-soft hover:text-text"
    >
      {link.label} ↗
    </a>
  );
}

function WikiCard({ card }: { card: { title: string; extract: string; url?: string; image?: string | null } }) {
  return (
    <div className="flex gap-4 rounded-2xl bg-panel p-4 text-left">
      {card.image && <img src={card.image} alt="" className="h-28 w-24 shrink-0 rounded-lg object-cover" />}
      <div className="min-w-0">
        <div className="font-display text-xl font-medium">{card.title}</div>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-text/85">{card.extract}</p>
        {card.url && (
          <a href={card.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent hover:underline">
            Wikipedia ↗
          </a>
        )}
      </div>
    </div>
  );
}
