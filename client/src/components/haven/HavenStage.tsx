"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, CalendarCheck, FileText, Footprints, KeyRound, ShieldCheck } from "lucide-react";

import type { AgreementStage, MapStage, PriceStage, ReservationStage, StageData, ViewingStage } from "@/lib/haven-types";
import type { ListingSummary } from "@/lib/listing-summary";
import { money } from "@/lib/listing-summary";
import { cn } from "@/lib/utils";

const ListingsMap = dynamic(() => import("@/components/explore/ListingsMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse" style={{ background: "var(--re-surface-2)" }} />,
});

/** Haven's live stage: renders whatever Haven is doing right now. */
export function HavenStage({ stage, listings }: { stage: StageData; listings: ListingSummary[] }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage.kind + JSON.stringify(stage.data).length}
        initial={{ opacity: 0, y: 14, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
        className="h-full min-h-0"
      >
        {stage.kind === "map" ? <MapView data={stage.data} listings={listings} /> : null}
        {stage.kind === "price" ? <PriceView data={stage.data} /> : null}
        {stage.kind === "agreement" ? <AgreementView data={stage.data} /> : null}
        {stage.kind === "viewing" ? <ViewingView data={stage.data} /> : null}
        {stage.kind === "reservation" ? <ReservationView data={stage.data} /> : null}
      </motion.div>
    </AnimatePresence>
  );
}

function Heading({ eyebrow, title, children }: { eyebrow: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--re-accent)]">{eyebrow}</p>
        <h3 className="mt-1 text-xl font-medium tracking-tight sm:text-2xl">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* ---------- Map: homes ranked by walking time ---------- */

function MapView({ data, listings }: { data: MapStage; listings: ListingSummary[] }) {
  const [active, setActive] = useState<string | null>(data.results[0]?.id ?? null);
  const pins = useMemo(() => {
    const byId = new Map(listings.map((l) => [l.id, l]));
    return data.results.flatMap((r) => {
      const l = byId.get(r.id);
      return l ? [l] : [];
    });
  }, [data.results, listings]);
  const filters = [
    data.max_price ? `under ${money(data.max_price)}` : null,
    data.min_bedrooms ? `${data.min_bedrooms}+ beds` : null,
  ].filter(Boolean);

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-rows-[auto_minmax(0,1fr)]">
      <Heading
        eyebrow="Find homes near what matters"
        title={
          <>
            Closest to a <span className="re-serif italic">{data.amenity}</span>
            {filters.length ? <span className="text-[var(--re-muted)]"> · {filters.join(", ")}</span> : null}
          </>
        }
      />
      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="h-[300px] overflow-hidden rounded-2xl border lg:h-auto" style={{ borderColor: "var(--re-line)" }}>
          <ListingsMap listings={pins} activeId={active} onHover={(id) => id && setActive(id)} onSelect={setActive} />
        </div>
        <ol className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
          {data.results.length === 0 ? (
            <li className="rounded-xl border p-4 text-sm text-[var(--re-muted)]" style={{ borderColor: "var(--re-line)" }}>
              No homes match those filters yet.
            </li>
          ) : null}
          {data.results.map((r, i) => (
            <motion.li
              key={r.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 * i }}
              onPointerEnter={() => setActive(r.id)}
              className={cn(
                "group flex items-center gap-3 rounded-xl border p-3 transition-colors",
                active === r.id ? "bg-[var(--re-surface-2)]" : "bg-[var(--re-surface)]",
              )}
              style={{ borderColor: active === r.id ? "var(--re-accent)" : "var(--re-line)" }}
            >
              <span className="re-serif w-6 text-center text-2xl text-[var(--re-muted)]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-[var(--re-muted)]">
                  {r.price} · {r.bedrooms} bed · near {r.nearest}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--re-accent-soft)", color: "var(--re-accent-ink)" }}>
                <Footprints className="size-3.5" /> {r.walk_minutes} min
              </span>
              <Link href={`/property/${encodeURIComponent(r.id)}`} aria-label={`Open ${r.title}`} className="text-[var(--re-muted)] hover:text-[var(--re-ink)]">
                <ArrowUpRight className="size-4" />
              </Link>
            </motion.li>
          ))}
          <li className="px-1 pt-1 text-[11px] text-[var(--re-muted)]">Straight-line distance at walking pace, from OpenStreetMap data.</li>
        </ol>
      </div>
    </div>
  );
}

/* ---------- Price check: where this rent sits among comparable homes ---------- */

function PriceView({ data }: { data: PriceStage }) {
  const [hover, setHover] = useState<number | null>(null);
  const lo = Math.min(data.min, data.price);
  const hi = Math.max(data.max, data.price);
  const pos = (v: number) => `${hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100}%`;
  const below = data.delta_pct < 0;

  return (
    <div className="flex h-full flex-col gap-6">
      <Heading eyebrow="Price check" title={<>{data.title} <span className="text-[var(--re-muted)]">· {money(data.price)} pcm</span></>} />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: `Average of ${data.count} ${data.basis}`, value: money(data.average) },
          { label: "Versus average", value: `${below ? "−" : "+"}${Math.abs(data.delta_pct)}%`, tone: below ? "var(--re-good)" : "var(--re-warm)" },
          { label: "Comparable homes cheaper", value: `${data.percentile}%` },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border p-4" style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}>
            <p className="text-xs text-[var(--re-muted)]">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums" style={k.tone ? { color: k.tone } : undefined}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Strip plot: each dot is a comparable home's rent */}
      <div className="rounded-2xl border p-5" style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}>
        <div className="relative h-24">
          <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: "var(--re-line)" }} />
          <div className="absolute top-2 bottom-2 w-px" style={{ left: pos(data.average), background: "var(--re-muted)" }}>
            <span className="absolute -top-1 left-1.5 whitespace-nowrap text-[11px] text-[var(--re-muted)]">avg {money(data.average)}</span>
          </div>
          {data.prices.map((v, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Comparable home at ${money(v)}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 p-1.5"
              style={{ left: pos(v) }}
            >
              <motion.span
                className="block size-3 rounded-full"
                style={{ background: "color-mix(in srgb, var(--re-ink) 35%, transparent)", outline: "2px solid var(--re-surface)" }}
                initial={{ scale: 0 }}
                animate={{ scale: hover === i ? 1.5 : 1 }}
                transition={{ delay: hover === null ? i * 0.02 : 0 }}
              />
              {hover === i ? (
                <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold" style={{ background: "var(--re-ink)", color: "var(--re-bg)" }}>
                  {money(v)}
                </span>
              ) : null}
            </button>
          ))}
          <motion.div
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos(data.price) }}
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: "-50%", opacity: 1 }}
            transition={{ delay: 0.4, type: "spring", stiffness: 300, damping: 18 }}
          >
            <span className="block size-5 rounded-full" style={{ background: "var(--re-accent)", outline: "3px solid var(--re-surface)" }} />
            <span className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap text-xs font-semibold">This home</span>
          </motion.div>
        </div>
        <div className="mt-6 flex justify-between text-[11px] text-[var(--re-muted)] tabular-nums">
          <span>{money(lo)}</span>
          <span>{money(hi)} pcm</span>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--re-muted)]">Closest in price</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {data.comparables.map((c) => (
            <Link key={c.id} href={`/property/${encodeURIComponent(c.id)}`} className="re-chip">
              {c.title} · {money(c.price)}
            </Link>
          ))}
        </div>
      </div>
      <p className="mt-auto text-[11px] text-[var(--re-muted)]">Asking rents from our own listings only. Every number traces back to a listing.</p>
    </div>
  );
}

/* ---------- Agreement answers with cited clauses ---------- */

function AgreementView({ data }: { data: AgreementStage }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <Heading eyebrow="Tenancy agreement" title={<span className="re-serif italic">“{data.question}”</span>} />
      <div className="grid gap-3">
        {data.clauses.length === 0 ? (
          <p className="rounded-xl border p-4 text-sm text-[var(--re-muted)]" style={{ borderColor: "var(--re-line)" }}>
            Our standard terms don&apos;t cover that, so Haven will check with the lettings team instead of guessing.
          </p>
        ) : null}
        {data.clauses.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            className="rounded-2xl border p-4"
            style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full px-2 py-0.5 font-semibold" style={{ background: "var(--re-accent-soft)", color: "var(--re-accent-ink)" }}>Clause {c.id}</span>
              <span className="font-medium">{c.title}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed">{c.text}</p>
          </motion.div>
        ))}
      </div>
      {data.listing.length ? (
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--re-line)" }}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--re-muted)]">For this home</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {data.listing.map((f) => (
              <div key={f.label} className="flex flex-col">
                <dt className="text-xs text-[var(--re-muted)]">{f.label}</dt>
                <dd className="font-medium capitalize">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <p className="mt-auto flex items-start gap-2 text-[11px] text-[var(--re-muted)]">
        <FileText className="mt-0.5 size-3.5 shrink-0" />
        <span>Source: {data.document}{data.version ? ` (${data.version})` : ""}. {data.disclaimer}</span>
      </p>
    </div>
  );
}

/* ---------- Viewing booked ---------- */

function ViewingView({ data }: { data: ViewingStage }) {
  const day = new Date(`${data.date}T00:00:00`);
  const valid = !Number.isNaN(day.getTime());
  const first = valid ? new Date(day.getFullYear(), day.getMonth(), 1) : null;
  const daysIn = valid ? new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate() : 0;
  const offset = first ? (first.getDay() + 6) % 7 : 0;

  return (
    <div className="flex h-full flex-col gap-5">
      <Heading eyebrow="Viewing booked" title={data.title ?? "Your viewing"}>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--re-good) 16%, transparent)", color: "var(--re-good)" }}>
          <CalendarCheck className="size-3.5" /> {data.status === "confirmed" || !data.status ? "Confirmed" : data.status}
        </span>
      </Heading>
      {valid ? (
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}>
          <p className="text-sm font-medium">{day.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
          <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d} className="text-[var(--re-muted)]">{d}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => <span key={`o${i}`} />)}
            {Array.from({ length: daysIn }, (_, i) => {
              const on = i + 1 === day.getDate();
              return (
                <motion.span
                  key={i}
                  className="grid aspect-square place-items-center rounded-lg"
                  style={on ? { background: "var(--re-pill-strong)", color: "var(--re-accent-ink)", fontWeight: 600 } : { background: "var(--re-surface-2)" }}
                  initial={on ? { scale: 0.4 } : false}
                  animate={on ? { scale: 1 } : undefined}
                  transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
                >
                  {i + 1}
                </motion.span>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Info label="When" value={`${valid ? day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }) : data.date}${data.time ? ` · ${data.time}` : ""}`} />
        <Info label="For" value={data.customer_name || "You"} />
      </div>
      <Link href="/market#viewings" className="mt-auto inline-flex items-center gap-1 text-sm font-semibold">
        See it on the viewings board <ArrowUpRight className="size-4" />
      </Link>
    </div>
  );
}

/* ---------- Quick reserve receipt ---------- */

function ReservationView({ data }: { data: ReservationStage }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <motion.div
        initial={{ rotateX: 60, opacity: 0 }}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
        className="w-full max-w-sm rounded-2xl border p-6"
        style={{ borderColor: "var(--re-line)", background: "var(--re-surface)", boxShadow: "var(--re-shadow)", transformPerspective: 800 }}
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--re-good)" }}>
          <KeyRound className="size-4" /> Reservation requested
        </div>
        <p className="mt-3 text-xl font-medium">{data.title}</p>
        {data.price ? <p className="text-sm text-[var(--re-muted)]">{data.price}</p> : null}
        <dl className="mt-4 space-y-2 border-t pt-4 text-sm" style={{ borderColor: "var(--re-line)" }}>
          <Row label="Reference" value={<span className="font-mono">{data.reference}</span>} />
          {data.customer_name ? <Row label="Name" value={data.customer_name} /> : null}
          {data.move_in_date ? <Row label="Move in" value={data.move_in_date} /> : null}
          <Row label="Payment" value="None taken online" />
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-[var(--re-muted)]">
          The lettings team calls you to confirm and explains the holding deposit (up to one week&apos;s rent).
        </p>
      </motion.div>
      <p className="flex items-center gap-1.5 text-xs text-[var(--re-muted)]">
        <ShieldCheck className="size-3.5" /> Haven never asks for card or bank details.
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--re-line)" }}>
      <p className="text-xs text-[var(--re-muted)]">{label}</p>
      <p className="mt-0.5 font-medium">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--re-muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
