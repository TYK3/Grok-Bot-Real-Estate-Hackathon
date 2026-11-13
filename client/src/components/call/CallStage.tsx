"use client";

import { useMemo } from "react";
import {
  BarVisualizer,
  useVoiceAssistant,
  useTranscriptions,
  useRoomContext,
} from "@livekit/components-react";
import { PhoneCall, PhoneOff } from "lucide-react";

import { Button } from "@/components/ui/button";

const STATE_LABELS: Record<string, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting...",
  "pre-connect-buffering": "Connecting...",
  initializing: "Connecting...",
  listening: "Connected",
  thinking: "Connected",
  speaking: "Connected",
  failed: "Connection failed",
};

type TranscriptLine = {
  id: string;
  role: "user" | "agent";
  text: string;
};

export function CallStage({
  title,
  connectedLabel,
  showChat,
  onEndCall,
}: {
  title: string;
  connectedLabel: string;
  showChat: boolean;
  onEndCall: () => void;
}) {
  const room = useRoomContext();
  const { state, audioTrack } = useVoiceAssistant();
  const transcriptions = useTranscriptions();

  const localIdentity = room.localParticipant?.identity;

  const lines = useMemo<TranscriptLine[]>(() => {
    const byId = new Map<string, TranscriptLine & { ts: number }>();
    for (const t of transcriptions) {
      const id = t.streamInfo.id;
      const role: "user" | "agent" =
        t.participantInfo.identity === localIdentity ? "user" : "agent";
      const ts =
        (t.streamInfo as { timestamp?: number }).timestamp ?? byId.size;
      byId.set(id, { id, role, text: t.text, ts });
    }
    return [...byId.values()]
      .sort((a, b) => a.ts - b.ts)
      .map(({ id, role, text }) => ({ id, role, text }));
  }, [transcriptions, localIdentity]);

  return (
    <div
      className={`flex h-[calc(100dvh-8rem)] w-full max-w-2xl flex-col items-center overflow-hidden rounded-lg border border-[var(--re-line)] bg-[var(--re-surface)] px-5 py-6 shadow-sm ${
        showChat ? "gap-4" : "justify-center gap-8"
      }`}
    >
      <div className="shrink-0 space-y-1 text-center">
        <h1 className="font-heading text-3xl leading-tight">{title}</h1>
        <p className="text-[var(--re-muted)]">{connectedLabel}</p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div
          className={`relative grid place-items-center overflow-hidden rounded-full border border-[var(--re-line)] bg-[var(--re-bg)] shadow-inner ${
            showChat ? "size-40" : "size-64"
          }`}
        >
          {!showChat ? (
            <>
              <div className="absolute inset-8 rounded-full border border-[#16a34a]/15" />
              <div className="absolute inset-12 animate-ping rounded-full bg-[#16a34a]/10" />
            </>
          ) : null}
          <div
            className={`relative z-10 grid place-items-center rounded-full bg-[#16a34a] text-white shadow-xl shadow-[#16a34a]/25 ${
              showChat ? "size-20" : "size-28"
            }`}
          >
            <PhoneCall className={showChat ? "size-9" : "size-12"} />
          </div>
          <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
            <BarVisualizer
              state={state}
              barCount={5}
              trackRef={audioTrack}
              className="flex h-10 items-center justify-center gap-1.5 [&_.lk-audio-bar]:w-2 [&_.lk-audio-bar]:rounded-full [&_.lk-audio-bar]:bg-[var(--re-surface-2)] [&_.lk-audio-bar[data-lk-highlighted=true]]:bg-[#16a34a]"
              options={{ minHeight: 8, maxHeight: 36 }}
            />
          </div>
        </div>
        <p className="text-sm font-medium text-[var(--re-muted)]">
          {STATE_LABELS[state] ?? state}
        </p>
      </div>

      {showChat ? (
        <div className="min-h-0 w-full flex-1 overflow-y-auto rounded-lg border border-[var(--re-line)] bg-[var(--re-bg)] p-3">
          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--re-muted)]">
              The conversation transcript will appear here.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className={`flex flex-col gap-1 ${
                    line.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-wide text-[var(--re-muted)]">
                    {line.role === "user" ? "You" : "Agent"}
                  </span>
                  <p
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      line.role === "user"
                        ? "bg-[var(--re-ink)] text-[var(--re-bg)]"
                        : "border border-[var(--re-line)] bg-[var(--re-surface)] text-[var(--re-ink)]"
                    }`}
                  >
                    {line.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex w-full shrink-0 items-center justify-center">
        <Button
          size="lg"
          variant="destructive"
          className="size-14 rounded-full bg-[#e95650] text-white shadow-lg shadow-[#e95650]/20 transition-all hover:bg-[#d94c46] hover:shadow-xl"
          onClick={onEndCall}
          aria-label="End call"
        >
          <PhoneOff className="size-6" />
        </Button>
      </div>
    </div>
  );
}
