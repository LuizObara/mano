import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Painel do Início: o Card ganha o botão de olho (ocultar) e, dentro da grade (PanelGrid),
 * ocupa a célula inteira, o título vira a alça de arrastar e o corpo rola se faltar espaço.
 */
export const PanelHide = createContext<{
  label: string;
  hide: () => void;
  grid?: {
    /** o próprio card se estica até o fim da célula (Briefing, Últimos comandos) */
    fill: boolean;
    draggable: boolean;
    /** altura natural do card, em px, para a grade ajustar a célula enquanto ninguém fixou a altura */
    measure: (px: number) => void;
  };
} | null>(null);

export function Card({
  title,
  action,
  children,
  className = "",
  dense = false,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** título e respiro menores, para painéis bem baixos (ex.: música no tamanho mínimo) */
  dense?: boolean;
}) {
  const panel = useContext(PanelHide);
  const grid = panel?.grid;
  const box = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const measure = grid && !grid.fill ? grid.measure : null;

  // altura natural = tudo que não é o corpo + o conteúdo do corpo com o respiro dele
  useEffect(() => {
    if (!measure || !box.current || !body.current || !inner.current) return;
    const s = box.current;
    const b = body.current;
    const c = inner.current;
    const run = () => {
      const pad = parseFloat(getComputedStyle(b).paddingTop) + parseFloat(getComputedStyle(b).paddingBottom);
      measure(s.offsetHeight - b.offsetHeight + c.offsetHeight + pad);
    };
    run(); // já na montagem, sem esperar o primeiro aviso do observer
    const ro = new ResizeObserver(run);
    ro.observe(c);
    ro.observe(s);
    return () => ro.disconnect();
  }, [measure]);

  const head = (
    <div
      className={`flex items-center gap-2 ${dense ? "mb-1.5 min-h-7" : "mb-3 min-h-9"} ${grid ? "shrink-0" : ""} ${grid?.draggable ? "panel-drag cursor-grab active:cursor-grabbing" : ""}`}
      title={grid?.draggable ? "Arraste para mudar o painel de lugar" : undefined}
    >
      <h2 className={`min-w-0 flex-1 truncate font-display font-medium ${dense ? "text-[15px]" : "text-xl"}`}>{title}</h2>
      {action}
      {panel && (
        <button
          type="button"
          onClick={panel.hide}
          aria-label={`Ocultar ${panel.label}`}
          title="Ocultar painel"
          className={`-mr-1 grid shrink-0 place-items-center rounded-xl text-muted hover:bg-soft hover:text-text ${dense ? "size-7" : "size-9"}`}
        >
          <Icon name="eye-off" className={dense ? "size-[15px]" : "size-[18px]"} />
        </button>
      )}
    </div>
  );

  if (!grid) {
    return (
      <section className={`rounded-3xl border border-line bg-panel ${dense ? "px-4 pb-3.5 pt-2.5" : "p-5"} ${className}`}>
        {head}
        {children}
      </section>
    );
  }
  return (
    // isolate: um fundo decorativo do painel (ex.: capa desfocada) fica atrás do conteúdo e na frente do papel
    <section
      ref={box}
      className={`group/panel relative isolate flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-panel ${dense ? "px-4 pb-3.5 pt-2.5" : "p-5"} ${className}`}
    >
      {grid.draggable && (
        // pontinhos discretos no topo: aparecem no hover e indicam que o painel pode ser arrastado
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1.5 flex -translate-x-1/2 gap-[3px] opacity-0 transition-opacity duration-150 group-hover/panel:opacity-50"
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="size-[3px] rounded-full bg-muted" />
          ))}
        </span>
      )}
      {head}
      {/* o corpo rola dentro do card; o respiro em cima deixa o contorno de foco aparecer inteiro */}
      <div
        ref={body}
        className={`-mt-1 flex min-h-0 flex-1 flex-col overflow-y-auto pt-1 [scrollbar-width:thin] ${dense ? "-mx-4 -mb-3.5 px-4 pb-3.5" : "-mx-5 -mb-5 px-5 pb-5"}`}
      >
        {grid.fill ? (
          children
        ) : (
          // flow-root: mantém as margens dos filhos dentro da medida
          <div ref={inner} className="flow-root">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Janela por cima da página (Briefing, histórico de comandos). Fecha no Esc, no × e clicando fora;
 * trava a rolagem da página e devolve o foco para quem abriu.
 */
export function Modal({
  label,
  onClose,
  children,
  className = "max-w-[940px]",
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[15] overflow-y-auto px-4 pb-10 pt-[min(10vh,88px)]">
      <button type="button" aria-label="Fechar" tabIndex={-1} onClick={() => close.current()} className="fixed inset-0 cursor-default bg-veil" />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative mx-auto flex w-full flex-col overflow-hidden rounded-[30px] border border-line bg-panel shadow-2xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Cabeçalho padrão de um Modal: título, linha de apoio, ações e o × de fechar. */
export function ModalHeader({ title, sub, onClose, children }: { title: string; sub?: ReactNode; onClose: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 pb-4 pt-6 sm:pl-7 sm:pr-6">
      <div className="flex min-w-0 flex-[1_1_0%] flex-col gap-0.5">
        <h2 className="font-display text-[30px] font-medium leading-tight">{title}</h2>
        {sub && <span className="text-sm text-muted">{sub}</span>}
      </div>
      {/* no celular as ações descem para a linha de baixo e o × fica ao lado do título */}
      {children && <div className="order-last basis-full sm:order-none sm:basis-auto">{children}</div>}
      <button
        type="button"
        onClick={onClose}
        aria-label={`Fechar ${title.toLowerCase()}`}
        className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-soft hover:text-text"
      >
        <Icon name="x" className="size-5" />
      </button>
    </div>
  );
}

/** Botão de filtro que fica "aceso" quando escolhido (overlays do Briefing e do histórico). */
export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3.5 text-sm font-medium ${
        on ? "border-text bg-text text-ink" : "border-line text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

export const btn = {
  primary: "rounded-full bg-ember px-5 py-2 font-semibold text-on-ember disabled:opacity-40",
  ghost: "rounded-full border border-line px-4 py-1.5 text-sm hover:bg-soft disabled:opacity-40",
  danger: "rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:border-alert hover:text-alert",
  chip: "rounded-full bg-soft px-3 py-1 text-sm text-text hover:bg-line",
};

export const input =
  "rounded-xl border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted/70";

const STATUS: Record<string, [string, string]> = {
  taken: ["Tomado", "bg-ok/15 text-ok"],
  skipped: ["Pulado", "bg-soft text-muted"],
  missed: ["Não tomado", "bg-alert/15 text-alert"],
  pending: ["Pendente", "bg-ember-soft text-accent"],
  later: ["Mais tarde", "bg-soft/60 text-muted"],
};

export function StatusPill({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, "bg-soft text-muted"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

const ICONS: Record<string, ReactNode> = {
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />
    </>
  ),
  "mic-off": (
    <>
      <path d="M2 2l20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7M19 10v2a7 7 0 0 1-.6 2.8M5 10v2a7 7 0 0 0 11.9 5M12 19v3" />
    </>
  ),
  volume: <path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />,
  "volume-off": <path d="M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6" />,
  "eye-off": (
    <path d="M10.7 5.1A10 10 0 0 1 12 5c7 0 10 7 10 7a13 13 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  ),
  panels: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  file: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  pen: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  bell: <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M13.7 21a2 2 0 0 1-3.4 0" />,
  "bell-off": <path d="M13.7 21a2 2 0 0 1-3.4 0M18.6 13A17.9 17.9 0 0 1 18 8M6.3 6.3A5.9 5.9 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M2 2l20 20" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M20 6L9 17l-5-5" />,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  "check-circle": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),
  x: <path d="M18 6L6 18M6 6l12 12" />,
  expand: <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />,
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  repeat: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />,
  "chevron-left": <path d="M15 18l-6-6 6-6" />,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  external: <path d="M7 17L17 7M7 7h10v10" />,
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  upload: <path d="M12 15V4M7 9l5-5 5 5M5 20h14" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3" />
    </>
  ),
  note: <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
};

export function Icon({ name, className = "size-5" }: { name: keyof typeof ICONS | string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}
