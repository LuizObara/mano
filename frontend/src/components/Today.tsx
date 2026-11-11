import { useState } from "react";
import { api, fmtAmount, hhmm, useNow, type Dose, type Habit, type Mano } from "../lib/mano";
import { composeCommand } from "./CommandBar";
import { Card } from "./ui";

/**
 * Resumo do dia no Início: quanto já foi feito, as doses de hoje (tomei, adiar, desfazer), os hábitos
 * (feito, registros rápidos, barra da meta) e o próximo lembrete. Tudo resolve dali, sem trocar de aba.
 */
export function Today({ mano, go }: { mano: Mano; go: (page: string) => void }) {
  const now = useNow(30000);
  const habits = mano.habits.filter((h) => h.today_scheduled);
  const doses = mano.doses;
  const upcoming = mano.reminders.filter((r) => r.status === "pending").sort((a, b) => a.due_at - b.due_at);
  const paused = !!mano.habitsPausedUntil && mano.habitsPausedUntil > now;

  const doseDone = (d: Dose) => d.status === "taken" || d.status === "skipped";
  const medsDone = doses.filter(doseDone).length;
  const habitsDone = habits.filter((h) => h.done_today).length;
  const marks = [...doses.map(doseDone), ...habits.map((h) => h.done_today)];
  const next = doses.find((d) => d.status === "pending");

  const pauseBtn =
    habits.length > 0 &&
    (paused ? (
      <button
        type="button"
        onClick={() => api("/api/habits/pause", { minutes: 0 })}
        title={`Cobranças pausadas até ${hhmm(mano.habitsPausedUntil!)}. Clique para voltar a cobrar agora.`}
        className="min-h-9 shrink-0 rounded-full border border-ember/45 px-3 text-[13px] font-semibold text-accent hover:bg-soft"
      >
        <span className="hidden sm:inline">Pausado até {hhmm(mano.habitsPausedUntil!)} · </span>Retomar
      </button>
    ) : (
      <button
        type="button"
        onClick={() => api("/api/habits/pause", { minutes: 60 })}
        title="Pausa as cobranças de hábitos por 1 hora. Remédios continuam avisando."
        aria-label="Pausar as cobranças de hábitos por 1 hora"
        className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-muted hover:bg-soft hover:text-text"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M8 5v14M16 5v14" />
        </svg>
        <span className="hidden sm:inline">Pausar 1 h</span>
      </button>
    ));

  if (doses.length === 0 && habits.length === 0) {
    return (
      <Card title="Remédios e hábitos">
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-snug text-muted">
            Nada marcado para hoje. Cadastre remédios ou hábitos e eles aparecem aqui com o que dá para fazer na hora.
          </p>
          <div className="flex flex-wrap gap-2">
            <SoftBtn onClick={() => go("remedios")}>Cadastrar remédio</SoftBtn>
            <SoftBtn onClick={() => go("habitos")}>Criar hábito</SoftBtn>
            <SoftBtn onClick={() => composeCommand("me lembra de ")}>+ Lembrete</SoftBtn>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Remédios e hábitos" action={pauseBtn}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-[18px] bg-soft px-4 py-3">
          <div className="flex shrink-0 flex-col">
            <span className="text-[12.5px] text-muted">Feito hoje</span>
            <span className="font-display text-[26px] font-medium leading-none">
              {medsDone + habitsDone} <span className="text-base text-muted">de {marks.length}</span>
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div aria-hidden className="flex gap-1">
              {marks.map((ok, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${ok ? "bg-ember" : "bg-line"}`} />
              ))}
            </div>
            <span className="truncate text-[12.5px] text-muted">
              {[doses.length > 0 && `remédios ${medsDone} de ${doses.length}`, habits.length > 0 && `hábitos ${habitsDone} de ${habits.length}`]
                .filter(Boolean)
                .join(" · ")}
              {next && ` · próximo ${hhmm(next.scheduled_at)}`}
            </span>
          </div>
        </div>

        {doses.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHead title="Remédios" link="Histórico →" onLink={() => go("remedios")} />
            {doses.map((d) => (
              <DoseRow key={d.id} d={d} now={now} snoozeMin={mano.medSnoozeMin} />
            ))}
          </section>
        )}

        {habits.length > 0 && (
          <section className="flex flex-col gap-2">
            <SectionHead title="Hábitos" count={`${habitsDone} de ${habits.length}`} link="Ver hábitos →" onLink={() => go("habitos")} />
            {habits.map((h) => (
              <HabitRow key={h.id} h={h} />
            ))}
          </section>
        )}

        <div className="flex items-center gap-2.5 border-t border-line pt-3.5">
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {upcoming[0] ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px]">
              <span className="truncate">
                <span className="tabular-nums text-muted">{fmtDue(upcoming[0].due_at, now)}</span> · {upcoming[0].text}
                {upcoming.length > 1 && <span className="text-muted"> · +{upcoming.length - 1}</span>}
              </span>
              <button
                type="button"
                onClick={() => api(`/api/reminders/${upcoming[0].id}/cancel`, {})}
                aria-label={`Cancelar lembrete ${upcoming[0].text}`}
                title="Cancelar este lembrete"
                className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-soft hover:text-alert"
              >
                ×
              </button>
            </span>
          ) : (
            <span className="flex-1 text-[13.5px] text-muted">Nenhum lembrete marcado.</span>
          )}
          <SoftBtn onClick={() => composeCommand("me lembra de ")} title="Escreve “me lembra de” na barra de comando">
            + Lembrete
          </SoftBtn>
        </div>
      </div>
    </Card>
  );
}

function SectionHead({ title, count, link, onLink }: { title: string; count?: string; link: string; onLink: () => void }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <span className="flex-1 font-semibold text-text/85">
        {title}
        {count && <span className="font-medium text-muted"> · {count}</span>}
      </span>
      <button type="button" onClick={onLink} className="text-accent hover:underline">
        {link}
      </button>
    </div>
  );
}

function SoftBtn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="min-h-9 shrink-0 rounded-full border border-line px-3.5 text-[13.5px] font-semibold hover:bg-soft"
    >
      {children}
    </button>
  );
}

function ActBtn({ label, onClick, main, aria }: { label: string; onClick: () => Promise<unknown>; main?: boolean; aria: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={aria}
      onClick={() => {
        setBusy(true);
        onClick().catch(() => {}).finally(() => setBusy(false));
      }}
      className={`min-h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-semibold disabled:opacity-50 ${
        main ? "bg-ember text-on-ember hover:brightness-105" : "border border-line hover:bg-soft"
      }`}
    >
      {label}
    </button>
  );
}

function DoseRow({ d, now, snoozeMin }: { d: Dose; now: number; snoozeMin: number }) {
  const due = d.status === "pending" && d.scheduled_at <= now;
  const act = (a: string) => () => api(`/api/meds/doses/${d.id}/${a}`, {});
  const who = `${d.name} das ${hhmm(d.scheduled_at)}`;
  const [detail, detailCls] =
    d.status === "taken"
      ? [`tomado às ${d.taken_at ? hhmm(d.taken_at) : hhmm(d.scheduled_at)}`, "text-ok"]
      : d.status === "skipped"
        ? ["pulado", "text-muted"]
        : d.status === "missed"
          ? ["não tomado", "text-alert"]
          : due
            ? ["agora · o Mano está avisando", "text-accent"]
            : [`às ${hhmm(d.scheduled_at)}`, "text-muted"];
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border px-3 py-2.5 ${
        due ? "border-ember/55 bg-ember/[0.08]" : "border-line"
      }`}
    >
      <span className={`w-11 shrink-0 text-sm tabular-nums ${due ? "text-accent" : "text-muted"}`}>{hhmm(d.scheduled_at)}</span>
      <div className="flex min-w-[140px] flex-1 flex-col">
        <span className="truncate text-[15px]">
          <strong className="font-semibold">{d.name}</strong> {d.dose && <span className="text-muted">{d.dose}</span>}
        </span>
        <span className={`text-[12.5px] ${detailCls}`}>{detail}</span>
      </div>
      <div className="ml-auto flex gap-1.5">
        {d.status === "pending" ? (
          <>
            {due && <ActBtn label={`Adiar ${snoozeMin} min`} onClick={act("snooze")} aria={`Adiar ${who} em ${snoozeMin} minutos`} />}
            <ActBtn label="Tomei" main={due} onClick={act("take")} aria={`Tomei ${who}`} />
          </>
        ) : d.status === "missed" ? (
          <ActBtn label="Tomei, marcar" onClick={act("mark-taken")} aria={`Marcar ${who} como tomado`} />
        ) : (
          <ActBtn label="Desfazer" onClick={act("undo")} aria={`Desfazer ${who}`} />
        )}
      </div>
    </div>
  );
}

function HabitRow({ h }: { h: Habit }) {
  const daily = h.goal && h.goal_period === "day";
  const weekly = h.goal && h.goal_period === "week";
  const amount = daily ? h.today_amount : weekly ? h.week_amount : h.today_amount;
  const pct = h.goal ? Math.min(100, (100 * amount) / h.goal) : 0;
  const detail =
    h.kind === "check"
      ? h.done_today
        ? h.streak >= 2
          ? `feito · ${h.streak} dias seguidos`
          : "feito"
        : h.streak >= 2
          ? `${h.streak} dias seguidos`
          : ""
      : [
          `${fmtAmount(amount, h.unit)}${h.goal ? ` de ${fmtAmount(h.goal, h.unit)}` : ""}${weekly ? " na semana" : ""}`,
          h.done_today && "feito",
        ]
          .filter(Boolean)
          .join(" · ");
  const log = (amountToLog: number) => () => api(`/api/habits/${h.id}/log`, { amount: amountToLog });
  const toggle = (done: boolean) => () => api(`/api/habits/${h.id}/toggle`, { done });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-line px-3 py-2.5">
      <span
        aria-hidden
        className={`grid size-[38px] shrink-0 place-items-center rounded-xl text-lg ${h.done_today ? "bg-ok/15 text-ok" : "bg-soft"}`}
      >
        {h.icon || (h.done_today ? "✓" : h.name.charAt(0).toUpperCase())}
      </span>
      <div className="flex min-w-[140px] flex-1 flex-col gap-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <a href={`#/habitos?h=${h.id}`} className={`truncate text-[15px] font-semibold hover:underline ${h.done_today ? "text-muted" : ""}`}>
            {h.name}
          </a>
          {detail && <span className={`shrink-0 text-[12.5px] ${h.done_today ? "text-ok" : "text-muted"}`}>{detail}</span>}
        </div>
        {h.goal !== null && h.kind !== "check" && (
          <div aria-hidden className="h-[5px] overflow-hidden rounded-full bg-line">
            <div className={`h-full rounded-full ${h.done_today ? "bg-ok" : "bg-ember"}`} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="ml-auto flex gap-1.5">
        {h.kind === "check" ? (
          h.done_today ? (
            <ActBtn label="Desfazer" onClick={toggle(false)} aria={`Desmarcar ${h.name}`} />
          ) : (
            <ActBtn label="Feito" main onClick={toggle(true)} aria={`Marcar ${h.name} como feito`} />
          )
        ) : (
          h.quick
            .slice(0, h.done_today ? 1 : 2)
            .map((q) => (
              <ActBtn
                key={q}
                label={`+${fmtAmount(q, h.unit)}`}
                onClick={log(q)}
                aria={`Registrar ${fmtAmount(q, h.unit)} em ${h.name}`}
              />
            ))
        )}
      </div>
    </div>
  );
}

function fmtDue(ms: number, now: number) {
  const d = new Date(ms);
  const today = new Date(now);
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      86400000,
  );
  const prefix = days === 0 ? "hoje" : days === 1 ? "amanhã" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${prefix} ${hhmm(ms)}`;
}
