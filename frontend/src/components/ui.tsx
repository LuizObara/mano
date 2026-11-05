import { createContext, useContext, type ReactNode } from "react";

/** Quando um painel do Início pode ser ocultado, o Card ganha o botão de olho (ver PanelSlot no App). */
export const PanelHide = createContext<{ label: string; hide: () => void } | null>(null);

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const panel = useContext(PanelHide);
  return (
    <section className={`rounded-3xl border border-line bg-panel p-5 ${className}`}>
      <div className="mb-3 flex min-h-9 items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-display text-xl font-medium">{title}</h2>
        {action}
        {panel && (
          <button
            type="button"
            onClick={panel.hide}
            aria-label={`Ocultar ${panel.label}`}
            title="Ocultar painel"
            className="-mr-1 grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-soft hover:text-text"
          >
            <Icon name="eye-off" className="size-[18px]" />
          </button>
        )}
      </div>
      {children}
    </section>
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
  external: <path d="M7 17L17 7M7 7h10v10" />,
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
