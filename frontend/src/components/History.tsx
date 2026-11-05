import type { LogEntry } from "../lib/mano";
import { Card } from "./ui";

const timeFmt = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function History({ entries }: { entries: LogEntry[] }) {
  return (
    <Card title="Últimos comandos">
      {entries.length === 0 && <p className="text-muted text-sm">Nada ainda.</p>}
      <ul className="flex flex-col divide-y divide-line">
        {entries.map((e) => (
          <li key={e.id} className="py-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted tabular-nums">{timeFmt.format(e.at)}</span>
              <span className="truncate">
                {e.source === "voice" && (
                  <span className="mr-1 text-accent" title="por voz" aria-label="por voz">●</span>
                )}
                {e.text}
              </span>
            </div>
            <div className={`truncate pl-12 ${e.intent ? "text-muted" : "text-alert/80"}`}>{e.reply}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
