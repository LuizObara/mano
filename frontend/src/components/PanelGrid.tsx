import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ResponsiveGridLayout,
  getBreakpointFromWidth,
  useContainerWidth,
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
 * - Todos os painéis são iguais na grade: qualquer um vai para qualquer lugar e se mistura com os outros.
 * - Painéis "fill" (Briefing, Últimos comandos, Música) têm altura própria e se esticam até o fim da célula.
 * - O layout de cada largura fica salvo neste aparelho (mano.panelLayout); "Restaurar" volta ao padrão.
 */

export type GridPanel = {
  id: string;
  label: string;
  node: ReactNode;
  /** o card ocupa a altura toda da célula (lista que corta, rodapé no fim); sem medir o conteúdo */
  fill: boolean;
  /** altura mínima em linhas (padrão: 4) */
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

/** Layout padrão: os painéis lado a lado na ordem da lista (3 por linha no PC), cada um subindo até onde dá. */
function defaults(bp: Bp, panels: GridPanel[]): Record<string, Box> {
  const per = PER_ROW[bp];
  const w = COLS[bp] / per;
  const out: Record<string, Box> = {};
  panels.forEach((p, k) => {
    out[p.id] = { x: (k % per) * w, y: Math.floor(k / per), w, h: p.h };
  });
  return out;
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
  const layouts = useMemo(() => {
    const out: Partial<Record<Bp, LayoutItem[]>> = {};
    for (const b of Object.keys(COLS) as Bp[]) {
      const def = defaults(b, panels);
      const boxes = saved.boxes[b] ?? {};
      const fixed = new Set(saved.fixed[b] ?? []);
      const cols = COLS[b];
      out[b] = panels.map((p) => {
        const box = boxes[p.id] ?? def[p.id];
        const minH = p.minH ?? 4;
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
