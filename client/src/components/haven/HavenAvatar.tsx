"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type HavenMood = "idle" | "listening" | "thinking" | "speaking";

/**
 * Haven's character: a small white bot with a dark face screen, glowing pill
 * eyes and a brass antenna light. It floats and blinks, looks towards the
 * pointer (`track`), shows three bouncing dots while it speaks or thinks, and
 * holds still under prefers-reduced-motion.
 */
export function HavenAvatar({
  size = 56,
  mood = "idle",
  track = false,
  className,
}: {
  size?: number;
  mood?: HavenMood;
  track?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!track) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, d / 260);
        setLook({ x: (dx / d) * 3 * k, y: (dy / d) * 2 * k });
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [track]);

  const eyes = mood === "thinking" ? { x: 2.5, y: -2 } : look;
  const eyeH = mood === "listening" ? 10 : mood === "thinking" ? 4 : 8.5;
  const glow = "#f3e3b8";

  return (
    <svg
      ref={ref}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn("haven-avatar", `is-${mood}`, className)}
      role="img"
      aria-label={`Haven${mood === "idle" ? "" : `, ${mood}`}`}
    >
      <defs>
        <linearGradient id={`hw-${id}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe3dc" />
        </linearGradient>
        <radialGradient id={`hg-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={glow} stopOpacity=".55" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="haven-float">
        {/* antenna */}
        <path d="M32 15V8.5" stroke="#dfe3dc" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="32" cy="7" r="5" fill={`url(#hg-${id})`} className="haven-beacon" />
        <circle cx="32" cy="7" r="2.8" fill="var(--re-accent)" />

        {/* ear pods */}
        <rect x="5" y="29" width="6" height="12" rx="3" fill={`url(#hw-${id})`} />
        <rect x="53" y="29" width="6" height="12" rx="3" fill={`url(#hw-${id})`} />

        {/* head */}
        <rect x="9" y="14" width="46" height="40" rx="17" fill={`url(#hw-${id})`} />
        <rect x="9.5" y="14.5" width="45" height="39" rx="16.5" fill="none" stroke="#ffffff" strokeOpacity=".9" />

        {/* face screen */}
        <rect x="15" y="21" width="34" height="25" rx="11" fill="#13241c" />

        {/* eyes */}
        <g className="haven-eyes">
          <g transform={`translate(${eyes.x} ${eyes.y})`} style={{ transition: "transform 160ms ease-out" }}>
            <rect x="22.5" y={32.5 - eyeH / 2} width="5" height={eyeH} rx="2.5" fill={glow} style={{ transition: "all 180ms ease" }} />
            <rect x="36.5" y={32.5 - eyeH / 2} width="5" height={eyeH} rx="2.5" fill={glow} style={{ transition: "all 180ms ease" }} />
          </g>
        </g>

        {/* mouth: three dots that bounce while speaking or thinking, a soft smile otherwise */}
        {mood === "speaking" || mood === "thinking" ? (
          <g className="haven-dots" fill={glow}>
            <circle cx="27.5" cy="41" r="1.5" />
            <circle cx="32" cy="41" r="1.5" />
            <circle cx="36.5" cy="41" r="1.5" />
          </g>
        ) : (
          <path d="M29 40.2q3 2.4 6 0" fill="none" stroke={glow} strokeWidth="1.8" strokeLinecap="round" opacity=".85" />
        )}
      </g>
    </svg>
  );
}
