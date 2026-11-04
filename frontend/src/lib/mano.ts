import { useCallback, useEffect, useRef, useState } from "react";

export type Timer = {
  id: number;
  label: string | null;
  duration_s: number;
  ends_at: number; // epoch ms
  status: "running" | "ringing" | "done" | "cancelled";
};

export type Med = {
  id: number;
  name: string;
  dose: string;
  times: string[];
  days: number[];
  stock: number | null;
  low_stock: number;
  notes: string;
  active: boolean;
};

export type Dose = {
  id: number;
  medication_id: number;
  name: string;
  dose: string;
  scheduled_at: number;
  status: "pending" | "taken" | "skipped" | "missed";
  taken_at: number | null;
  reminders: number;
};

export type Habit = {
  id: number;
  name: string;
  icon: string;
  days: number[];
  today_scheduled: boolean;
  done_today: boolean;
  streak: number;
  history: string[]; // ISO dates
};

export type Reminder = { id: number; text: string; due_at: number; status: "pending" | "fired" };

export type LogEntry = {
  id: number;
  at: number;
  source: string;
  text: string;
  intent: string | null;
  reply: string;
};

export type Reply = { intent: string | null; speech: string; display: string; log: LogEntry };
export type VoiceState = "idle" | "listening" | "thinking" | "speaking";
export type VoiceStatus = { available: boolean; reason: string; wake_phrases: string[] };
export type Notice = { id: number; text: string; level: string; title: string };

export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const j = await res.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* sem corpo */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/** Estado ao vivo do Mano, alimentado pelo WebSocket do backend. */
export function useMano() {
  const [connected, setConnected] = useState(false);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [partial, setPartial] = useState("");
  const [timers, setTimers] = useState<Timer[]>([]);
  const [meds, setMeds] = useState<Med[]>([]);
  const [doses, setDoses] = useState<Dose[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [lastReply, setLastReply] = useState<Reply | null>(null);
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const retry = useRef(0);
  const noticeId = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let timeout: number | undefined;

    const apply = (msg: Record<string, unknown>) => {
      if ("timers" in msg) setTimers(msg.timers as Timer[]);
      if ("meds" in msg) setMeds(msg.meds as Med[]);
      if ("doses" in msg) setDoses(msg.doses as Dose[]);
      if ("habits" in msg) setHabits(msg.habits as Habit[]);
      if ("reminders" in msg) setReminders(msg.reminders as Reminder[]);
    };

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => {
        retry.current = 0;
        setConnected(true);
        api<LogEntry[]>("/api/history?limit=15").then(setHistory).catch(() => {});
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timeout = window.setTimeout(connect, Math.min(5000, 500 * 2 ** retry.current++));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        switch (msg.type) {
          case "hello":
            apply(msg);
            setVoice(msg.voice);
            setVoiceStatus(msg.voice_status);
            break;
          case "timers":
          case "meds":
          case "habits":
          case "reminders":
            apply(msg);
            break;
          case "voice":
            setVoice(msg.state);
            if (msg.state === "listening") setPartial("");
            break;
          case "voice.partial":
            setPartial(msg.text);
            break;
          case "notice": {
            const id = ++noticeId.current;
            setNotices((n) => [...n.slice(-2), { id, text: msg.text, level: msg.level, title: msg.title }]);
            window.setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 12000);
            break;
          }
          case "reply":
            setLastReply(msg);
            setPartial("");
            setHistory((h) => [msg.log, ...h.filter((e) => e.id !== msg.log.id)].slice(0, 15));
            break;
        }
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timeout);
      ws?.close();
    };
  }, []);

  const send = useCallback(async (text: string, speak: boolean) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api("/api/command", { text, speak, source: "text" });
    } finally {
      setBusy(false);
    }
  }, []);

  const listen = useCallback(() => api("/api/voice/listen", {}).catch(() => {}), []);
  const dismissNotice = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);

  return {
    connected, voice, voiceStatus, partial, timers, meds, doses, habits, reminders, notices,
    lastReply, history, busy, send, listen, dismissNotice,
  };
}

export type Mano = ReturnType<typeof useMano>;

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function fmtLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Data local em ISO (yyyy-mm-dd), sem fuso. */
export function isoDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 0 = segunda, como no backend. */
export const weekdayMon0 = (d: Date) => (d.getDay() + 6) % 7;
