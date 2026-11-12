"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, animate, motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileText,
  GitMerge,
  Layers,
  Minus,
  ScanSearch,
  ShieldAlert,
  Trophy,
} from "lucide-react";

import { Segmented } from "@/components/explore/ExploreView";
import type { CheckFact, Contradiction, Development } from "@/lib/fact-checks";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, string> = {
  version_supersession: "Newer version",
  unit_or_measurement_mismatch: "Measurement basis differs",
  true_conflict: "Sources disagree",
  scope_difference: "Different scope",
  official_record_mismatch: "Official record differs",
  plot_or_type_variation: "Varies by plot or type",
};

const RESOLUTION_LABEL: Record<string, string> = {
  accept_recommendation: "Accepted the recommendation",
  choose_fact: "Reviewer chose a value",
  keep_both_scoped: "Kept both, each for its own scope",
};

const FIELD_LABEL: Record<string, string> = {
  price: "Price",
  floor_area: "Floor area",
  net_area: "Net area (NIA)",
  gross_area: "Gross area (GIA)",
  stated_area: "Stated area",
  parking: "Parking",
  epc: "EPC",
  epc_rating: "EPC rating",
  transaction_type: "Sale or let",
  bathroom_fixture: "Bathroom fit-out",
  bedrooms: "Bedrooms",
  tenure: "Tenure",
  availability: "Availability",
  key_features: "Key features",
};

const pretty = (v: string) => (FIELD_LABEL[v] ?? v.replace(/_/g, " ")).replace(/^\w/, (c) => c.toUpperCase());
const docLabel = (t: string) => t.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

type Status = "open" | "resolved" | "all";

export function FactChecksView({ developments, reviewUrl }: { developments: Development[]; reviewUrl: string }) {
  const [devKey, setDevKey] = useState(developments[0]?.key ?? "");
  const dev = developments.find((d) => d.key === devKey) ?? developments[0];
  const openCount = (d: Development) => d.contradictions.filter((c) => c.status === "open").length;
  const [status, setStatus] = useState<Status>(dev && openCount(dev) ? "open" : "all");
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    if (dev) setStatus(openCount(dev) ? "open" : "all");
    setFocus(null);
  }, [devKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    if (!dev) return [];
    const cs = dev.contradictions.filter((c) => status === "all" || c.status === status);
    return [...cs].sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || a.id.localeCompare(b.id));
  }, [dev, status]);

  if (!dev) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <ScanSearch className="mx-auto size-8 text-[var(--re-muted)]" />
        <h1 className="mt-4 text-3xl font-medium">No fact checks yet</h1>
        <p className="mt-2 text-[var(--re-muted)]">
          Run the extractor and contract build so <code>fact_record/contracts/03_resolved.json</code> exists.
        </p>
      </div>
    );
  }

  const resolvedN = dev.contradictions.length - openCount(dev);
  const goTo = (id: string) => {
    setStatus("all");
    setFocus(id);
    setTimeout(() => document.getElementById(`c-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-5 pb-6 pt-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">Fact checks</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">
            Every fact, checked <span className="re-serif italic text-[var(--re-muted)]">against its source.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--re-muted)]">
            We read every brochure, survey and price list for a home. Where documents disagree, we show both sides, the
            stronger source, and who decided. Nothing unresolved is shown to buyers or said by the voice agent.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            id="dev"
            label="Development"
            large
            value={dev.key}
            onChange={setDevKey}
            options={developments.map((d) => ({
              key: d.key,
              label: d.name,
              icon: openCount(d) ? (
                <span className="inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--re-warm)" }}>
                  {openCount(d)}
                </span>
              ) : (
                <BadgeCheck className="size-4" />
              ),
            }))}
          />
        </div>
      </div>

      {/* Pipeline */}
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Documents read", value: dev.documents.length, icon: <FileText className="size-4" /> },
          { label: "Facts extracted", value: dev.totalFacts, icon: <ScanSearch className="size-4" /> },
          { label: "Contradictions found", value: dev.contradictions.length, icon: <GitMerge className="size-4" /> },
          { label: "Resolved", value: resolvedN, icon: <BadgeCheck className="size-4" /> },
          { label: "Needs review", value: openCount(dev), icon: <Clock3 className="size-4" />, warn: openCount(dev) > 0 },
        ].map((s, i) => (
          <li key={s.label} className="re-card relative p-4">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--re-muted)]">
              <span style={{ color: s.warn ? "var(--re-warm)" : "var(--re-accent)" }}>{s.icon}</span>
              {s.label}
            </span>
            <Counter value={s.value} className={cn("mt-2 block text-3xl font-medium tabular-nums sm:text-4xl", s.warn && "text-[var(--re-warm)]")} />
            {i < 4 ? <ArrowRight className="absolute -right-[14px] top-1/2 z-10 hidden size-4 -translate-y-1/2 text-[var(--re-muted)] sm:block" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Sidebar */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <section className="re-card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">On the public listing</h2>
              {dev.listingId ? (
                <Link href={`/property/${encodeURIComponent(dev.listingId)}`} className="text-xs font-semibold text-[var(--re-warm)]">
                  View listing
                </Link>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-[var(--re-muted)]">What buyers and the voice agent can see</p>
            <ul className="mt-4 grid gap-1">
              {dev.fields.map((f) => (
                <li key={f.field}>
                  <button
                    type="button"
                    disabled={!f.blockedBy.length}
                    onClick={() => f.blockedBy[0] && goTo(f.blockedBy[0])}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                      f.blockedBy.length ? "hover:bg-[var(--re-surface-2)]" : "cursor-default",
                    )}
                  >
                    <FieldIcon status={f.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{pretty(f.field)}</span>
                      <span className="block truncate text-xs text-[var(--re-muted)]">
                        {f.status === "verified"
                          ? f.display ?? "Verified"
                          : f.status === "pending_verification"
                            ? `Pending · waiting on ${f.blockedBy.join(", ")}`
                            : "Not stated in any document"}
                      </span>
                    </span>
                    {f.blockedBy.length ? <ArrowRight className="size-3.5 text-[var(--re-muted)]" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="re-card p-5">
            <h2 className="text-base font-medium">Source documents</h2>
            <p className="mt-0.5 text-xs text-[var(--re-muted)]">Tier 1 is the most authoritative source</p>
            <ul className="mt-4 grid gap-3">
              {dev.documents.map((d) => (
                <li key={d.docId} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--re-surface-2)" }}>
                    <FileText className="size-4 text-[var(--re-muted)]" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{docLabel(d.docType)}</span>
                    <span className="block truncate text-xs text-[var(--re-muted)]">
                      {d.issuer} · {fmtDate(d.docDate)}
                      {d.pages ? ` · ${d.pages} pp` : ""}
                    </span>
                  </span>
                  <TierBadge tier={d.tier} />
                </li>
              ))}
            </ul>
          </section>

          <a href={reviewUrl} target="_blank" rel="noreferrer" className="re-btn re-btn-ink w-full">
            Open review workbench <ExternalLink className="size-4" />
          </a>
        </aside>

        {/* Contradictions */}
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              id="status"
              label="Show"
              value={status}
              onChange={(v) => setStatus(v as Status)}
              options={[
                { key: "open", label: `Needs review · ${openCount(dev)}` },
                { key: "resolved", label: `Resolved · ${resolvedN}` },
                { key: "all", label: `All · ${dev.contradictions.length}` },
              ]}
            />
          </div>

          {list.length === 0 ? (
            <div className="re-card flex flex-col items-center gap-2 py-16 text-center">
              <BadgeCheck className="size-8" style={{ color: "var(--re-accent)" }} />
              <p className="text-lg font-medium">Nothing waiting for review</p>
              <p className="text-sm text-[var(--re-muted)]">Every contradiction for this home has been resolved.</p>
            </div>
          ) : (
            <motion.ul layout className="grid gap-3">
              <AnimatePresence mode="popLayout" initial={false}>
                {list.map((c) => (
                  <ContradictionCard key={c.id} c={c} reviewUrl={reviewUrl} focused={focus === c.id} />
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ContradictionCard({ c, reviewUrl, focused }: { c: Contradiction; reviewUrl: string; focused: boolean }) {
  const open = c.status === "open";
  const [expanded, setExpanded] = useState(open || focused);
  useEffect(() => {
    if (focused) setExpanded(true);
  }, [focused]);

  const outcome = (f: CheckFact) => {
    if (open) return f.recommended ? "recommended" : "candidate";
    if (c.resolution?.kind === "keep_both_scoped") return f.status === "superseded" ? "superseded" : "kept";
    if (f.winner) return "chosen";
    return f.status === "verified" ? "corroborates" : "superseded";
  };

  return (
    <motion.li
      layout
      id={`c-${c.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className={cn("re-card scroll-mt-28 overflow-hidden", focused && "ring-2 ring-[var(--re-warm)]")}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 p-4 text-left sm:p-5"
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{
            background: open ? "color-mix(in srgb, var(--re-warm) 16%, transparent)" : "color-mix(in srgb, var(--re-accent) 14%, transparent)",
            color: open ? "var(--re-warm)" : "var(--re-accent)",
          }}
        >
          {open ? <ShieldAlert className="size-5" /> : <BadgeCheck className="size-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-medium">{pretty(c.field)}</span>
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--re-surface-2)" }}>
              {TYPE_LABEL[c.type] ?? c.type}
            </span>
            {c.scope.length && !(c.scope.length === 1 && c.scope[0] === "whole") ? (
              <span className="text-xs text-[var(--re-muted)]">Scope: {c.scope.join(", ").replace(/_/g, " ")}</span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-sm text-[var(--re-muted)]">
            {c.facts.length} sources · {c.facts.map((f) => f.display).slice(0, 3).join("  vs  ")}
          </span>
        </span>
        <span className="hidden text-right sm:block">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={open ? { background: "var(--re-warm)", color: "#fff" } : { background: "var(--re-accent-soft)", color: "#1c2316" }}
          >
            {open ? <Clock3 className="size-3" /> : <BadgeCheck className="size-3" />}
            {open ? "Needs review" : "Resolved"}
          </span>
          <span className="mt-1 block text-[11px] text-[var(--re-muted)]">{c.id}</span>
        </span>
        <ChevronDown className={cn("size-5 shrink-0 text-[var(--re-muted)] transition-transform", expanded && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t px-4 pb-5 pt-4 sm:px-5" style={{ borderColor: "var(--re-line)" }}>
              <ol className="grid gap-2">
                {c.facts.map((f, i) => {
                  const o = outcome(f);
                  const strong = o === "chosen" || o === "recommended" || o === "kept";
                  return (
                    <motion.li
                      key={f.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className={cn("relative rounded-2xl border p-3.5 sm:p-4", o === "superseded" && "opacity-60")}
                      style={{
                        borderColor: strong ? "color-mix(in srgb, var(--re-accent) 55%, transparent)" : "var(--re-line)",
                        background: strong ? "color-mix(in srgb, var(--re-accent-soft) 18%, var(--re-surface))" : "var(--re-surface)",
                      }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className={cn("text-lg font-medium leading-snug", o === "superseded" && "line-through decoration-1")}>
                          {f.display}
                        </p>
                        <OutcomeBadge o={o} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--re-muted)]">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3" /> {docLabel(f.docType)}
                        </span>
                        <span>{f.issuer}</span>
                        <span>{fmtDate(f.docDate)}</span>
                        {f.page ? <span>page {f.page}</span> : null}
                        <TierBadge tier={f.tier} />
                      </div>
                      {f.quote ? (
                        <blockquote className="re-serif mt-3 border-l-2 pl-3 text-[15px] italic leading-relaxed" style={{ borderColor: "var(--re-line)" }}>
                          “{f.quote.replace(/\s+/g, " ").trim()}”
                        </blockquote>
                      ) : null}
                    </motion.li>
                  );
                })}
              </ol>

              {open ? (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center" style={{ background: "color-mix(in srgb, var(--re-warm) 10%, var(--re-surface))" }}>
                  <div className="flex-1 text-sm">
                    <p className="font-medium">Not shown to buyers until a reviewer decides.</p>
                    {c.reason ? <p className="mt-0.5 text-[var(--re-muted)]">Suggestion: {c.reason}</p> : null}
                  </div>
                  <a href={reviewUrl} target="_blank" rel="noreferrer" className="re-btn re-btn-primary h-10 shrink-0 px-4 text-sm">
                    Review in workbench <ExternalLink className="size-3.5" />
                  </a>
                </div>
              ) : c.resolution ? (
                <div className="mt-4 rounded-2xl p-4 text-sm" style={{ background: "var(--re-surface-2)" }}>
                  <p className="font-medium">{RESOLUTION_LABEL[c.resolution.kind] ?? c.resolution.kind}</p>
                  {c.resolution.note ? <p className="re-serif mt-1 text-[15px] italic">“{c.resolution.note}”</p> : null}
                  <p className="mt-1.5 text-xs text-[var(--re-muted)]">
                    {c.resolution.reviewer ?? "Reviewer"}
                    {c.resolution.at ? ` · ${fmtDate(c.resolution.at)}` : ""}
                    {c.reason ? ` · Rule: ${c.reason}` : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

function OutcomeBadge({ o }: { o: string }) {
  const map: Record<string, { label: string; icon: React.ReactNode; strong?: boolean }> = {
    chosen: { label: "Published", icon: <Trophy className="size-3" />, strong: true },
    kept: { label: "Kept for its scope", icon: <Layers className="size-3" />, strong: true },
    recommended: { label: "Recommended", icon: <BadgeCheck className="size-3" />, strong: true },
    corroborates: { label: "Agrees with published value", icon: <BadgeCheck className="size-3" /> },
    superseded: { label: "Superseded", icon: <Minus className="size-3" /> },
    candidate: { label: "Candidate", icon: <CircleDashed className="size-3" /> },
  };
  const m = map[o] ?? map.candidate;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={m.strong ? { background: "var(--re-accent-soft)", color: "#1c2316" } : { background: "var(--re-surface-2)", color: "var(--re-muted)" }}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

function TierBadge({ tier }: { tier: number | null }) {
  if (tier == null) return null;
  const strength = Math.max(1, Math.min(5, 6 - tier));
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--re-muted)]" title={`Authority tier ${tier} (1 is strongest)`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4, 5].map((b) => (
          <span
            key={b}
            className="w-[3px] rounded-full"
            style={{ height: 3 + b * 2, background: b <= strength ? "var(--re-accent)" : "var(--re-line)" }}
          />
        ))}
      </span>
      Tier {tier}
    </span>
  );
}

function FieldIcon({ status }: { status: string }) {
  if (status === "verified") return <BadgeCheck className="size-4 shrink-0" style={{ color: "var(--re-accent)" }} aria-label="Verified" />;
  if (status === "pending_verification") return <Clock3 className="size-4 shrink-0" style={{ color: "var(--re-warm)" }} aria-label="Pending" />;
  return <Minus className="size-4 shrink-0 text-[var(--re-muted)]" aria-label="Not stated" />;
}

function Counter({ value, className }: { value: number; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const c = animate(0, value, { duration: 0.9, ease: [0.2, 0.8, 0.2, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [value]);
  return <span className={className}>{v}</span>;
}
