import { ago, type Mano } from "../lib/mano";
import { Card } from "./ui";

export function BriefingCard({ mano, go }: { mano: Mano; go: (p: string) => void }) {
  const b = mano.briefing;
  const top = b?.top ?? [];
  return (
    <Card
      title="Briefing"
      action={
        <button className="text-xs text-muted hover:text-text" onClick={() => go("briefing")}>
          {b?.unread ? `${b.unread} novidades →` : "abrir →"}
        </button>
      }
    >
      {!b?.feeds ? (
        <p className="text-sm text-muted">
          Escolha seus blogs na{" "}
          <button className="text-ember hover:underline" onClick={() => go("briefing")}>
            aba Briefing
          </button>
          .
        </p>
      ) : top.length === 0 ? (
        <p className="text-sm text-muted">Nada novo nos seus feeds.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {top.slice(0, 4).map((it) => (
            <li key={it.id}>
              <a href={it.url} target="_blank" rel="noreferrer" className="block py-2 text-sm hover:bg-ink/40">
                <div className="line-clamp-2 font-medium leading-snug">{it.title}</div>
                <div className="mt-0.5 truncate text-xs text-muted">
                  {it.feed} · {ago(it.published)}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
