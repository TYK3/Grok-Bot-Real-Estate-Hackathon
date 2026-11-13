"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BarChart3, CalendarCheck, KeyRound, MapPin, Mic, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

type Mvp = {
  key: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  cta: string;
  preview: React.ReactNode;
};

const MVPS: Mvp[] = [
  {
    key: "voice",
    icon: <Mic className="size-5" />,
    title: "Talk to Haven",
    body: "A voice agent that knows every listing, floor plan and verified fact. Ask anything, out loud.",
    href: "/haven",
    cta: "Talk to Haven",
    preview: <VoicePreview />,
  },
  {
    key: "near",
    icon: <MapPin className="size-5" />,
    title: "Find homes near what matters",
    body: "“Two beds near a park under £2,500.” Haven ranks every home by walking time and pins them on the map.",
    href: "/haven?try=near",
    cta: "Try a search",
    preview: <MapPreview />,
  },
  {
    key: "facts",
    icon: <ShieldCheck className="size-5" />,
    title: "Every fact checked",
    body: "Brochures, surveys and price lists are compared. Contradictions are flagged and resolved before buyers see them.",
    href: "/facts",
    cta: "See fact checks",
    preview: <FactsPreview />,
  },
  {
    key: "viewing",
    icon: <CalendarCheck className="size-5" />,
    title: "Book a viewing",
    body: "Pick a day and time by voice. The slot is saved instantly and shows up on the viewings board.",
    href: "/haven?try=viewing",
    cta: "Book by voice",
    preview: <CalendarPreview />,
  },
  {
    key: "reserve",
    icon: <KeyRound className="size-5" />,
    title: "Quick reserve",
    body: "Ready to take it? Haven records a holding reservation and hands you a reference. No payment online.",
    href: "/haven?try=reserve",
    cta: "Reserve a home",
    preview: <ReceiptPreview />,
  },
  {
    key: "market",
    icon: <BarChart3 className="size-5" />,
    title: "Market at a glance",
    body: "Rent bands, averages by bedrooms and area, and live viewings. Every chart filters the others.",
    href: "/market",
    cta: "Open the dashboard",
    preview: <BarsPreview />,
  },
];

/** Expanding-panel showcase of the product's MVPs: the active panel grows, the rest fold into strips. */
export function MvpSlider() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (paused || reduce) return;
    const t = window.setTimeout(() => setActive((a) => (a + 1) % MVPS.length), 5000);
    return () => window.clearTimeout(t);
  }, [active, paused, reduce]);

  return (
    <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8" aria-roledescription="carousel" aria-label="What you can do">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">What&apos;s inside</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <h2 className="max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">
          Six things you can <span className="re-serif italic">do right now</span>.
        </h2>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Choose a feature">
          {MVPS.map((m, i) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={m.title}
              onClick={() => setActive(i)}
              className="relative h-2 overflow-hidden rounded-full transition-all"
              style={{ width: i === active ? 36 : 8, background: "var(--re-surface-2)" }}
            >
              {i === active ? (
                <motion.span
                  key={`${active}-${paused}`}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: "var(--re-accent)" }}
                  initial={{ width: paused || reduce ? "100%" : "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: paused || reduce ? 0 : 5, ease: "linear" }}
                />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mt-10 flex flex-col gap-3 md:h-[440px] md:flex-row"
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {MVPS.map((m, i) => {
          const on = i === active;
          return (
            <div
              key={m.key}
              onPointerEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              className={cn(
                "re-card group relative cursor-pointer overflow-hidden transition-[flex-grow,height,box-shadow] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
                on ? "h-[400px] md:h-auto md:grow-[6]" : "h-[68px] md:h-auto md:grow",
              )}
              style={{ flexBasis: 0, boxShadow: on ? "var(--re-shadow)" : undefined }}
            >
              {/* Folded strip */}
              <div
                className={cn(
                  "absolute inset-0 flex items-center gap-3 px-5 transition-opacity duration-300 md:flex-col md:justify-between md:px-0 md:py-6",
                  on ? "pointer-events-none opacity-0" : "opacity-100",
                )}
              >
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--re-surface-2)" }}>
                  {m.icon}
                </span>
                <span className="text-sm font-medium md:[writing-mode:vertical-rl] md:rotate-180 md:whitespace-nowrap">{m.title}</span>
                <span className="re-serif ml-auto text-2xl text-[var(--re-muted)] md:ml-0">0{i + 1}</span>
              </div>

              {/* Expanded panel */}
              <AnimatePresence>
                {on ? (
                  <motion.div
                    key="open"
                    className="absolute inset-0 grid grid-rows-[auto_1fr] gap-5 p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:grid-rows-1 md:p-8"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { delay: 0.18, duration: 0.35 } }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex size-11 items-center justify-center rounded-full" style={{ background: "var(--re-pill)", color: "var(--re-accent-ink)" }}>
                          {m.icon}
                        </span>
                        <span className="re-serif text-3xl text-[var(--re-muted)]">0{i + 1}</span>
                      </div>
                      <h3 className="mt-5 text-2xl font-medium tracking-tight sm:text-3xl">{m.title}</h3>
                      <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--re-muted)] sm:text-base">{m.body}</p>
                      <Link href={m.href} className="re-btn re-btn-primary mt-auto w-fit gap-2" onClick={(e) => e.stopPropagation()}>
                        {m.cta} <ArrowRight className="size-4" />
                      </Link>
                    </div>
                    <div className="hidden min-h-0 md:block">{m.preview}</div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Small live previews (pure CSS/SVG, theme-aware) ---------- */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full overflow-hidden rounded-2xl border" style={{ borderColor: "var(--re-line)", background: "var(--re-surface-2)" }}>
      {children}
    </div>
  );
}

function VoicePreview() {
  return (
    <Frame>
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <div className="relative grid size-28 place-items-center">
          <motion.span className="absolute inset-0 rounded-full" style={{ background: "var(--re-pill)" }} animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.2, 0.5] }} transition={{ duration: 2.4, repeat: Infinity }} />
          <span className="relative grid size-20 place-items-center rounded-full" style={{ background: "var(--re-pill-strong)", color: "var(--re-accent-ink)" }}>
            <Mic className="size-8" />
          </span>
        </div>
        <div className="w-full max-w-xs space-y-2 text-sm">
          <p className="ml-auto w-fit rounded-2xl rounded-br-sm px-3 py-2" style={{ background: "var(--re-ink)", color: "var(--re-bg)" }}>Is the second bedroom a double?</p>
          <p className="w-fit rounded-2xl rounded-bl-sm border px-3 py-2" style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}>Yes — 3.4 by 2.9 metres, per the floor plan.</p>
        </div>
      </div>
    </Frame>
  );
}

function MapPreview() {
  const pins = [
    { x: 30, y: 40, l: "4 min" },
    { x: 58, y: 28, l: "6 min" },
    { x: 66, y: 62, l: "9 min" },
    { x: 40, y: 70, l: "11 min" },
  ];
  return (
    <Frame>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full opacity-60" aria-hidden>
        <path d="M0 55 C 25 45, 45 65, 100 48" stroke="var(--re-line)" strokeWidth="6" fill="none" />
        <path d="M45 0 L 52 100" stroke="var(--re-line)" strokeWidth="3" fill="none" />
        <circle cx="48" cy="48" r="13" fill="color-mix(in srgb, var(--re-good) 25%, transparent)" />
      </svg>
      <span className="absolute left-[48%] top-[48%] -translate-x-1/2 -translate-y-1/2 text-[11px] font-semibold text-[var(--re-good)]">Park</span>
      {pins.map((p, i) => (
        <motion.span
          key={p.l}
          className="re-pin absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3 + i * 0.15, type: "spring", stiffness: 400, damping: 20 }}
        >
          <span className="text-[11px]">#{i + 1} · {p.l}</span>
        </motion.span>
      ))}
    </Frame>
  );
}

function FactsPreview() {
  return (
    <Frame>
      <div className="flex h-full flex-col justify-center gap-3 p-6 text-sm">
        <div className="rounded-xl border p-3 opacity-60" style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}>
          <p className="text-xs text-[var(--re-muted)]">Brochure · p.2</p>
          <p className="re-serif mt-1 text-lg italic line-through">“5 parking spaces”</p>
        </div>
        <div className="rounded-xl border-2 p-3" style={{ borderColor: "var(--re-good)", background: "var(--re-surface)" }}>
          <div className="flex items-center justify-between text-xs text-[var(--re-muted)]">
            <span>Measured survey · p.4</span>
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--re-good)]"><ShieldCheck className="size-3.5" /> Published</span>
          </div>
          <p className="re-serif mt-1 text-lg italic">“6 parking spaces”</p>
        </div>
      </div>
    </Frame>
  );
}

function CalendarPreview() {
  return (
    <Frame>
      <div className="grid h-full grid-cols-7 content-center gap-1.5 p-6">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-center text-[11px] font-semibold text-[var(--re-muted)]">{d}</span>
        ))}
        {Array.from({ length: 28 }, (_, i) => (
          <span
            key={i}
            className="grid aspect-square place-items-center rounded-lg text-xs"
            style={i === 17 ? { background: "var(--re-pill-strong)", color: "var(--re-accent-ink)", fontWeight: 600 } : { background: "var(--re-surface)" }}
          >
            {i + 1}
          </span>
        ))}
        <span className="col-span-7 mt-2 text-center text-xs text-[var(--re-muted)]">Thu 18 · 14:00 viewing confirmed</span>
      </div>
    </Frame>
  );
}

function ReceiptPreview() {
  return (
    <Frame>
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-[260px] rounded-xl border p-4 text-sm" style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--re-good)]">Example · reservation requested</p>
          <p className="mt-2 font-medium">Clyde Square, E14</p>
          <div className="mt-3 space-y-1.5 border-t pt-3 text-xs text-[var(--re-muted)]" style={{ borderColor: "var(--re-line)" }}>
            <p className="flex justify-between"><span>Reference</span><span className="font-mono text-[var(--re-ink)]">HV-7Q2K9</span></p>
            <p className="flex justify-between"><span>Move in</span><span className="text-[var(--re-ink)]">1 Dec 2026</span></p>
            <p className="flex justify-between"><span>Payment</span><span className="text-[var(--re-ink)]">None online</span></p>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function BarsPreview() {
  const bars = [38, 62, 84, 55, 30, 18];
  return (
    <Frame>
      <div className="flex h-full items-end gap-2 p-6">
        {bars.map((h, i) => (
          <motion.span
            key={i}
            className="flex-1 rounded-t-md"
            style={{ background: i === 2 ? "var(--re-accent)" : "color-mix(in srgb, var(--re-accent) 35%, transparent)" }}
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: i * 0.06, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          />
        ))}
      </div>
    </Frame>
  );
}
