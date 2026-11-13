"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useInView } from "framer-motion";
import { ArrowLeft, ArrowRight, BarChart3, CalendarCheck, Compass, Mic } from "lucide-react";

import { HomeCard } from "@/components/site/HomeCard";
import { MvpSlider } from "./MvpSlider";
import { useShortlist } from "@/components/site/shortlist";
import type { ListingSummary } from "@/lib/listing-summary";
import { money } from "@/lib/listing-summary";
import { cn } from "@/lib/utils";

const BED_TABS = [
  { key: -1, label: "All" },
  { key: 0, label: "Studio" },
  { key: 1, label: "1 bed" },
  { key: 2, label: "2 bed" },
  { key: 3, label: "3 bed+" },
];

export function LandingSections({ listings: all }: { listings: ListingSummary[] }) {
  const listings = useMemo(() => all.filter((l) => l.deal === "let"), [all]);
  const shortlist = useShortlist();
  const [beds, setBeds] = useState(-1);
  const railRef = useRef<HTMLDivElement>(null);

  const stats = useMemo(() => {
    const prices = listings.map((l) => l.price).filter(Boolean).sort((a, b) => a - b);
    const perBed = listings.filter((l) => l.bedrooms > 0 && l.price);
    return {
      count: listings.length,
      median: prices[Math.floor(prices.length / 2)] ?? 0,
      min: prices[0] ?? 0,
      perBed: perBed.reduce((s, l) => s + l.price / l.bedrooms, 0) / Math.max(1, perBed.length),
    };
  }, [listings]);

  const byBeds = useMemo(() => {
    const groups = [0, 1, 2, 3].map((b) => {
      const g = listings.filter((l) => (b === 3 ? l.bedrooms >= 3 : l.bedrooms === b) && l.price);
      return {
        b,
        label: b === 0 ? "Studio" : b === 3 ? "3 bed+" : `${b} bed`,
        n: g.length,
        avg: g.reduce((s, l) => s + l.price, 0) / Math.max(1, g.length),
      };
    });
    const max = Math.max(...groups.map((g) => g.avg));
    return { groups, max };
  }, [listings]);

  const featured = useMemo(() => {
    const pool = listings.filter((l) => l.image && (beds < 0 || (beds === 3 ? l.bedrooms >= 3 : l.bedrooms === beds)));
    return [...pool].sort((a, b) => b.liveDate.localeCompare(a.liveDate)).slice(0, 10);
  }, [listings, beds]);

  const scrollRail = (dir: 1 | -1) =>
    railRef.current?.scrollBy({ left: dir * Math.min(720, window.innerWidth * 0.8), behavior: "smooth" });

  return (
    <div id="discover" className="re-page">
      {/* ---------- Stats ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">Live market</p>
            <h2 className="mt-3 text-4xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
              Riverside East London, <span className="re-serif italic text-[var(--re-muted)]">in numbers.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-md text-base leading-relaxed text-[var(--re-muted)] lg:justify-self-end">
              Every figure on this site is calculated from the current listings, so it updates as homes come on and
              off the market.
            </p>
          </Reveal>
        </div>
        <dl className="mt-12 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Homes to let" value={stats.count} />
          <Stat label="Median rent" value={stats.median} prefix="£" suffix=" pcm" />
          <Stat label="Starting from" value={stats.min} prefix="£" suffix=" pcm" />
          <Stat label="Average per bedroom" value={Math.round(stats.perBed / 10) * 10} prefix="£" suffix=" pcm" />
        </dl>
      </section>

      {/* ---------- Featured rail ---------- */}
      <section className="pb-20 sm:pb-28">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">Just listed</p>
            <h2 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">
              Newest homes <span className="re-serif italic">on the river</span>
            </h2>
          </Reveal>
          <div className="flex items-center gap-2">
            <div className="re-scroll-x flex gap-1.5 overflow-x-auto">
              {BED_TABS.map((t) => (
                <button key={t.key} type="button" className="re-chip" aria-pressed={beds === t.key} onClick={() => setBeds(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="hidden gap-1.5 sm:flex">
              <button type="button" onClick={() => scrollRail(-1)} className="re-btn re-btn-ghost size-10 p-0" aria-label="Scroll left">
                <ArrowLeft className="size-4" />
              </button>
              <button type="button" onClick={() => scrollRail(1)} className="re-btn re-btn-ghost size-10 p-0" aria-label="Scroll right">
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={railRef}
          className="re-scroll-x mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 sm:px-6 lg:px-[max(2rem,calc((100vw-80rem)/2+2rem))]"
        >
          <AnimatePresence mode="popLayout">
            {featured.map((l, i) => (
              <div key={l.id} className="w-[78vw] max-w-[340px] shrink-0 snap-start">
                <HomeCard
                  listing={l}
                  index={i}
                  saved={shortlist.has(l.id)}
                  onSave={shortlist.toggle}
                />
              </div>
            ))}
          </AnimatePresence>
          <Link
            href="/explore"
            className="re-card group flex w-[60vw] max-w-[240px] shrink-0 snap-start flex-col items-center justify-center gap-3 text-center"
          >
            <span className="inline-flex size-14 items-center justify-center rounded-full transition-transform group-hover:scale-110" style={{ background: "var(--re-accent-soft)", color: "#2b2210" }}>
              <ArrowRight className="size-5" />
            </span>
            <span className="text-lg font-medium">See all {all.length} homes</span>
          </Link>
        </div>
      </section>

      {/* ---------- Market preview ---------- */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
        <div className="re-card grid gap-10 overflow-hidden p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr]">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">Know the market</p>
            <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
              What does each extra bedroom <span className="re-serif italic">really cost?</span>
            </h2>
            <p className="mt-4 max-w-md text-[var(--re-muted)]">
              Average monthly rent by size across today&apos;s listings. Open the market dashboard to slice it by
              postcode, type and furnishing.
            </p>
            <Link href="/market" className="re-btn re-btn-ink mt-8">
              <BarChart3 className="size-4" /> Open market dashboard
            </Link>
          </Reveal>
          <BedBars groups={byBeds.groups} max={byBeds.max} />
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-10 px-4 pb-24 sm:px-6 lg:px-8">
        <Reveal>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">How it works</p>
          <h2 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">
            From first look to <span className="re-serif italic">front door</span>, in three steps.
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <Compass className="size-5" />,
              title: "Explore and compare",
              body: "Filter by budget and bedrooms, see every home on the map, and line up to three side by side.",
              href: "/explore",
              cta: "Browse homes",
            },
            {
              icon: <Mic className="size-5" />,
              title: "Ask Haven, our AI agent",
              body: "Talk through the floor plan, commute, bills and the area. It answers from verified listing facts.",
              href: "/haven",
              cta: "Talk to Haven",
              voice: true,
            },
            {
              icon: <CalendarCheck className="size-5" />,
              title: "Book a viewing",
              body: "Pick a day and time by voice. Your booking appears on the market dashboard straight away.",
              href: "/market#viewings",
              cta: "See viewings",
            },
          ].map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08}>
              <div className="re-card re-spot group flex h-full flex-col p-6" onPointerMove={spot}>
                <div className="flex items-center justify-between">
                  <span className="inline-flex size-11 items-center justify-center rounded-full" style={{ background: "var(--re-accent-soft)", color: "#2b2210" }}>
                    {s.icon}
                  </span>
                  <span className="re-serif text-4xl text-[var(--re-muted)]">0{i + 1}</span>
                </div>
                <h3 className="mt-6 text-xl font-medium">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--re-muted)]">{s.body}</p>
                {s.voice ? <VoiceWave /> : <div className="h-6" />}
                <Link href={s.href} className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold">
                  {s.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <MvpSlider />

      <footer className="border-t" style={{ borderColor: "var(--re-line)" }}>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-[var(--re-muted)] sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>Hamptons AI Lettings · Canary Wharf &amp; Docklands</span>
          <span>Listings data from the current catalogue; figures update automatically.</span>
        </div>
      </footer>
    </div>
  );
}

function spot(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0.8, 0.2, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}

function Stat({ label, value, prefix = "", suffix = "" }: { label: string; value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, value, { duration: 1.4, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => setShown(Math.round(v)) });
    return () => c.stop();
  }, [inView, value]);
  return (
    <div className="re-card re-spot p-5 sm:p-6" onPointerMove={spot}>
      <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--re-muted)]">{label}</dt>
      <dd ref={ref as React.RefObject<HTMLElement>} className="mt-3 text-3xl font-medium tabular-nums tracking-tight sm:text-5xl">
        {prefix}
        {shown.toLocaleString("en-GB")}
        <span className="text-sm font-normal text-[var(--re-muted)] sm:text-base">{suffix}</span>
      </dd>
    </div>
  );
}

function BedBars({ groups, max }: { groups: { b: number; label: string; n: number; avg: number }[]; max: number }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex h-72 items-end gap-3 sm:gap-5" role="list" aria-label="Average rent by bedrooms">
      {groups.map((g, i) => {
        const pct = max ? (g.avg / max) * 100 : 0;
        const on = hover === null || hover === g.b;
        return (
          <div
            key={g.b}
            role="listitem"
            className="flex h-full flex-1 cursor-default flex-col items-center justify-end gap-2"
            onPointerEnter={() => setHover(g.b)}
            onPointerLeave={() => setHover(null)}
          >
            <motion.span
              animate={{ opacity: on ? 1 : 0.4, y: hover === g.b ? -4 : 0 }}
              className="text-sm font-semibold tabular-nums"
            >
              {g.n ? money(g.avg) : "—"}
            </motion.span>
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: `${pct * 0.78}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: i * 0.08, ease: [0.2, 0.8, 0.2, 1] }}
              className={cn("w-full rounded-t-xl transition-opacity", on ? "opacity-100" : "opacity-40")}
              style={{
                background:
                  hover === g.b
                    ? "var(--re-pill-strong)"
                    : "linear-gradient(180deg,color-mix(in srgb,var(--re-accent) 85%,transparent),color-mix(in srgb,var(--re-accent) 35%,transparent))",
              }}
            />
            <span className="text-xs text-[var(--re-muted)]">
              {g.label} <span className="opacity-70">· {g.n}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function VoiceWave() {
  return (
    <div className="mt-5 flex h-6 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: 28 }).map((_, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: "var(--re-accent)" }}
          animate={{ height: [4, 6 + ((i * 7) % 16), 4] }}
          transition={{ duration: 1 + (i % 5) * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.04 }}
        />
      ))}
    </div>
  );
}
