import type { ReactNode } from "react";

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
  return (
    <section className={`rounded-2xl border border-line bg-panel p-4 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export const btn = {
  primary: "rounded-xl bg-ember px-4 py-2 font-medium text-ink disabled:opacity-40",
  ghost: "rounded-lg border border-line px-3 py-1.5 text-sm hover:border-ember/50 disabled:opacity-40",
  danger: "rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:border-alert hover:text-alert",
  chip: "rounded-full border border-line px-3 py-1 text-sm text-muted hover:text-text hover:border-ember/50",
};

export const input =
  "rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-ember/60 placeholder:text-muted/60";

const STATUS: Record<string, [string, string]> = {
  taken: ["Tomado", "bg-emerald-400/15 text-emerald-300"],
  skipped: ["Pulado", "bg-line text-muted"],
  missed: ["Não tomado", "bg-alert/15 text-alert"],
  pending: ["Pendente", "bg-ember-soft text-ember"],
  later: ["Mais tarde", "bg-line/60 text-muted"],
};

export function StatusPill({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, "bg-line text-muted"];
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}
