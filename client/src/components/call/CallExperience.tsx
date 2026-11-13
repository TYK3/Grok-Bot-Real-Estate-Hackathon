"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Room, RoomEvent } from "livekit-client";
import {
  RoomAudioRenderer,
  RoomContext,
  StartAudio,
} from "@livekit/components-react";
import {
  ArrowLeft,
  CalendarCheck,
  MessageSquare,
  PhoneCall,
  X,
} from "lucide-react";
import "@livekit/components-styles";

import {
  PropertyCallPanel,
  type CallProperty,
  type CallSnapshot,
} from "@/components/call/PropertyCallPanel";
import { CallStage } from "@/components/call/CallStage";
import { GeneralSearchPanel } from "@/components/call/GeneralSearchPanel";

// Matches GENERAL_CALL_ID in app/call/[id]/page.tsx.
const GENERAL_CALL_ID = "general";

type CallState = "connecting" | "connected" | "ended" | "error";
type BookingToast = {
  key: string;
  slot: string;
  customerName?: string;
};

export function CallExperience({ property }: { property: CallProperty }) {
  const router = useRouter();
  const isGeneral = property.id === GENERAL_CALL_ID;
  const [room] = useState(
    () => new Room({ adaptiveStream: true, dynacast: true }),
  );
  const [callState, setCallState] = useState<CallState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [snapshot, setSnapshot] = useState<CallSnapshot>(null);
  const [bookingToast, setBookingToast] = useState<BookingToast | null>(null);
  const roomNameRef = useRef<string | null>(null);
  const shownBookingKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const onDisconnected = () => {
      if (!cancelled) setCallState("ended");
    };
    room.on(RoomEvent.Disconnected, onDisconnected);

    const start = async () => {
      try {
        const res = await fetch(
          `/api/token?property_id=${encodeURIComponent(property.id)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`Token request failed (${res.status})`);
        const { serverUrl, token, roomName } = await res.json();
        if (cancelled) return;
        roomNameRef.current = roomName;
        await room.connect(serverUrl, token);
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cancelled) return;
        setCallState("connected");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setCallState("error");
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.disconnect();
    };
  }, [room, property.id]);

  // Poll the agent's session folder for live booking/customer details.
  useEffect(() => {
    if (callState !== "connected") return;
    let cancelled = false;

    const poll = async () => {
      const roomName = roomNameRef.current;
      if (!roomName) return;
      try {
        const res = await fetch(
          `/api/sessions/${encodeURIComponent(roomName)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as CallSnapshot;
        if (!cancelled) setSnapshot(data);
      } catch {
        // session folder appears only after the agent accepts the call
      }
    };

    void poll();
    const interval = window.setInterval(poll, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [callState]);

  const handleEndCall = useCallback(() => {
    room.disconnect();
    router.push(isGeneral ? "/" : `/property/${property.id}`);
  }, [room, router, property.id, isGeneral]);

  useEffect(() => {
    const booking = snapshot?.booking;
    const date = booking?.date?.trim();
    if (!date) return;

    const status = booking?.status?.trim().toLowerCase();
    if (status && status !== "confirmed") return;

    const time = booking?.time?.trim();
    const key = `${date}|${time ?? ""}`;
    if (shownBookingKeysRef.current.has(key)) return;

    shownBookingKeysRef.current.add(key);
    setBookingToast({
      key,
      slot: formatBookingSlot(date, time),
      customerName:
        booking?.customer_name?.trim() || snapshot?.customer?.name?.trim(),
    });
  }, [
    snapshot?.booking?.customer_name,
    snapshot?.booking?.date,
    snapshot?.booking?.status,
    snapshot?.booking?.time,
    snapshot?.customer?.name,
  ]);

  useEffect(() => {
    if (!bookingToast) return;

    const timer = window.setTimeout(() => {
      setBookingToast((current) =>
        current?.key === bookingToast.key ? null : current,
      );
    }, 7000);

    return () => window.clearTimeout(timer);
  }, [bookingToast]);

  useRingtone(callState === "connecting");

  return (
    <RoomContext.Provider value={room}>
      <div className="relative min-h-screen w-full bg-[var(--re-bg)] text-[var(--re-ink)]">
        {error ? (
          <div
            role="alert"
            className="fixed left-1/2 top-5 z-50 w-[min(90vw,420px)] -translate-x-1/2 rounded-md border border-red-500/25 bg-[var(--re-surface)] px-4 py-3 text-sm shadow-lg backdrop-blur"
          >
            <p className="font-medium">Connection issue</p>
            <p className="mt-1 text-[var(--re-muted)]">{error}</p>
          </div>
        ) : null}

        {bookingToast ? (
          <div
            role="status"
            aria-live="polite"
            className="fixed right-4 top-16 z-50 w-[min(calc(100vw-2rem),420px)] rounded-lg border border-[#bde7c9] bg-[var(--re-surface)] p-4 shadow-2xl shadow-[var(--re-ink)]/15 sm:right-6"
          >
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#ecfdf3] text-[#16a34a]">
                <CalendarCheck className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#16a34a]">
                  Booking confirmed
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--re-ink)]">
                  Viewing booked for {bookingToast.slot}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--re-muted)]">
                  {bookingToast.customerName
                    ? `${bookingToast.customerName}'s viewing slot has been saved.`
                    : "This viewing slot has been saved during the call."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Dismiss booking confirmation"
                onClick={() => setBookingToast(null)}
                className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--re-muted)] transition-colors hover:bg-[var(--re-surface-2)] hover:text-[var(--re-ink)]"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : null}

        <header className="absolute left-4 top-4 z-10 flex items-center gap-3">
          <button
            type="button"
            onClick={handleEndCall}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--re-line)] bg-[var(--re-surface)] px-3 py-1.5 text-sm text-[var(--re-muted)] shadow-sm transition-colors hover:border-[var(--re-ink)] hover:text-[var(--re-ink)]"
          >
            <ArrowLeft className="size-4" />
            Back
          </button>
        </header>

        <header className="absolute right-4 top-4 z-10 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowChat((v) => !v)}
            aria-pressed={showChat}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors ${
              showChat
                ? "border-[var(--re-ink)] bg-[var(--re-ink)] text-[var(--re-bg)]"
                : "border-[var(--re-line)] bg-[var(--re-surface)] text-[var(--re-muted)] hover:border-[var(--re-ink)] hover:text-[var(--re-ink)]"
            }`}
          >
            <MessageSquare className="size-4" />
            Transcript
          </button>
        </header>

        <div
          className={`mx-auto grid min-h-screen w-full max-w-[92rem] grid-cols-1 gap-5 px-4 py-16 sm:px-6 lg:px-8 ${
            isGeneral
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(380px,520px)]"
              : "lg:grid-cols-[460px_minmax(0,1fr)]"
          }`}
        >
          {isGeneral ? null : (
            <PropertyCallPanel
              property={property}
              snapshot={snapshot}
              connected={callState === "connected"}
            />
          )}

          <section
            className={`flex min-h-[calc(100dvh-8rem)] min-w-0 items-center justify-center ${
              isGeneral ? "lg:order-first lg:justify-start" : "lg:justify-end"
            }`}
          >
            {callState === "connected" ? (
              <CallStage
                title={property.title}
                connectedLabel="Connected - you can speak now"
                showChat={showChat}
                onEndCall={handleEndCall}
              />
            ) : (
              <div className="flex h-[calc(100dvh-8rem)] w-full max-w-2xl flex-col items-center justify-center gap-10 rounded-lg border border-[var(--re-line)] bg-[var(--re-surface)] px-6 py-10 text-center shadow-sm">
                <div className="space-y-2">
                  <h1 className="font-heading text-4xl leading-tight sm:text-5xl">
                    {property.title}
                  </h1>
                  <p className="text-lg text-[var(--re-muted)]">
                    {callState === "error"
                      ? "Could not connect. Please try again."
                      : callState === "ended"
                        ? "Call ended."
                        : "Connecting..."}
                  </p>
                </div>
                <div className="relative grid size-64 place-items-center overflow-hidden rounded-full border border-[var(--re-line)] bg-[var(--re-bg)] shadow-inner">
                  <div className="absolute inset-3 animate-pulse rounded-full border border-[#e95650]/30" />
                  <div className="grid size-28 place-items-center rounded-full bg-[var(--re-ink)] text-[var(--re-bg)]">
                    <PhoneCall className="size-12" />
                  </div>
                </div>
                {callState === "ended" || callState === "error" ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/property/${property.id}`)}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#e95650] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#d94c46]"
                  >
                    {isGeneral ? "Back to home" : "Back to property"}
                  </button>
                ) : null}
              </div>
            )}
          </section>

          {isGeneral ? <GeneralSearchPanel snapshot={snapshot} /> : null}
        </div>

        <RoomAudioRenderer />
        <StartAudio
          label="Click to enable audio"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md border border-[var(--re-line)] bg-[var(--re-surface)] px-4 py-2 text-sm text-[var(--re-ink)] shadow-sm"
        />
      </div>
    </RoomContext.Provider>
  );
}

function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;

    let audioContext: AudioContext | null = null;
    let stopTimer: number | null = null;
    const oscillators: OscillatorNode[] = [];
    const ringDuration = 2;

    const stopTone = () => {
      for (const oscillator of oscillators.splice(0)) {
        try {
          oscillator.stop();
          oscillator.disconnect();
        } catch {
          // Already stopped.
        }
      }
    };

    const playTone = () => {
      if (!audioContext) return;
      stopTone();

      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + ringDuration,
      );
      gain.connect(audioContext.destination);

      for (const frequency of [440, 480]) {
        const oscillator = audioContext.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
        oscillator.connect(gain);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + ringDuration);
        oscillators.push(oscillator);
      }

      stopTimer = window.setTimeout(stopTone, ringDuration * 1000);
    };

    try {
      audioContext = new AudioContext();
      void audioContext.resume().then(playTone).catch(() => undefined);
    } catch {
      // Browsers may block audio before user activation; visual calling state still works.
    }

    return () => {
      if (stopTimer) window.clearTimeout(stopTimer);
      stopTone();
      void audioContext?.close().catch(() => undefined);
    };
  }, [active]);
}

function formatBookingSlot(date: string, time?: string) {
  return time ? `${date} at ${time}` : date;
}
