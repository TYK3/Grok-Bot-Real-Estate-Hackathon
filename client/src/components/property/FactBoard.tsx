"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronRight, CircleCheck, CircleDashed, Clock3, FileText, X } from "lucide-react";

import type { FactCitation, VerifiedField } from "@/lib/property-types";

export type BlockingCase = {
  id: string;
  type: string;
  facts: { display: string; issuer: string; docType: string; docDate: string; page: number | null; quote: string | null; recommended: boolean }[];
  reason: string | null;
};

const FIELD_LABELS: [string, string][] = [
  ["price", "Price"],
  ["tenure", "Tenure"],
  ["transaction_type", "Sale or let"],
  ["bedrooms", "Bedrooms"],
  ["net_area", "Net area (NIA)"],
  ["gross_area", "Gross area (GIA)"],
  ["stated_area", "Stated area"],
  ["epc", "EPC"],
  ["parking", "Parking"],
  ["availability", "Availability"],
  ["key_features", "Key features"],
];

const nice = (s?: string | null) => (s ?? "").replace(/_/g, " ");

function date(iso?: string) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function source(c?: FactCitation) {
  if (!c) return null;
  return [c.issuer, nice(c.doc_type), date(c.doc_date), c.page != null ? `page ${c.page}` : null].filter(Boolean).join(" · ");
}

function valueText(field: string, f: VerifiedField): string | null {
  if (f.display) return f.display;
  if (field === "key_features" && f.items?.length) return [...new Set(f.items.map((i) => i.text))].join(", ");
  return null;
}

/** Verified facts as tappable rows; each opens a drawer with its evidence. */
export function FactBoard({ fields, blocking }: { fields: Record<string, VerifiedField>; blocking: Record<string, BlockingCase> }) {
  const [open, setOpen] = useState<string | null>(null);
  const known = new Set(FIELD_LABELS.map(([k]) => k));
  const extra: [string, string][] = Object.keys(fields)
    .filter((k) => !known.has(k))
    .sort()
    .map((k) => [k, nice(k).replace(/^./, (c) => c.toUpperCase())]);
  const rows = [...FIELD_LABELS, ...extra].filter(([k]) => fields[k]);
  const verified = rows.filter(([k]) => ["verified", "scoped"].includes(fields[k].verification_status)).length;
  const pending = rows.filter(([k]) => fields[k].verification_status === "pending_verification").length;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const current = open ? fields[open] : null;
  const label = open ? rows.find(([k]) => k === open)?.[1] : null;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--re-accent)]">Verified facts</p>
          <h2 className="mt-1 text-2xl font-medium tracking-tight">Tap any fact to see its source.</h2>
        </div>
        <p className="text-xs text-[var(--re-muted)]">
          <span className="font-semibold text-[var(--re-good)]">{verified} verified</span> · <span className="font-semibold text-[var(--re-warm)]">{pending} under review</span>
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {rows.map(([key, lbl]) => {
          const f = fields[key];
          const st = f.verification_status;
          const text = st === "scoped" ? f.claims?.map((c) => c.display).join(" · ") : valueText(key, f);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setOpen(key)}
              className="re-card group flex items-start gap-3 p-4 text-left transition-transform hover:-translate-y-0.5"
            >
              <span className="mt-0.5 shrink-0">
                {st === "verified" || st === "scoped" ? (
                  <CircleCheck className="size-4 text-[var(--re-good)]" />
                ) : st === "pending_verification" ? (
                  <Clock3 className="size-4 text-[var(--re-warm)]" />
                ) : (
                  <CircleDashed className="size-4 text-[var(--re-muted)]" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-[var(--re-muted)]">{lbl}</span>
                <span className="mt-0.5 block break-words text-sm font-medium">
                  {st === "pending_verification" ? "Under review" : st === "not_stated" ? "Not stated in the documents" : text ?? "Verified"}
                </span>
              </span>
              <ChevronRight className="mt-3 size-4 shrink-0 text-[var(--re-muted)] transition-transform group-hover:translate-x-0.5" />
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {open && current ? (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-[1200] bg-black/40 backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(null)}
            />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              aria-label={`Evidence for ${label}`}
              className="fixed inset-x-0 bottom-0 z-[1201] max-h-[85dvh] overflow-y-auto rounded-t-3xl border p-6 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-3xl"
              style={{ background: "var(--re-surface)", borderColor: "var(--re-line)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--re-accent)]">Evidence</p>
                  <h3 className="mt-1 text-2xl font-medium">{label}</h3>
                </div>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-[var(--re-surface-2)]">
                  <X className="size-4" />
                </button>
              </div>
              <Evidence field={open} f={current} blocking={blocking} />
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function Quote({ c, value }: { c?: FactCitation; value?: string | null }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "var(--re-line)", background: "var(--re-bg)" }}>
      {value ? <p className="font-medium">{value}</p> : null}
      {c?.quote ? <p className="re-serif mt-2 text-lg italic leading-snug">“{c.quote.replace(/\s+/g, " ")}”</p> : null}
      {source(c) ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--re-muted)]">
          <FileText className="mt-0.5 size-3.5 shrink-0" /> {source(c)}
        </p>
      ) : null}
    </div>
  );
}

function Evidence({ field, f, blocking }: { field: string; f: VerifiedField; blocking: Record<string, BlockingCase> }) {
  const st = f.verification_status;
  if (st === "verified") {
    return (
      <div className="mt-5 space-y-4">
        <Status tone="good" text="Verified against the source document" />
        <Quote c={f.citation} value={valueText(field, f)} />
      </div>
    );
  }
  if (st === "scoped") {
    return (
      <div className="mt-5 space-y-3">
        <Status tone="good" text="Verified, with separate figures for each scope" />
        {f.claims?.map((c, i) => <Quote key={i} c={c.citation} value={`${c.display}${c.scope ? ` · ${nice(c.scope)}` : ""}`} />)}
      </div>
    );
  }
  if (st === "pending_verification") {
    const cases = (f.blocked_by ?? []).map((id) => blocking[id]).filter(Boolean);
    return (
      <div className="mt-5 space-y-4">
        <Status tone="warm" text="Held back: the documents disagree" />
        <p className="text-sm text-[var(--re-muted)]">We don&apos;t show buyers or tell callers a value until a reviewer decides which document is right.</p>
        {cases.map((c) => (
          <div key={c.id} className="space-y-2">
            {c.facts.map((x, i) => (
              <div key={i} className="rounded-2xl border p-4" style={{ borderColor: x.recommended ? "var(--re-accent)" : "var(--re-line)" }}>
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--re-muted)]">
                  <span>{[x.issuer, nice(x.docType), date(x.docDate), x.page != null ? `page ${x.page}` : null].filter(Boolean).join(" · ")}</span>
                  {x.recommended ? <span className="font-semibold text-[var(--re-accent)]">Recommended</span> : null}
                </div>
                <p className="mt-1 font-medium">{x.display}</p>
                {x.quote ? <p className="re-serif mt-1 italic">“{x.quote.replace(/\s+/g, " ")}”</p> : null}
              </div>
            ))}
            {c.reason ? <p className="text-xs text-[var(--re-muted)]">Suggestion: {c.reason}</p> : null}
          </div>
        ))}
        <Link href="/facts" className="re-btn re-btn-ink w-full gap-2">
          Open fact checks <ArrowUpRight className="size-4" />
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-3">
      <Status tone="muted" text="Not stated in any document" />
      <p className="text-sm text-[var(--re-muted)]">None of the documents we read give this detail, so we don&apos;t guess. Ask Haven and the lettings team will find out.</p>
    </div>
  );
}

function Status({ tone, text }: { tone: "good" | "warm" | "muted"; text: string }) {
  const color = tone === "good" ? "var(--re-good)" : tone === "warm" ? "var(--re-warm)" : "var(--re-muted)";
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {tone === "good" ? <CircleCheck className="size-3.5" /> : tone === "warm" ? <Clock3 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
      {text}
    </p>
  );
}
