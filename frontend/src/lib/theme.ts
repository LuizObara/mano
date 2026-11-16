import { useSyncExternalStore } from "react";

/**
 * Aparência do visor: claro/escuro (ou seguir o sistema), paleta e cor de destaque. Vale para este aparelho
 * (localStorage) e mora num só lugar para o botão do topo e Ajustes → Aparência andarem juntos.
 * O index.html aplica o que está salvo antes de o React carregar, para não piscar; mudou uma chave aqui,
 * mude lá também.
 */

export type Mode = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

/** Ids iguais aos de `[data-palette]` no index.css. */
export const PALETTES = [
  { id: "mel", name: "Mel & Café", sub: "Mel e caramelo sobre creme" },
  { id: "salvia", name: "Sálvia & Linho", sub: "Verde de erva sobre linho" },
  { id: "mare", name: "Maré & Areia", sub: "Azul-petróleo sobre areia" },
  { id: "ameixa", name: "Ameixa & Nata", sub: "Ameixa sobre nata" },
  { id: "grafite", name: "Grafite & Giz", sub: "Cinzas neutros e coral" },
] as const;
export type PaletteId = (typeof PALETTES)[number]["id"];

/** Sugestões de destaque (a pessoa também pode escolher qualquer cor). */
export const ACCENTS = [
  { color: "#e3a72f", name: "Mel" },
  { color: "#e07a3f", name: "Laranja" },
  { color: "#d0503c", name: "Tomate" },
  { color: "#c23d6e", name: "Framboesa" },
  { color: "#7d5bd0", name: "Violeta" },
  { color: "#3d7fd6", name: "Azul" },
  { color: "#1f9a9a", name: "Turquesa" },
  { color: "#5c9e3e", name: "Folha" },
] as const;

export type Appearance = { mode: Mode; palette: PaletteId; accent: string | null; resolved: Resolved };

const KEY = { mode: "mano.theme", palette: "mano.palette", accent: "mano.accent" };
const HEX = /^#[0-9a-f]{6}$/;

function read(key: string): unknown {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : JSON.parse(v);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* armazenamento bloqueado: segue só na memória */
  }
}

// ---------- cor: sRGB <-> OKLCH, para derivar o destaque com contraste nos dois temas ----------

type Lch = [number, number, number];
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToLin(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16) / 255)) as [number, number, number];
}

function linToOklch([r, g, b]: [number, number, number]): Lch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}

function oklchToLin([L, C, H]: Lch): [number, number, number] {
  const A = C * Math.cos(H);
  const B = C * Math.sin(H);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** A cor mais próxima que cabe no sRGB, perdendo saturação e mantendo claridade e matiz. */
function fit([L, C, H]: Lch): [number, number, number] {
  let rgb = oklchToLin([L, C, H]);
  if (inGamut(rgb)) return rgb;
  let lo = 0;
  let hi = C;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const t = oklchToLin([L, mid, H]);
    if (inGamut(t)) {
      lo = mid;
      rgb = t;
    } else hi = mid;
  }
  return oklchToLin([L, lo, H]);
}

const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const toHex = (rgb: number[]) =>
  "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, "0")).join("");

/** Sobe ou desce a claridade até a luminância relativa passar do alvo. */
function untilLum([L, C, H]: Lch, test: (y: number) => boolean, step: number): number[] {
  let l = L;
  let rgb = fit([l, C, H]);
  for (let i = 0; i < 100 && !test(lum(rgb)) && l > 0 && l < 1; i++) {
    l += step;
    rgb = fit([l, C, H]);
  }
  return rgb;
}

/*
 * O texto sobre o preenchimento é o `deep` (escuro em todas as paletas, luminância até ~0,022) ou o `deep-text`
 * (claro, a partir de ~0,80). Para dar 4,6 de contraste, o preenchimento precisa de luminância >= 0,28 (texto
 * escuro) ou <= 0,135 (texto claro); no meio disso nenhum dos dois serve.
 */
const FILL_DARK_TEXT = 0.28;
const FILL_LIGHT_TEXT = 0.135;
const onFill = (y: number) => (y >= FILL_DARK_TEXT ? "var(--m-deep)" : "var(--m-deep-text)");

/** Preenchimento com a claridade pedida; se cair na faixa sem contraste, vai para o lado mais perto. */
function fill([L, C, H]: Lch): number[] {
  const rgb = fit([L, C, H]);
  const y = lum(rgb);
  if (y >= FILL_DARK_TEXT || y <= FILL_LIGHT_TEXT) return rgb;
  return y - FILL_LIGHT_TEXT < FILL_DARK_TEXT - y
    ? untilLum([L, C, H], (v) => v <= FILL_LIGHT_TEXT, -0.005)
    : untilLum([L, C, H], (v) => v >= FILL_DARK_TEXT, 0.005);
}

/**
 * As variáveis --u-* que o index.css usa com <html data-accent>. O preenchimento do dia é a própria cor (só
 * clareia ou escurece um pouco se nenhum texto tiver contraste em cima dela); o da noite também clareia as
 * cores muito escuras. O texto de destaque escurece (dia) ou clareia (noite) até ter contraste 4,5 com os
 * painéis e com o `soft`.
 */
export function accentVars(hex: string): Record<string, string> {
  const base = linToOklch(hexToLin(hex));
  const [L, C, H] = base;
  const emberL = fill(base);
  const emberD = fill([Math.max(L, 0.68), C, H]);
  const accentL = untilLum([Math.min(L, 0.52), C, H], (y) => y <= 0.12, -0.01);
  const accentD = untilLum([Math.max(L, 0.78), C, H], (y) => y >= 0.38, 0.01);
  const glow = untilLum([Math.max(L, 0.8), C, H], (y) => y >= 0.42, 0.01);
  return {
    "--u-ember-l": toHex(emberL),
    "--u-ember-d": toHex(emberD),
    "--u-accent-l": toHex(accentL),
    "--u-accent-d": toHex(accentD),
    "--u-glow": toHex(glow),
    "--u-on-l": onFill(lum(emberL)),
    "--u-on-d": onFill(lum(emberD)),
  };
}

// ---------- estado compartilhado ----------

const media = typeof window !== "undefined" ? window.matchMedia?.("(prefers-color-scheme: dark)") : undefined;
const listeners = new Set<() => void>();
let applied: string[] = [];

function load(): Appearance {
  const m = read(KEY.mode);
  const p = read(KEY.palette);
  const a = read(KEY.accent) as { color?: unknown } | null;
  const mode: Mode = m === "light" || m === "dark" ? m : "system";
  const palette = PALETTES.some((x) => x.id === p) ? (p as PaletteId) : "mel";
  const color = typeof a?.color === "string" && HEX.test(a.color) ? a.color : null;
  return { mode, palette, accent: color, resolved: resolve(mode) };
}

function resolve(mode: Mode): Resolved {
  return mode === "system" ? (media?.matches ? "dark" : "light") : mode;
}

let state = load();

function apply() {
  const root = document.documentElement;
  root.dataset.theme = state.resolved;
  root.dataset.palette = state.palette;
  for (const k of applied) root.style.removeProperty(k);
  applied = [];
  if (state.accent) {
    const vars = accentVars(state.accent);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    applied = Object.keys(vars);
    root.dataset.accent = "";
  } else {
    delete root.dataset.accent;
  }
  const ink = getComputedStyle(root).getPropertyValue("--m-ink").trim();
  if (ink) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", ink);
}

function set(next: Partial<Omit<Appearance, "resolved">>) {
  const merged = { ...state, ...next };
  state = { ...merged, resolved: resolve(merged.mode) };
  persist();
  apply();
  listeners.forEach((f) => f());
}

function persist() {
  // "system" fica salvo como ausência, igual a quem nunca escolheu (o index.html entende os dois)
  write(KEY.mode, state.mode === "system" ? null : state.mode);
  write(KEY.palette, state.palette === "mel" ? null : state.palette);
  // as variáveis vão junto só para o index.html aplicar sem fazer conta
  write(KEY.accent, state.accent ? { color: state.accent, vars: accentVars(state.accent) } : null);
}

function reload() {
  state = load();
  apply();
  listeners.forEach((f) => f());
}

if (typeof window !== "undefined") {
  // regrava o destaque: se a conta mudou numa versão nova, o index.html passa a usar a nova já na próxima abertura
  if (state.accent) write(KEY.accent, { color: state.accent, vars: accentVars(state.accent) });
  apply();
  // o Windows trocou de claro para escuro (só importa no "Sistema")
  media?.addEventListener("change", () => state.mode === "system" && reload());
  // outra aba do visor mudou a aparência
  window.addEventListener("storage", (e) => e.key && Object.values(KEY).includes(e.key) && reload());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};

export const setMode = (mode: Mode) => set({ mode });
export const setPalette = (palette: PaletteId) => set({ palette });
export const setAccent = (color: string | null) => set({ accent: color && HEX.test(color.toLowerCase()) ? color.toLowerCase() : null });
export const resetAppearance = () => set({ mode: "system", palette: "mel", accent: null });

/** Estado atual da aparência; re-renderiza quando qualquer parte muda (aqui, no topo ou em outra aba). */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, () => state);
}

/** Botão sol/lua do topo: alterna o que está na tela e, se estava no "Sistema", passa a ser escolha fixa. */
export function useTheme() {
  const { resolved } = useAppearance();
  return [resolved, () => setMode(resolved === "dark" ? "light" : "dark")] as const;
}
