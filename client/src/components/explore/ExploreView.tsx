"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  Columns2,
  GitCompareArrows,
  Heart,
  Home,
  LayoutGrid,
  Map as MapIcon,
  Mic,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { HomeCard } from "@/components/site/HomeCard";
import { useShortlist } from "@/components/site/shortlist";
import type { ListingSummary } from "@/lib/listing-summary";
import { bedsShort, money, shortMoney, typeColor } from "@/lib/listing-summary";
import { cn } from "@/lib/utils";

const ListingsMap = dynamic(() => import("./ListingsMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse" style={{ background: "var(--re-surface-2)" }} />,
});

type View = "grid" | "split" | "map";
type Sort = "recent" | "price_asc" | "price_desc" | "beds_desc";

const BEDS = [
  { key: "any", label: "Any" },
  { key: "0", label: "Studio" },
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3+" },
];

export function ExploreView({
  listings,
  initialQuery = "",
  initialView = "split",
  initialSaved = false,
}: {
  listings: ListingSummary[];
  initialQuery?: string;
  initialView?: View;
  initialSaved?: boolean;
}) {
  const shortlist = useShortlist();
  const [query, setQuery] = useState(initialQuery);
  const [view, setView] = useState<View>(initialView);
  const [savedOnly, setSavedOnly] = useState(initialSaved);
  const [checkedOnly, setCheckedOnly] = useState(false);
  const [beds, setBeds] = useState("any");
  const [type, setType] = useState("all");
  const [furnished, setFurnished] = useState<"any" | "furnished" | "unfurnished">("any");
  const [sort, setSort] = useState<Sort>("recent");
  const [deal, setDeal] = useState<"let" | "sale">("let");
  const dealCounts = useMemo(
    () => ({ let: listings.filter((l) => l.deal === "let").length, sale: listings.filter((l) => l.deal === "sale").length }),
    [listings],
  );
  const step = deal === "let" ? 250 : 25000;
  const priceMax = useMemo(() => {
    const ps = listings.filter((l) => l.deal === deal).map((l) => l.price || 0);
    return Math.ceil(Math.max(step, ...ps) / step) * step;
  }, [listings, deal, step]);
  const priceMin = deal === "let" ? 1000 : 100000;
  const [budget, setBudget] = useState(priceMax);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => setBudget(priceMax), [priceMax]);

  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of listings) if (l.deal === deal) m.set(l.type, (m.get(l.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [listings, deal]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = listings.filter((l) => {
      if (l.deal !== deal) return false;
      if (savedOnly && !shortlist.has(l.id)) return false;
      if (checkedOnly && !l.verified) return false;
      if (type !== "all" && l.type !== type) return false;
      if (beds !== "any") {
        const b = Number(beds);
        if (b === 3 ? l.bedrooms < 3 : l.bedrooms !== b) return false;
      }
      if (furnished !== "any" && l.furnishing !== furnished) return false;
      if (l.price && l.price > budget) return false;
      if (!q) return true;
      return [l.address, l.postcode, l.type, l.blurb, l.reference ?? "", ...l.features].join(" ").toLowerCase().includes(q);
    });
    const s = [...out];
    if (sort === "price_asc") s.sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") s.sort((a, b) => b.price - a.price);
    else if (sort === "beds_desc") s.sort((a, b) => b.bedrooms - a.bedrooms || a.price - b.price);
    else s.sort((a, b) => Number(b.verified) - Number(a.verified) || b.liveDate.localeCompare(a.liveDate));
    return s;
  }, [listings, deal, query, savedOnly, checkedOnly, shortlist, type, beds, furnished, budget, sort]);

  const filtersOn = query !== "" || savedOnly || checkedOnly || type !== "all" || beds !== "any" || furnished !== "any" || budget < priceMax;
  const reset = () => {
    setQuery("");
    setSavedOnly(false);
    setCheckedOnly(false);
    setType("all");
    setBeds("any");
    setFurnished("any");
    setBudget(priceMax);
  };

  const toggleCompare = (id: string) =>
    setCompare((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? [...cur.slice(1), id] : [...cur, id]));

  const selectFromMap = (id: string) => {
    setActiveId(id);
    document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const avg = visible.length ? visible.reduce((s, l) => s + l.price, 0) / visible.length : 0;
  const compared = compare.map((id) => listings.find((l) => l.id === id)).filter(Boolean) as ListingSummary[];

  return (
    <div className="mx-auto max-w-[1600px] px-3 pb-28 sm:px-6">
      {/* ---------- Heading ---------- */}
      <div className="flex flex-col gap-4 pb-5 pt-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">
            {savedOnly ? "Your shortlist" : deal === "let" ? "Homes to let" : "Homes for sale"}
          </p>
          <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">
            <motion.span key={visible.length} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="inline-block tabular-nums">
              {visible.length}
            </motion.span>{" "}
            {visible.length === 1 ? "home" : "homes"}{" "}
            <span className="re-serif italic text-[var(--re-muted)]">
              {avg ? `· avg ${money(avg)}${deal === "let" ? " pcm" : ""}` : ""}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            id="deal"
            label="Rent or buy"
            large
            value={deal}
            onChange={(v) => {
              setDeal(v as "let" | "sale");
              setType("all");
            }}
            options={[
              { key: "let", label: `Rent · ${dealCounts.let}` },
              { key: "sale", label: `Buy · ${dealCounts.sale}` },
            ]}
          />
          <ViewSwitch view={view} onChange={setView} />
        </div>
      </div>

      {/* ---------- Filters ---------- */}
      <div
        className="sticky top-[76px] z-[1000] -mx-3 border-y px-3 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4"
        style={{ background: "var(--re-glass)", borderColor: "var(--re-line)" }}
      >
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="flex h-11 flex-1 items-center gap-2 rounded-full border px-4" style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}>
            <Search className="size-4 shrink-0 text-[var(--re-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Street, postcode, feature…"
              aria-label="Search homes"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-[var(--re-muted)]"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <X className="size-4 text-[var(--re-muted)]" />
              </button>
            ) : null}
          </label>

          <div className="re-scroll-x -mx-3 flex items-center gap-2 overflow-x-auto px-3 xl:mx-0 xl:px-0 [&>*]:shrink-0">
            <Segmented value={beds} onChange={setBeds} options={BEDS} label="Bedrooms" id="beds" />
            <label className="flex h-11 items-center gap-3 rounded-full border px-4 text-sm" style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}>
              <SlidersHorizontal className="size-4 text-[var(--re-muted)]" />
              <span className="text-[var(--re-muted)]">Up to</span>
              <input
                type="range"
                className="re-range w-28"
                min={priceMin}
                max={priceMax}
                step={step}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                aria-label="Maximum monthly rent"
              />
              <span className="w-16 font-semibold tabular-nums">{shortMoney(budget)}</span>
            </label>
            <Segmented
              value={furnished}
              onChange={(v) => setFurnished(v as typeof furnished)}
              id="furn"
              label="Furnishing"
              options={[
                { key: "any", label: "Any" },
                { key: "furnished", label: "Furnished" },
                { key: "unfurnished", label: "Unfurnished" },
              ]}
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              aria-label="Sort homes"
              className="h-11 cursor-pointer rounded-full border px-4 text-sm font-medium outline-none"
              style={{ borderColor: "var(--re-line)", background: "var(--re-surface)", color: "var(--re-ink)" }}
            >
              <option value="recent">Newest first</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="beds_desc">Most bedrooms</option>
            </select>
          </div>
        </div>

        <div className="re-scroll-x -mx-3 mt-3 flex items-center gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0 [&>*]:shrink-0">
          <button type="button" className="re-chip" aria-pressed={savedOnly} onClick={() => setSavedOnly((v) => !v)}>
            <Heart className="size-3.5" fill={savedOnly ? "currentColor" : "none"} /> Saved
            <span className="opacity-60">{shortlist.ids.length}</span>
          </button>
          {listings.some((l) => l.verified && l.deal === deal) ? (
            <button type="button" className="re-chip" aria-pressed={checkedOnly} onClick={() => setCheckedOnly((v) => !v)}>
              <ShieldCheck className="size-3.5" /> Fact-checked
            </button>
          ) : null}
          <Link href="/facts" className="re-chip">
            How we check facts
          </Link>
          <span className="mx-1 h-5 w-px" style={{ background: "var(--re-line)" }} />
          <button type="button" className="re-chip" aria-pressed={type === "all"} onClick={() => setType("all")}>
            All types
          </button>
          {types.map(([t, n]) => (
            <button key={t} type="button" className="re-chip capitalize" aria-pressed={type === t} onClick={() => setType((c) => (c === t ? "all" : t))}>
              <span className="size-2 rounded-full" style={{ background: typeColor(t) }} />
              {t} <span className="opacity-60">{n}</span>
            </button>
          ))}
          <AnimatePresence>
            {filtersOn ? (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={reset}
                className="inline-flex h-8 items-center gap-1 px-2 text-sm font-semibold text-[var(--re-warm)]"
              >
                <X className="size-3.5" /> Clear all
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      {/* ---------- Results ---------- */}
      <div
        className={cn(
          "mt-5 grid gap-5",
          view === "split" && "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]",
        )}
      >
        {view !== "map" ? (
          <div className="min-w-0">
            {visible.length === 0 ? (
              <EmptyState saved={savedOnly} onReset={reset} />
            ) : (
              <LayoutGroup>
                <motion.div
                  layout
                  className={cn(
                    "grid gap-4",
                    view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2",
                  )}
                >
                  <AnimatePresence mode="popLayout">
                    {visible.map((l, i) => (
                      <div key={l.id} id={`card-${l.id}`} className="scroll-mt-48">
                        <HomeCard
                          listing={l}
                          index={i}
                          active={activeId === l.id}
                          saved={shortlist.has(l.id)}
                          comparing={compare.includes(l.id)}
                          onSave={shortlist.toggle}
                          onCompare={toggleCompare}
                          onHover={setActiveId}
                        />
                      </div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </LayoutGroup>
            )}
          </div>
        ) : null}

        {view !== "grid" ? (
          <div
            className={cn(
              "re-card overflow-hidden",
              view === "split" ? "hidden h-[calc(100vh-220px)] lg:sticky lg:top-[200px] lg:block" : "h-[calc(100vh-230px)] min-h-[420px]",
            )}
          >
            <ListingsMap listings={visible} activeId={activeId} onHover={setActiveId} onSelect={selectFromMap} />
          </div>
        ) : null}
      </div>

      {view === "map" && activeId ? <MapPreview listing={listings.find((l) => l.id === activeId)} /> : null}

      {/* ---------- Compare tray ---------- */}
      <AnimatePresence>
        {compare.length ? (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-3 bottom-4 z-[1200] mx-auto flex max-w-2xl items-center gap-3 rounded-full border p-2 pl-4 shadow-[var(--re-shadow)] backdrop-blur-xl"
            style={{ background: "var(--re-glass)", borderColor: "var(--re-line)" }}
          >
            <GitCompareArrows className="size-4 shrink-0 text-[var(--re-muted)]" />
            <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
              {compared.map((l) => (
                <span key={l.id} className="inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "var(--re-surface-2)" }}>
                  <span className="truncate">{money(l.price)} · {bedsShort(l.bedrooms)}</span>
                  <button type="button" onClick={() => toggleCompare(l.id)} aria-label="Remove from compare">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
            <button type="button" className="re-btn re-btn-primary h-10 shrink-0 px-4 text-sm" onClick={() => setCompareOpen(true)} disabled={compare.length < 2}>
              Compare {compare.length}
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {compareOpen ? <CompareSheet homes={compared} onClose={() => setCompareOpen(false)} /> : null}
      </AnimatePresence>
    </div>
  );
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts: { key: View; label: string; icon: React.ReactNode }[] = [
    { key: "grid", label: "Grid", icon: <LayoutGrid className="size-4" /> },
    { key: "split", label: "Split", icon: <Columns2 className="size-4" /> },
    { key: "map", label: "Map", icon: <MapIcon className="size-4" /> },
  ];
  return (
    <Segmented
      id="view"
      label="Layout"
      value={view}
      onChange={(v) => onChange(v as View)}
      options={opts.map((o) => ({ key: o.key, label: o.label, icon: o.icon }))}
      large
    />
  );
}

export function Segmented({
  id,
  value,
  onChange,
  options,
  label,
  large = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { key: string; label: string; icon?: React.ReactNode }[];
  label: string;
  large?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("relative flex items-center rounded-full border p-1", large ? "h-12" : "h-11")}
      style={{ borderColor: "var(--re-line)", background: "var(--re-surface)" }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.key)}
            className={cn(
              "relative inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors",
              on ? "text-[#2b2210]" : "text-[var(--re-muted)] hover:text-[var(--re-ink)]",
            )}
          >
            {on ? (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full"
                style={{ background: "var(--re-pill)", boxShadow: "inset 0 0 12px rgba(255,255,255,.6)" }}
                transition={{ type: "spring", stiffness: 450, damping: 34 }}
              />
            ) : null}
            <span className="relative inline-flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ saved, onReset }: { saved: boolean; onReset: () => void }) {
  return (
    <div className="re-card flex flex-col items-center gap-3 px-6 py-20 text-center">
      {saved ? <Heart className="size-8 text-[var(--re-muted)]" /> : <Home className="size-8 text-[var(--re-muted)]" />}
      <p className="text-lg font-medium">{saved ? "Your shortlist is empty" : "No homes match these filters"}</p>
      <p className="max-w-sm text-sm text-[var(--re-muted)]">
        {saved ? "Tap the heart on any home to save it here." : "Try a higher budget or fewer filters."}
      </p>
      <button type="button" onClick={onReset} className="re-btn re-btn-ghost mt-2">
        {saved ? "Show all homes" : "Clear filters"}
      </button>
    </div>
  );
}

function MapPreview({ listing }: { listing?: ListingSummary }) {
  if (!listing) return null;
  return (
    <motion.div
      key={listing.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="re-card fixed bottom-6 left-1/2 z-[1100] flex w-[min(520px,calc(100%-24px))] -translate-x-1/2 items-center gap-4 p-3 shadow-[var(--re-shadow)]"
    >
      {listing.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={listing.image} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-lg font-medium">{listing.priceLabel}</p>
        <p className="truncate text-sm text-[var(--re-muted)]">{listing.address}</p>
        <p className="text-xs text-[var(--re-muted)]">
          {bedsShort(listing.bedrooms)} · {listing.bathrooms} bath · <span className="capitalize">{listing.type}</span>
        </p>
      </div>
      <Link href={`/property/${encodeURIComponent(listing.id)}`} className="re-btn re-btn-primary h-10 px-4 text-sm">
        View
      </Link>
    </motion.div>
  );
}

function CompareSheet({ homes, onClose }: { homes: ListingSummary[]; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const minPrice = Math.min(...homes.map((h) => h.price));
  const maxBeds = Math.max(...homes.map((h) => h.bedrooms));
  const maxBaths = Math.max(...homes.map((h) => h.bathrooms));
  const perBed = (h: ListingSummary) => (h.bedrooms ? h.price / h.bedrooms : h.price);
  const minPerBed = Math.min(...homes.map(perBed));

  const rows: { label: string; render: (h: ListingSummary) => React.ReactNode; best?: (h: ListingSummary) => boolean }[] = [
    { label: "Monthly rent", render: (h) => h.priceLabel, best: (h) => h.price === minPrice },
    { label: "Rent per bedroom", render: (h) => money(perBed(h)), best: (h) => perBed(h) === minPerBed },
    { label: "Bedrooms", render: (h) => bedsShort(h.bedrooms), best: (h) => h.bedrooms === maxBeds },
    { label: "Bathrooms", render: (h) => h.bathrooms, best: (h) => h.bathrooms === maxBaths },
    { label: "Type", render: (h) => <span className="capitalize">{h.type}</span> },
    { label: "Furnishing", render: (h) => <span className="capitalize">{h.furnishing}</span> },
    { label: "Postcode", render: (h) => h.postcode || "—" },
    { label: "Council tax", render: (h) => h.councilTax ?? "—" },
    { label: "Deposit", render: (h) => h.deposit ?? "—" },
    { label: "Highlights", render: (h) => <span className="text-xs leading-relaxed">{h.features.slice(0, 3).join(" · ") || "—"}</span> },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Compare homes"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-t-3xl p-4 sm:rounded-3xl sm:p-6"
        style={{ background: "var(--re-bg)", color: "var(--re-ink)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-medium tracking-tight">
            Side by side <span className="re-serif italic text-[var(--re-muted)]">· best value highlighted</span>
          </h2>
          <button type="button" onClick={onClose} className="re-btn re-btn-ghost size-10 p-0" aria-label="Close compare">
            <X className="size-4" />
          </button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-x-2 text-sm">
            <thead>
              <tr>
                <th className="w-36" />
                {homes.map((h) => (
                  <th key={h.id} className="align-top font-normal">
                    {h.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={h.image} alt="" className="aspect-[4/3] w-full rounded-2xl object-cover" />
                    ) : null}
                    <p className="mt-2 truncate text-left font-medium">{h.address}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="border-t py-3 text-[var(--re-muted)]" style={{ borderColor: "var(--re-line)" }}>
                    {r.label}
                  </td>
                  {homes.map((h) => {
                    const best = homes.length > 1 && r.best?.(h);
                    return (
                      <td key={h.id} className="border-t py-3" style={{ borderColor: "var(--re-line)" }}>
                        <span
                          className={cn("inline-flex rounded-full", best && "px-2.5 py-0.5 font-semibold")}
                          style={best ? { background: "var(--re-accent-soft)", color: "#2b2210" } : undefined}
                        >
                          {r.render(h)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td />
                {homes.map((h) => (
                  <td key={h.id} className="pt-4">
                    <Link href={`/haven?listing=${encodeURIComponent(h.id)}`} className="re-btn re-btn-primary h-10 w-full text-sm">
                      <Mic className="size-4" /> Ask about it
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>
    </motion.div>
  );
}
