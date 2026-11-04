import { useNow } from "../lib/mano";

const dateFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });

export function Clock() {
  const now = new Date(useNow(1000));
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return (
    <div>
      <div className="text-6xl sm:text-7xl font-light tracking-tight tabular-nums leading-none">
        {hh}
        <span className="text-ember blink">:</span>
        {mm}
      </div>
      <div className="mt-2 text-muted text-lg first-letter:uppercase">{dateFmt.format(now)}</div>
    </div>
  );
}
