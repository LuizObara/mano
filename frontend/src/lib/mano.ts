import { useCallback, useEffect, useRef, useState } from "react";

export type Timer = {
  id: number;
  label: string | null;
  duration_s: number;
  ends_at: number; // epoch ms
  status: "running" | "ringing" | "done" | "cancelled";
};

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

export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json() as Promise<T>;
}

/** Estado ao vivo do Mano, alimentado pelo WebSocket do backend. */
export function useMano() {
  const [connected, setConnected] = useState(false);
  const [voice, setVoice] = useState<VoiceState>("idle");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);
  const [partial, setPartial] = useState("");
  const [timers, setTimers] = useState<Timer[]>([]);
  const [lastReply, setLastReply] = useState<Reply | null>(null);
  const [history, setHistory] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const retry = useRef(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let timeout: number | undefined;

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
            setTimers(msg.timers);
            setVoice(msg.voice);
            setVoiceStatus(msg.voice_status);
            break;
          case "timers":
            setTimers(msg.timers);
            break;
          case "voice":
            setVoice(msg.state);
            if (msg.state === "listening") setPartial("");
            break;
          case "voice.partial":
            setPartial(msg.text);
            break;
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

  return { connected, voice, voiceStatus, partial, timers, lastReply, history, busy, send, listen };
}

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
