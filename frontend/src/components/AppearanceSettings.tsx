import type { CSSProperties, ReactNode } from "react";
import {
  ACCENTS,
  PALETTES,
  resetAppearance,
  setAccent,
  setMode,
  setPalette,
  useAppearance,
  type Mode,
  type PaletteId,
  type Resolved,
} from "../lib/theme";
import { Card, Chip, Icon, Row, btn } from "./ui";

const MODES: { id: Mode; label: string }[] = [
  { id: "light", label: "Claro" },
  { id: "dark", label: "Escuro" },
  { id: "system", label: "Sistema" },
];

/** Ajustes → Aparência: claro/escuro (ou do sistema), paleta e cor de destaque. Salvos neste aparelho. */
export function AppearanceSettings() {
  const { mode, palette, accent, resolved } = useAppearance();
  const custom = accent !== null && !ACCENTS.some((a) => a.color === accent);
  const isDefault = mode === "system" && palette === "mel" && accent === null;

  return (
    <>
      <Card title="Claro ou escuro">
        <Row
          icon={mode === "system" ? "monitor" : resolved === "dark" ? "moon" : "sun"}
          title="Modo"
          sub={
            mode === "system"
              ? `Acompanha o Windows (agora ${resolved === "dark" ? "escuro" : "claro"}). Usar o botão do topo fixa o modo de novo.`
              : "O botão sol/lua do topo da tela troca entre os dois. Em Sistema, segue o claro/escuro do Windows."
          }
          below
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label="Modo claro ou escuro">
            {MODES.map((m) => (
              <Chip key={m.id} on={mode === m.id} onClick={() => setMode(m.id)}>
                {m.label}
              </Chip>
            ))}
          </div>
        </Row>
      </Card>

      <Card title="Paleta">
        <p className="mb-3 text-sm text-muted">Cada paleta tem a versão clara e a escura, como na prévia.</p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {PALETTES.map((p) => {
            const on = palette === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPalette(p.id)}
                className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border-2 text-left ${
                  on ? "border-text" : "border-line hover:border-muted"
                }`}
              >
                <span className="flex" aria-hidden>
                  <Preview palette={p.id} theme="light" />
                  <Preview palette={p.id} theme="dark" />
                </span>
                <span className="flex items-start gap-2 px-3 py-2.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="text-[12px] leading-snug text-muted">{p.sub}</span>
                  </span>
                  {on && <Icon name="check" className="mt-0.5 size-4 shrink-0 text-accent" />}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Cor de destaque">
        <p className="mb-3 text-sm text-muted">
          Muda botões, interruptores, links e o brilho do relógio. Fundos e textos continuam os da paleta.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Cor de destaque">
          <Dot on={accent === null} label="Cor da paleta" onClick={() => setAccent(null)}>
            <span data-palette={palette} data-theme={resolved} className="block size-full rounded-full bg-ember" />
          </Dot>
          {ACCENTS.map((a) => (
            <Dot key={a.color} on={accent === a.color} label={a.name} onClick={() => setAccent(a.color)} style={{ background: a.color }} />
          ))}
          <CustomColor on={custom} value={accent ?? ACCENTS[0].color} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] bg-soft p-4 text-sm" aria-label="Prévia do destaque">
          <span className={btn.primary}>Botão</span>
          <span className="flex h-7.5 w-13 justify-end rounded-full bg-ember p-[3px]" aria-hidden>
            <span className="size-6 rounded-full bg-panel shadow" />
          </span>
          <span className="font-medium text-accent">Link e destaque</span>
          <span className="text-muted">
            {accent === null ? "Cor da paleta" : custom ? accent.toUpperCase() : ACCENTS.find((a) => a.color === accent)?.name}
          </span>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span className="min-w-0 flex-1 basis-56">Fica salvo neste aparelho: cada navegador guarda a sua escolha.</span>
        <button type="button" className={btn.ghost} disabled={isDefault} onClick={resetAppearance}>
          Restaurar o padrão
        </button>
      </div>
    </>
  );
}

/** Miniatura de uma paleta: os mesmos tokens do visor, presos a um data-palette/data-theme só desta caixa. */
function Preview({ palette, theme }: { palette: PaletteId; theme: Resolved }) {
  return (
    <span data-palette={palette} data-theme={theme} className="flex min-w-0 flex-1 bg-ink p-2">
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg border border-line bg-panel p-2">
        <span className="h-1.5 w-4/5 rounded-full bg-text" />
        <span className="h-1.5 w-1/2 rounded-full bg-muted" />
        <span className="mt-0.5 flex items-center gap-1">
          <span className="h-3 w-6 rounded-full bg-ember" />
          <span className="size-3 rounded-full bg-area-2" />
          <span className="size-3 rounded-full bg-ok" />
        </span>
      </span>
    </span>
  );
}

const ring = (on: boolean) => (on ? "ring-2 ring-text ring-offset-2 ring-offset-panel" : "");

function Dot({
  on,
  label,
  onClick,
  style,
  children,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full hover:bg-soft"
    >
      {/* a amostra da cor é o dado escolhido, não um token: por isso o style */}
      <span className={`block size-8 overflow-hidden rounded-full border border-line ${ring(on)}`} style={style}>
        {children}
      </span>
    </button>
  );
}

/** Seletor de cor do sistema por trás de uma bolinha: mostra a cor própria quando ela está escolhida. */
function CustomColor({ on, value }: { on: boolean; value: string }) {
  return (
    <label className="relative grid size-11 cursor-pointer place-items-center rounded-full hover:bg-soft" title="Outra cor">
      <input
        type="color"
        value={value}
        onChange={(e) => setAccent(e.target.value)}
        aria-label="Escolher outra cor de destaque"
        className="peer absolute inset-0 size-full cursor-pointer opacity-0"
      />
      <span
        className={`grid size-8 place-items-center rounded-full border border-dashed border-muted text-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent ${ring(on)} ${on ? "border-solid" : ""}`}
        style={on ? { background: value } : undefined}
        aria-hidden
      >
        {!on && <Icon name="plus" className="size-4" />}
      </span>
    </label>
  );
}
