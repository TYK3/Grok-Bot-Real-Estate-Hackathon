"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowUp, CalendarCheck, Mic, X } from "lucide-react";

import { Segmented } from "@/components/explore/ExploreView";
import { useTheme } from "@/components/site/theme";
import type { ListingSummary } from "@/lib/listing-summary";
import { bedsShort, money, typeColor, typeHex } from "@/lib/listing-summary";
import { cn } from "@/lib/utils";

type GroupBy = "beds" | "district" | "type";
type Filter = { bucket: number | null; group: string | null; type: string | null };
type SortKey = "price" | "bedrooms" | "district" | "liveDate" | "perBed";
type Booking = {
  sessionId: string;
  propertyId: string | null;
  date: string | null;
  time: string | null;
  customerName: string | null;
  status: string | null;
};

const BUCKET = 250;

const groupKey = (l: ListingSummary, by: GroupBy) =>
  by === "beds" ? (l.bedrooms >= 3 ? "3 bed+" : bedsShort(l.bedrooms)) : by === "district" ? l.district : l.type;

export function MarketDashboard({ listings: all }: { listings: ListingSummary[] }) {
  const [theme] = useTheme();
  const listings = useMemo(() => all.filter((l) => l.deal === "let" && l.price > 0), [all]);
  const [groupBy, setGroupBy] = useState<GroupBy>("beds");
  const [filter, setFilter] = useState<Filter>({ bucket: null, group: null, type: null });
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "price", dir: -1 });
  const [bookings, setBookings] = useState<Booking[] | null>(null);

  const c = theme === "dark"
    ? { accent: "#dcbc78", accentDim: "rgba(220,188,120,.28)", ink: "#efeee6", muted: "#9aa69e", grid: "rgba(239,238,230,.07)", surface: "#12221b" }
    : { accent: "#8a6420", accentDim: "rgba(138,100,32,.25)", ink: "#17261f", muted: "#67706a", grid: "rgba(23,38,31,.08)", surface: "#fffdf8" };

  useEffect(() => {
    fetch("/api/bookings")
      .then((r) => r.json())
      .then((d) => setBookings(Array.isArray(d.bookings) ? d.bookings : []))
      .catch(() => setBookings([]));
  }, []);

  // Each chart filters by every selection except its own, so it stays clickable.
  const matches = (l: ListingSummary, skip?: keyof Filter) =>
    (skip === "bucket" || filter.bucket === null || Math.floor(l.price / BUCKET) * BUCKET === filter.bucket) &&
    (skip === "group" || filter.group === null || groupKey(l, groupBy) === filter.group) &&
    (skip === "type" || filter.type === null || l.type === filter.type);

  const filtered = useMemo(() => listings.filter((l) => matches(l)), [listings, filter, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const kpis = useMemo(() => {
    const prices = filtered.map((l) => l.price).sort((a, b) => a - b);
    const perBed = filtered.filter((l) => l.bedrooms > 0);
    const latest = listings.reduce((m, l) => (l.liveDate > m ? l.liveDate : m), "");
    const cutoff = latest ? new Date(new Date(latest).getTime() - 30 * 864e5).toISOString().slice(0, 10) : "";
    return {
      count: filtered.length,
      median: prices[Math.floor(prices.length / 2)] ?? 0,
      perBed: perBed.reduce((s, l) => s + l.price / l.bedrooms, 0) / Math.max(1, perBed.length),
      fresh: filtered.filter((l) => l.liveDate >= cutoff).length,
      lo: prices[0] ?? 0,
      hi: prices[prices.length - 1] ?? 0,
    };
  }, [filtered, listings]);

  const histogram = useMemo(() => {
    const base = listings.filter((l) => matches(l, "bucket"));
    const lo = Math.floor(Math.min(...listings.map((l) => l.price)) / BUCKET) * BUCKET;
    const hi = Math.floor(Math.max(...listings.map((l) => l.price)) / BUCKET) * BUCKET;
    const rows = [];
    for (let b = lo; b <= hi; b += BUCKET) {
      rows.push({ bucket: b, label: `£${(b / 1000).toFixed(b % 1000 ? 2 : 0).replace(/0$/, "")}k`, n: base.filter((l) => Math.floor(l.price / BUCKET) * BUCKET === b).length });
    }
    return rows;
  }, [listings, filter, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const base = listings.filter((l) => matches(l, "group"));
    const m = new Map<string, number[]>();
    for (const l of base) {
      const k = groupKey(l, groupBy);
      m.set(k, [...(m.get(k) ?? []), l.price]);
    }
    const rows = [...m.entries()].map(([k, ps]) => ({ key: k, avg: Math.round(ps.reduce((a, b) => a + b, 0) / ps.length), n: ps.length }));
    const bedRank = (k: string) => (k === "Studio" ? 0 : parseInt(k, 10) || 9);
    if (groupBy === "beds") rows.sort((a, b) => bedRank(a.key) - bedRank(b.key));
    else rows.sort((a, b) => b.avg - a.avg);
    return rows;
  }, [listings, filter, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekly = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of filtered) {
      if (!l.liveDate) continue;
      const d = new Date(l.liveDate);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const k = d.toISOString().slice(0, 10);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    const keys = [...m.keys()].sort();
    if (!keys.length) return [];
    const out = [];
    for (let t = new Date(keys[0]).getTime(); t <= new Date(keys[keys.length - 1]).getTime(); t += 7 * 864e5) {
      const k = new Date(t).toISOString().slice(0, 10);
      out.push({ week: k, label: new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), n: m.get(k) ?? 0 });
    }
    return out.slice(-16);
  }, [filtered]);

  const mix = useMemo(() => {
    const base = listings.filter((l) => matches(l, "type"));
    const m = new Map<string, number>();
    for (const l of base) m.set(l.type, (m.get(l.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => ({ type, n, pct: n / Math.max(1, base.length) }));
  }, [listings, filter, groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const val = (l: ListingSummary) =>
      sort.key === "perBed" ? (l.bedrooms ? l.price / l.bedrooms : l.price) : (l[sort.key] as string | number);
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [filtered, sort]);

  const byId = useMemo(() => new Map(all.map((l) => [l.id, l])), [all]);
  const active = filter.bucket !== null || filter.group !== null || filter.type !== null;
  const toggle = (k: keyof Filter, v: string | number) =>
    setFilter((f) => ({ ...f, [k]: f[k] === v ? null : v }));

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 pb-6 pt-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">Market dashboard</p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">
            East London rentals <span className="re-serif italic text-[var(--re-muted)]">at a glance</span>
          </h1>
          <p className="mt-2 text-sm text-[var(--re-muted)]">Click any bar or segment to filter every chart and the table below.</p>
        </div>
        <Segmented
          id="groupby"
          label="Group average rent by"
          value={groupBy}
          onChange={(v) => {
            setGroupBy(v as GroupBy);
            setFilter((f) => ({ ...f, group: null }));
          }}
          options={[
            { key: "beds", label: "Bedrooms" },
            { key: "district", label: "Postcode" },
            { key: "type", label: "Type" },
          ]}
          large
        />
      </div>

      {/* Active filters */}
      <AnimatePresence>
        {active ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 flex flex-wrap items-center gap-2 overflow-hidden"
          >
            <span className="text-sm text-[var(--re-muted)]">Filtered by</span>
            {filter.bucket !== null ? (
              <FilterChip onClear={() => setFilter((f) => ({ ...f, bucket: null }))}>
                {money(filter.bucket)}–{money(filter.bucket + BUCKET - 1)} pcm
              </FilterChip>
            ) : null}
            {filter.group !== null ? <FilterChip onClear={() => setFilter((f) => ({ ...f, group: null }))}>{filter.group}</FilterChip> : null}
            {filter.type !== null ? <FilterChip onClear={() => setFilter((f) => ({ ...f, type: null }))}><span className="capitalize">{filter.type}</span></FilterChip> : null}
            <button type="button" onClick={() => setFilter({ bucket: null, group: null, type: null })} className="text-sm font-semibold text-[var(--re-warm)]">
              Clear all
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Homes to let" value={String(kpis.count)} sub={`${money(kpis.lo)} – ${money(kpis.hi)} pcm`} />
        <Kpi label="Median rent" value={money(kpis.median)} sub="per month" />
        <Kpi label="Average per bedroom" value={money(Math.round(kpis.perBed / 10) * 10)} sub="per month, excl. studios" />
        <Kpi label="Listed in last 30 days" value={String(kpis.fresh)} sub="of the homes shown" />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-5">
        {/* Rent distribution */}
        <Panel className="lg:col-span-3" title="Rent distribution" note="Homes per £250 band of monthly rent">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: c.grid }} content={<Tip render={(p) => `${p.n} ${p.n === 1 ? "home" : "homes"} · ${money(p.bucket)}–${money(p.bucket + BUCKET - 1)}`} />} />
                <Bar dataKey="n" radius={[4, 4, 0, 0]} onClick={(d: { bucket?: number }) => d.bucket !== undefined && toggle("bucket", d.bucket)} style={{ cursor: "pointer" }} isAnimationActive animationDuration={600}>
                  {histogram.map((h) => (
                    <Cell key={h.bucket} fill={filter.bucket === null || filter.bucket === h.bucket ? c.accent : c.accentDim} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Average by group */}
        <Panel
          className="lg:col-span-2"
          title={`Average rent by ${groupBy === "beds" ? "bedrooms" : groupBy === "district" ? "postcode" : "type"}`}
          note="Monthly rent; number of homes in brackets"
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 0 }} barCategoryGap={4}>
                <XAxis type="number" hide domain={[0, "dataMax"]} />
                <YAxis
                  type="category"
                  dataKey="key"
                  width={84}
                  tick={{ fill: c.ink, fontSize: 12 }}
                  tickFormatter={(v: string) => {
                    const g = groups.find((x) => x.key === v);
                    const label = v.charAt(0).toUpperCase() + v.slice(1);
                    return g ? `${label} (${g.n})` : label;
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip cursor={{ fill: c.grid }} content={<Tip render={(p) => `${p.key}: ${money(p.avg)} pcm average across ${p.n} ${p.n === 1 ? "home" : "homes"}`} />} />
                <Bar
                  dataKey="avg"
                  maxBarSize={22}
                  radius={[0, 4, 4, 0]}
                  onClick={(d: { key?: string }) => d.key && toggle("group", d.key)}
                  style={{ cursor: "pointer" }}
                  label={{ position: "right", fill: c.muted, fontSize: 11, formatter: (v: number) => `£${(v / 1000).toFixed(1)}k` }}
                >
                  {groups.map((g) => (
                    <Cell key={g.key} fill={filter.group === null || filter.group === g.key ? c.accent : c.accentDim} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* New listings over time */}
        <Panel className="lg:col-span-3" title="New listings per week" note="Weeks starting Monday, last 16 weeks">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weekly} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="wk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={20} />
                <YAxis allowDecimals={false} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ stroke: c.muted, strokeDasharray: "3 3" }} content={<Tip render={(p) => `Week of ${p.label}: ${p.n} new ${p.n === 1 ? "listing" : "listings"}`} />} />
                <Area type="monotone" dataKey="n" stroke={c.accent} strokeWidth={2} fill="url(#wk)" activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {/* Type mix */}
        <Panel className="lg:col-span-2" title="Property type mix" note="Share of homes; click a type to filter">
          <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label="Share of homes by property type">
            {mix.map((m) => (
              <motion.button
                layout
                key={m.type}
                type="button"
                title={`${m.type}: ${m.n} (${Math.round(m.pct * 100)}%)`}
                onClick={() => toggle("type", m.type)}
                className="h-full transition-opacity"
                style={{
                  width: `${m.pct * 100}%`,
                  minWidth: 6,
                  background: typeHex(m.type, theme),
                  opacity: filter.type === null || filter.type === m.type ? 1 : 0.3,
                }}
              />
            ))}
          </div>
          <ul className="mt-5 grid gap-1">
            {mix.map((m) => (
              <li key={m.type}>
                <button
                  type="button"
                  onClick={() => toggle("type", m.type)}
                  aria-pressed={filter.type === m.type}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-[var(--re-surface-2)]",
                    filter.type === m.type && "bg-[var(--re-surface-2)]",
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ background: typeColor(m.type) }} />
                  <span className="capitalize">{m.type}</span>
                  <span className="ml-auto tabular-nums text-[var(--re-muted)]">{m.n}</span>
                  <span className="w-10 text-right tabular-nums font-medium">{Math.round(m.pct * 100)}%</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Viewings */}
      <Panel id="viewings" className="mt-3 scroll-mt-24" title="Booked viewings" note="Booked by voice through Haven">
        {bookings === null ? (
          <div className="h-16 animate-pulse rounded-xl" style={{ background: "var(--re-surface-2)" }} />
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-xl p-5 sm:flex-row sm:items-center" style={{ background: "var(--re-surface-2)" }}>
            <CalendarCheck className="size-6 text-[var(--re-muted)]" />
            <p className="flex-1 text-sm text-[var(--re-muted)]">
              No viewings booked yet. Start a call from any home and ask the agent to book one; it appears here.
            </p>
            <Link href="/explore" className="re-btn re-btn-primary h-10 px-4 text-sm">
              <Mic className="size-4" /> Find a home to view
            </Link>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {bookings.map((b) => {
              const home = b.propertyId ? byId.get(b.propertyId) : undefined;
              return (
                <li key={b.sessionId} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--re-surface-2)" }}>
                  {home?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={home.image} alt="" className="size-14 rounded-lg object-cover" />
                  ) : (
                    <span className="flex size-14 items-center justify-center rounded-lg" style={{ background: "var(--re-surface)" }}>
                      <CalendarCheck className="size-5 text-[var(--re-muted)]" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">
                      {b.date ?? "Date tbc"} · {b.time ?? "time tbc"}
                    </p>
                    <p className="truncate text-sm text-[var(--re-muted)]">{home?.address ?? `Property ${b.propertyId ?? "unknown"}`}</p>
                    <p className="text-xs text-[var(--re-muted)]">
                      {b.customerName && b.customerName !== "Unknown" ? b.customerName : "Guest"} · {b.status ?? "pending"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Table */}
      <Panel className="mt-3" title={`Listings (${rows.length})`} note="Sort by any column; click a row to open the home">
        <div className="-mx-4 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.12em] text-[var(--re-muted)]">
                <th className="px-4 pb-3 font-medium sm:px-6">Home</th>
                <Th label="Rent" k="price" sort={sort} setSort={setSort} />
                <Th label="Beds" k="bedrooms" sort={sort} setSort={setSort} />
                <Th label="Per bed" k="perBed" sort={sort} setSort={setSort} />
                <Th label="Postcode" k="district" sort={sort} setSort={setSort} />
                <Th label="Listed" k="liveDate" sort={sort} setSort={setSort} />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((l) => (
                  <motion.tr
                    layout
                    key={l.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="group cursor-pointer border-t transition-colors hover:bg-[var(--re-surface-2)]"
                    style={{ borderColor: "var(--re-line)" }}
                    onClick={() => (window.location.href = `/property/${encodeURIComponent(l.id)}`)}
                  >
                    <td className="px-4 py-2.5 sm:px-6">
                      <Link href={`/property/${encodeURIComponent(l.id)}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        {l.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.image} alt="" className="size-10 rounded-lg object-cover transition-transform group-hover:scale-110" />
                        ) : (
                          <span className="size-10 rounded-lg" style={{ background: "var(--re-surface-2)" }} />
                        )}
                        <span className="min-w-0">
                          <span className="block max-w-[240px] truncate font-medium">{l.address}</span>
                          <span className="flex items-center gap-1.5 text-xs capitalize text-[var(--re-muted)]">
                            <span className="size-2 rounded-full" style={{ background: typeColor(l.type) }} />
                            {l.type} · {l.furnishing}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-2.5 font-medium tabular-nums">{money(l.price)}</td>
                    <td className="py-2.5 tabular-nums">{bedsShort(l.bedrooms)}</td>
                    <td className="py-2.5 tabular-nums text-[var(--re-muted)]">{money(l.bedrooms ? l.price / l.bedrooms : l.price)}</td>
                    <td className="py-2.5">{l.district}</td>
                    <td className="py-2.5 pr-4 tabular-nums text-[var(--re-muted)] sm:pr-6">
                      {l.liveDate ? new Date(l.liveDate).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Panel({ title, note, className, children, id }: { title: string; note?: string; className?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("re-card p-4 sm:p-6", className)}>
      <h2 className="text-base font-medium">{title}</h2>
      {note ? <p className="mb-4 mt-0.5 text-xs text-[var(--re-muted)]">{note}</p> : null}
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="re-card p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--re-muted)]">{label}</p>
      <motion.p key={value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-2 text-3xl font-medium tabular-nums tracking-tight sm:text-4xl">
        {value}
      </motion.p>
      <p className="mt-1 text-xs text-[var(--re-muted)]">{sub}</p>
    </div>
  );
}

function FilterChip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full pl-3 pr-1.5 text-sm font-medium" style={{ background: "var(--re-accent-soft)", color: "#2b2210" }}>
      {children}
      <button type="button" onClick={onClear} aria-label="Remove filter" className="rounded-full p-1 hover:bg-black/10">
        <X className="size-3.5" />
      </button>
    </span>
  );
}

function Th({
  label,
  k,
  sort,
  setSort,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  setSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
}) {
  const on = sort.key === k;
  return (
    <th className="pb-3 font-medium" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => setSort({ key: k, dir: on ? (sort.dir === 1 ? -1 : 1) : -1 })}
        className={cn("inline-flex items-center gap-1 uppercase tracking-[0.12em]", on && "text-[var(--re-ink)]")}
      >
        {label}
        {on ? sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
      </button>
    </th>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Tip({ active, payload, render }: { active?: boolean; payload?: { payload: any }[]; render: (p: any) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs font-medium shadow-lg" style={{ background: "var(--re-surface)", borderColor: "var(--re-line)", color: "var(--re-ink)" }}>
      {render(payload[0].payload)}
    </div>
  );
}
