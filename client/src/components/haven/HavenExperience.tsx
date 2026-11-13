"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import {
  BarVisualizer,
  RoomAudioRenderer,
  RoomContext,
  StartAudio,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import { motion } from "framer-motion";
import { BadgePoundSterling, CalendarCheck, FileText, KeyRound, MapPin, Mic, PhoneOff, X } from "lucide-react";

import "@livekit/components-styles";

import { HavenStage } from "./HavenStage";
import type { HavenPreviews, StageData, StageKind } from "@/lib/haven-types";
import type { ListingSummary } from "@/lib/listing-summary";
import { cn } from "@/lib/utils";

type CallState = "idle" | "connecting" | "connected" | "ended" | "error";

const CAPABILITIES: { kind: StageKind; label: string; icon: React.ReactNode; say: string }[] = [
  { kind: "map", label: "Near what matters", icon: <MapPin className="size-4" />, say: "Find 2-bed homes near a park under £2,500." },
  { kind: "price", label: "Price check", icon: <BadgePoundSterling className="size-4" />, say: "Is this a fair price for the area?" },
  { kind: "agreement", label: "Agreement Q&A", icon: <FileText className="size-4" />, say: "How much notice do I give, and is my deposit protected?" },
  { kind: "viewing", label: "Book a viewing", icon: <CalendarCheck className="size-4" />, say: "Can I view it on Thursday at 2pm?" },
  { kind: "reservation", label: "Quick reserve", icon: <KeyRound className="size-4" />, say: "I'd like to take it. Can you reserve it for me?" },
];

const TRY_TO_KIND: Record<string, StageKind> = { near: "map", price: "price", agreement: "agreement", viewing: "viewing", reserve: "reservation" };

export function HavenExperience({
  listings,
  previews,
  context,
  initialTry,
}: {
  listings: ListingSummary[];
  previews: HavenPreviews;
  context: ListingSummary | null;
  initialTry: string | null;
}) {
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }));
  const [callState, setCallState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<StageKind>(TRY_TO_KIND[initialTry ?? ""] ?? "map");
  const [live, setLive] = useState<StageData | null>(null);
  const [followLive, setFollowLive] = useState(true);
  const [ctx, setCtx] = useState<ListingSummary | null>(context);
  const roomName = useRef<string | null>(null);
  const lastStamp = useRef<string | null>(null);

  // Disconnect when leaving the page.
  useEffect(() => {
    const onDisc = () => setCallState((s) => (s === "connected" ? "ended" : s));
    room.on(RoomEvent.Disconnected, onDisc);
    return () => {
      room.off(RoomEvent.Disconnected, onDisc);
      void room.disconnect();
    };
  }, [room]);

  async function start() {
    setError(null);
    setCallState("connecting");
    try {
      const res = await fetch(`/api/token?property_id=${encodeURIComponent(ctx?.id ?? "")}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Token request failed (${res.status})`);
      const { serverUrl, token, roomName: name } = await res.json();
      roomName.current = name;
      // Give up after 12s so a missing voice server fails fast in a demo.
      let timer: number | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("no answer from the voice server")), 12_000);
      });
      try {
        await Promise.race([room.connect(serverUrl, token), timeout]);
      } finally {
        window.clearTimeout(timer);
      }
      await room.localParticipant.setMicrophoneEnabled(true);
      setCallState("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCallState("error");
      void room.disconnect();
    }
  }

  function end() {
    void room.disconnect();
    setCallState("ended");
  }

  // While connected, follow what Haven is doing (stage.json written by the agent's tools).
  useEffect(() => {
    if (callState !== "connected") return;
    let cancelled = false;
    const poll = async () => {
      if (!roomName.current) return;
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(roomName.current)}`, { cache: "no-store" });
        if (!res.ok) return;
        const snap = (await res.json()) as { stage?: (StageData & { updated_at?: string }) | null };
        const s = snap.stage;
        if (!cancelled && s?.kind && s.updated_at !== lastStamp.current) {
          lastStamp.current = s.updated_at ?? null;
          setLive({ kind: s.kind, data: s.data } as StageData);
          setTab(s.kind);
          setFollowLive(true);
        }
      } catch {
        // The session folder appears once the agent joins.
      }
    };
    void poll();
    const id = window.setInterval(poll, 1200);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [callState]);

  const showingLive = live && followLive && live.kind === tab;
  const stage: StageData = showingLive ? live : ({ kind: tab, data: previews[tab] } as StageData);
  const active = CAPABILITIES.find((c) => c.kind === tab)!;
  const stageReady = stage.kind !== "price" || Boolean(stage.data);

  return (
    <RoomContext.Provider value={room}>
      <main className="mx-auto grid max-w-7xl gap-5 px-4 pb-28 pt-6 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)] lg:px-8">
        {/* ---------- Haven console ---------- */}
        <section className="re-card flex flex-col gap-5 p-6 lg:sticky lg:top-24 lg:h-[calc(100dvh-8rem)] lg:self-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">Your AI lettings agent</p>
            <h1 className="mt-2 text-5xl font-medium tracking-tight">
              Haven<span className="re-serif italic text-[var(--re-accent)]">.</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--re-muted)]">
              Talk out loud. Haven searches the map, checks prices, answers agreement questions, books viewings and reserves homes, and shows each step here.
            </p>
          </div>

          {ctx ? (
            <div className="flex items-center gap-3 rounded-2xl border p-2 pr-3" style={{ borderColor: "var(--re-line)" }}>
              {ctx.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ctx.image} alt="" className="size-12 rounded-xl object-cover" />
              ) : (
                <span className="size-12 rounded-xl" style={{ background: "var(--re-surface-2)" }} />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-[var(--re-muted)]">Talking about</p>
                <p className="truncate text-sm font-medium">{ctx.title}</p>
              </div>
              {callState === "idle" || callState === "ended" || callState === "error" ? (
                <button type="button" onClick={() => setCtx(null)} aria-label="Talk about all homes instead" className="text-[var(--re-muted)] hover:text-[var(--re-ink)]">
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          ) : (
            <p className="rounded-2xl border px-4 py-3 text-sm text-[var(--re-muted)]" style={{ borderColor: "var(--re-line)" }}>
              Talking about <span className="font-medium text-[var(--re-ink)]">all homes</span>.{" "}
              <Link href="/explore" className="font-semibold text-[var(--re-ink)] underline-offset-2 hover:underline">Pick one</Link> to focus.
            </p>
          )}

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
            {callState === "connected" ? <LiveConsole /> : <Orb state={callState} />}
          </div>

          {error ? (
            <p role="alert" className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "color-mix(in srgb, var(--re-warm) 40%, transparent)", color: "var(--re-warm)" }}>
              Couldn&apos;t reach Haven ({error}). Make sure the voice agent is running. The examples on the right still work.
            </p>
          ) : null}

          {callState === "connected" ? (
            <button type="button" onClick={end} className="re-btn re-btn-ink h-12 gap-2">
              <PhoneOff className="size-4" /> End call
            </button>
          ) : (
            <button type="button" onClick={start} disabled={callState === "connecting"} className="re-btn re-btn-primary h-12 gap-2">
              <Mic className="size-4" /> {callState === "connecting" ? "Connecting…" : callState === "ended" ? "Talk again" : "Talk to Haven"}
            </button>
          )}
        </section>

        {/* ---------- Stage ---------- */}
        <section className="flex min-w-0 flex-col gap-4">
          <div className="re-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="What Haven can do">
            {CAPABILITIES.map((c) => {
              const on = c.kind === tab;
              const hasLive = live?.kind === c.kind;
              return (
                <button
                  key={c.kind}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => {
                    setTab(c.kind);
                    setFollowLive(true);
                  }}
                  className={cn("relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors", on ? "" : "hover:bg-[var(--re-surface-2)]")}
                  style={{ borderColor: on ? "transparent" : "var(--re-line)", color: on ? "var(--re-accent-ink)" : undefined }}
                >
                  {on ? (
                    <motion.span layoutId="haven-tab" className="absolute inset-0 rounded-full" style={{ background: "var(--re-pill)" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />
                  ) : null}
                  <span className="relative inline-flex items-center gap-2">
                    {c.icon}
                    {c.label}
                    {hasLive ? <span className="size-2 rounded-full" style={{ background: "var(--re-good)" }} aria-label="live result" /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="re-card relative flex min-h-[560px] flex-col p-5 sm:p-7 lg:h-[calc(100dvh-13rem)]">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
              {showingLive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" style={{ background: "color-mix(in srgb, var(--re-good) 16%, transparent)", color: "var(--re-good)" }}>
                  <span className="relative flex size-2">
                    <span className="absolute inset-0 animate-ping rounded-full" style={{ background: "var(--re-good)" }} />
                    <span className="relative size-2 rounded-full" style={{ background: "var(--re-good)" }} />
                  </span>
                  Live from your call
                </span>
              ) : (
                <span className="rounded-full px-2.5 py-1 font-semibold" style={{ background: "var(--re-surface-2)" }}>Example from real listings</span>
              )}
              <span className="text-[var(--re-muted)]">
                Try saying <span className="re-serif text-sm italic text-[var(--re-ink)]">“{active.say}”</span>
              </span>
              {live && !showingLive ? (
                <button type="button" onClick={() => { setTab(live.kind); setFollowLive(true); }} className="ml-auto font-semibold underline-offset-2 hover:underline">
                  Back to live result
                </button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1">
              {stageReady ? <HavenStage stage={stage} listings={listings} /> : <p className="text-sm text-[var(--re-muted)]">No rental to compare yet.</p>}
            </div>
          </div>
        </section>
      </main>
      <RoomAudioRenderer />
      <StartAudio label="Tap to hear Haven" className="re-btn re-btn-ink fixed bottom-24 left-1/2 z-50 -translate-x-1/2" />
    </RoomContext.Provider>
  );
}

/** Idle / connecting orb. */
function Orb({ state }: { state: CallState }) {
  const busy = state === "connecting";
  return (
    <div className="relative grid size-44 place-items-center">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="absolute inset-0 rounded-full"
          style={{ border: "1px solid color-mix(in srgb, var(--re-accent) 45%, transparent)" }}
          animate={{ scale: [0.7, 1.15], opacity: [0.7, 0] }}
          transition={{ duration: busy ? 1.2 : 3, repeat: Infinity, delay: i * (busy ? 0.4 : 1), ease: "easeOut" }}
        />
      ))}
      <motion.span
        className="grid size-28 place-items-center rounded-full"
        style={{ background: "var(--re-pill-strong)", color: "var(--re-accent-ink)", boxShadow: "0 20px 50px -18px var(--re-pill-glow)" }}
        animate={{ scale: busy ? [1, 1.06, 1] : 1 }}
        transition={{ duration: 1, repeat: busy ? Infinity : 0 }}
      >
        <span className="re-serif text-5xl italic">H</span>
      </motion.span>
    </div>
  );
}

/** Connected: Haven's voice bars plus the running transcript. */
function LiveConsole() {
  const { state, audioTrack } = useVoiceAssistant();
  const transcriptions = useTranscriptions();
  const lines = useMemo(() => {
    const byId = new Map<string, { id: string; who: "you" | "haven"; text: string }>();
    for (const t of transcriptions) {
      byId.set(t.streamInfo.id, {
        id: t.streamInfo.id,
        who: t.participantInfo.identity.startsWith("customer-") ? "you" : "haven",
        text: t.text,
      });
    }
    return [...byId.values()].slice(-8);
  }, [transcriptions]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [lines.length]);

  return (
    <div className="flex h-full w-full min-h-0 flex-col items-center gap-3">
      <div className="grid size-28 shrink-0 place-items-center rounded-full" style={{ background: "var(--re-surface-2)" }}>
        <BarVisualizer
          state={state}
          barCount={5}
          trackRef={audioTrack}
          className="flex h-12 items-center justify-center gap-1.5 [&_.lk-audio-bar]:w-2.5 [&_.lk-audio-bar]:rounded-full [&_.lk-audio-bar]:bg-[var(--re-line)] [&_.lk-audio-bar[data-lk-highlighted=true]]:bg-[var(--re-accent)]"
          options={{ minHeight: 8, maxHeight: 44 }}
        />
      </div>
      <p className="text-xs font-medium capitalize text-[var(--re-muted)]">Haven is {state === "speaking" ? "speaking" : state === "thinking" ? "thinking" : "listening"}</p>
      <div className="min-h-0 w-full flex-1 space-y-2 overflow-y-auto text-sm">
        {lines.length === 0 ? <p className="text-center text-xs text-[var(--re-muted)]">Say hello to start.</p> : null}
        {lines.map((l) => (
          <p
            key={l.id}
            className={cn("w-fit max-w-[90%] rounded-2xl px-3 py-2", l.who === "you" ? "ml-auto rounded-br-sm" : "rounded-bl-sm border")}
            style={l.who === "you" ? { background: "var(--re-ink)", color: "var(--re-bg)" } : { borderColor: "var(--re-line)" }}
          >
            {l.text}
          </p>
        ))}
        <div ref={end} />
      </div>
    </div>
  );
}
