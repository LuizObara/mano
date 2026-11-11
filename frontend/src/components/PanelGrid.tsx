import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ResponsiveGridLayout,
  getBreakpointFromWidth,
  useContainerWidth,
  verticalCompactor,
  type Compactor,
  type Layout,
  type LayoutItem,
  type ResizeHandleAxis,
} from "react-grid-layout";
import { PanelHide } from "./ui";

/**
 * Grade dos painéis do Início (react-grid-layout): arrastar pelo título, redimensionar pelas bordas e cantos.
 *
 * - Três larguras: PC (12 colunas), tela média (6) e celular (1 coluna, sem arrastar).
 * - Enquanto ninguém mexeu na altura de um painel, a célula acompanha o conteúdo (o Card mede e avisa).
 *   Ao puxar a borda de baixo, a altura fica fixa e o conteúdo que sobrar rola dentro do card.
 * - Painéis "fill" (Briefing, Últimos comandos, Música) têm altura própria e se esticam até o fim da célula;
 *   os "wide" (Briefing, Últimos comandos) ficam lado a lado na faixa de baixo do layout padrão.
 * - O layout de cada largura fica salvo neste aparelho (mano.panelLayout); "Restaurar" volta ao padrão.
 */

export type GridPanel = {
  id: string;
  label: string;
  node: ReactNode;
  /** o card ocupa a altura toda da célula (lista que corta, rodapé no fim); sem medir o conteúdo */
  fill: boolean;
  /** fica na faixa de baixo do layout padrão, lado a lado e alinhado pelo topo (Briefing, Últimos comandos) */
  wide?: boolean;
  /** altura mínima em linhas (padrão: 4; 10 nos "wide") */
  minH?: number;
  /** altura inicial em linhas da grade, antes de medir o conteúdo */
  h: number;
  hide: () => void;
};

type Bp = "lg" | "md" | "xs";
type Box = { x: number; y: number; w: number; h: number };
export type SavedLayout = {
  v: 1;
  /** posição e tamanho de cada painel, por largura de tela */
  boxes: Partial<Record<Bp, Record<string, Box>>>;
  /** painéis cuja altura foi ajustada à mão (não acompanham mais o conteúdo) */
  fixed: Partial<Record<Bp, string[]>>;
};
export const EMPTY_LAYOUT: SavedLayout = { v: 1, boxes: {}, fixed: {} };

export function isCustomLayout(l: SavedLayout | null | undefined) {
  return !!l && l.v === 1 && Object.values(l.boxes ?? {}).some((b) => b && Object.keys(b).length > 0);
}

// a largura é a do contêiner dos painéis (o visor tem no máximo 1296 px úteis)
const BREAKPOINTS: Record<Bp, number> = { lg: 1000, md: 600, xs: 0 };
const COLS: Record<Bp, number> = { lg: 12, md: 6, xs: 1 };
const PER_ROW: Record<Bp, number> = { lg: 3, md: 2, xs: 1 };
const MIN_W: Record<Bp, number> = { lg: 3, md: 2, xs: 1 };
const ROW = 10; // linha baixa: o redimensionamento anda de 30 em 30 px
const GAP = 20; // o mesmo gap-5 de antes
const MARGIN = [GAP, GAP] as const;
const PADDING = [0, 0] as const;
const HANDLES: ResizeHandleAxis[] = ["s", "e", "w", "se", "sw"];
const NO_DRAG = "button, a, input, select, textarea, label, [role='button'], [role='switch']";

/** px → linhas da grade (altura de h linhas = h*ROW + (h-1)*GAP) */
const toRows = (px: number) => Math.max(1, Math.ceil((px + GAP) / (ROW + GAP)));

/** Layout padrão: painéis pequenos lado a lado, na ordem da lista; Briefing e Últimos comandos embaixo. */
function defaults(bp: Bp, panels: GridPanel[]): Record<string, Box> {
  const cols = COLS[bp];
  const per = PER_ROW[bp];
  const w = cols / per;
  const wideW = bp === "lg" ? cols / 2 : cols;
  const widePer = cols / wideW;
  const out: Record<string, Box> = {};
  let k = 0;
  let j = 0;
  for (const p of panels) {
    if (p.wide) {
      out[p.id] = { x: (j % widePer) * wideW, y: 1000 + Math.floor(j / widePer), w: wideW, h: p.h };
      j++;
    } else {
      out[p.id] = { x: (k % per) * w, y: Math.floor(k / per), w, h: p.h };
      k++;
    }
  }
  return out;
}

/**
 * Compactação vertical normal + um ajuste: painéis "wide" (Briefing, Últimos comandos) lado a lado ficam com o topo
 * alinhado, como antes, em vez de cada um subir até onde dá. Os alinhados viram fixos por um instante e o resto
 * se acomoda em volta.
 */
function alignedCompactor(wide: Set<string>): Compactor {
  return {
    type: "vertical",
    allowOverlap: false,
    compact(layout, cols) {
      const out = verticalCompactor.compact(layout, cols);
      const fills = out.filter((it) => wide.has(it.i) && !it.static);
      let changed = false;
      const top: Record<string, number> = {};
      for (const a of fills) {
        for (const b of fills) {
          if (a === b) continue;
          const sideBySide = a.x + a.w <= b.x || b.x + b.w <= a.x;
          const sameBand = a.y < b.y + b.h && b.y < a.y + a.h;
          if (sideBySide && sameBand && b.y > a.y) {
            top[a.i] = Math.max(top[a.i] ?? a.y, b.y);
            changed = true;
          }
        }
      }
      if (!changed) return out;
      const pinned = out.map((it) =>
        top[it.i] !== undefined || fills.some((f) => f.i === it.i) ? { ...it, y: top[it.i] ?? it.y, static: true } : it,
      );
      return verticalCompactor.compact(pinned, cols).map((it) => (wide.has(it.i) ? { ...it, static: false } : it));
    },
  };
}

const same = (a: readonly LayoutItem[], b: readonly LayoutItem[]) =>
  a.length === b.length &&
  a.every((it) => {
    const o = b.find((x) => x.i === it.i);
    return !!o && o.x === it.x && o.y === it.y && o.w === it.w && o.h === it.h;
  });

export function PanelGrid({
  panels,
  layout,
  setLayout,
}: {
  panels: GridPanel[];
  layout: SavedLayout;
  setLayout: (fn: (l: SavedLayout) => SavedLayout) => void;
}) {
  const saved = layout?.v === 1 && layout.boxes && layout.fixed ? layout : EMPTY_LAYOUT;
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const bp = getBreakpointFromWidth(BREAKPOINTS, width) as Bp;
  const editable = bp !== "xs";

  // alturas medidas (em linhas). Durante um arraste/redimensionamento ficam na fila até soltar.
  const measured = useRef<Record<string, number>>({});
  const busy = useRef(false);
  const pending = useRef(false);
  const [tick, setTick] = useState(0);
  const measureFns = useRef<Record<string, (px: number) => void>>({});
  const measureFor = (id: string) =>
    (measureFns.current[id] ??= (px: number) => {
      const r = toRows(px);
      if (measured.current[id] === r) return;
      measured.current[id] = r;
      if (busy.current) pending.current = true;
      else setTick((n) => n + 1);
    });

  // sem transição no primeiro instante: os cards chegam à altura do conteúdo sem "crescer" na tela
  const [live, setLive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLive(true), 500);
    return () => clearTimeout(t);
  }, []);

  const ids = panels.map((p) => p.id).join(",");
  const wideIds = panels
    .filter((p) => p.wide)
    .map((p) => p.id)
    .join(",");
  const compactor = useMemo(() => alignedCompactor(new Set(wideIds.split(","))), [wideIds]);
  const layouts = useMemo(() => {
    const out: Partial<Record<Bp, LayoutItem[]>> = {};
    for (const b of Object.keys(COLS) as Bp[]) {
      const def = defaults(b, panels);
      const boxes = saved.boxes[b] ?? {};
      const fixed = new Set(saved.fixed[b] ?? []);
      const cols = COLS[b];
      out[b] = panels.map((p) => {
        const box = boxes[p.id] ?? def[p.id];
        const minH = p.minH ?? (p.wide ? 10 : 4);
        const auto = !p.fill && !fixed.has(p.id) && measured.current[p.id];
        const w = Math.min(Math.max(box.w, Math.min(MIN_W[b], cols)), cols);
        return {
          i: p.id,
          x: Math.min(Math.max(0, box.x), cols - w),
          y: box.y,
          w,
          h: Math.max(auto || box.h, minH),
          minW: Math.min(MIN_W[b], cols),
          minH,
        };
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, saved, tick]);

  const save = (items: Layout, fixedId?: string) => {
    const current = layouts[bp] ?? [];
    if (!fixedId && same(items, current)) return; // clique no título sem mover
    setLayout((l) => {
      const base = l?.v === 1 && l.boxes && l.fixed ? l : EMPTY_LAYOUT;
      const boxes = { ...(base.boxes[bp] ?? {}) };
      for (const it of items) boxes[it.i] = { x: it.x, y: it.y, w: it.w, h: it.h };
      const fixed = base.fixed[bp] ?? [];
      return {
        v: 1,
        boxes: { ...base.boxes, [bp]: boxes },
        fixed: { ...base.fixed, [bp]: fixedId && !fixed.includes(fixedId) ? [...fixed, fixedId] : fixed },
      };
    });
  };
  const start = () => {
    busy.current = true;
  };
  const stop = () => {
    busy.current = false;
    if (pending.current) {
      pending.current = false;
      setTick((n) => n + 1);
    }
  };

  return (
    <div ref={containerRef} className={`mano-grid ${live ? "is-live" : ""}`}>
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          breakpoints={BREAKPOINTS}
          cols={COLS}
          layouts={layouts}
          rowHeight={ROW}
          margin={MARGIN}
          containerPadding={PADDING}
          compactor={compactor}
          dragConfig={{ enabled: editable, handle: ".panel-drag", cancel: NO_DRAG, threshold: 4 }}
          resizeConfig={{ enabled: editable, handles: HANDLES }}
          onDragStart={start}
          onResizeStart={start}
          onDragStop={(items) => {
            save(items);
            stop();
          }}
          onResizeStop={(items, oldItem, newItem) => {
            // puxou a borda de baixo (ou um canto): a altura passa a ser a escolhida
            const id = newItem && oldItem && newItem.h !== oldItem.h ? newItem.i : undefined;
            save(items, id);
            stop();
          }}
        >
          {panels.map((p) => (
            <div key={p.id}>
              <PanelHide.Provider
                value={{ label: p.label, hide: p.hide, grid: { fill: p.fill, draggable: editable, measure: measureFor(p.id) } }}
              >
                {p.node}
              </PanelHide.Provider>
            </div>
          ))}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
