"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, BadgeCheck, ChevronDown, Clock3, FileText, Layers, ScanSearch, Wrench } from "lucide-react";

import { Segmented } from "@/components/explore/ExploreView";
import type { CheckFact, Contradiction, Development, ListingField } from "@/lib/fact-checks";
import { cn } from "@/lib/utils";

/*
 * Public "what changed" view. Buyers see, per home: which facts were corrected
 * (before → now, why, and the source), which are still being checked, and what
 * the listing shows today. Reviewer tooling (tiers, ids, candidates, the
 * decision controls) lives in the review workbench, not here.
 */

const FIELD_LABEL: Record<string, string> = {
  price: "Asking price",
  floor_area: "Floor area",
  net_area: "Net floor area",
  gross_area: "Gross floor area",
  stated_area: "Stated area",
  parking: "Parking",
  epc: "Energy rating (EPC)",
  epc_rating: "Energy rating (EPC)",
  transaction_type: "For sale or to let",
  bathroom_fixture: "Bathrooms",
  bedrooms: "Bedrooms",
  tenure: "Tenure",
  availability: "Availability",
  key_features: "Key features",
};

const WHY_LABEL: Record<string, string> = {
  version_supersession: "Newer document",
  unit_or_measurement_mismatch: "Measured differently",
  true_conflict: "Sources disagreed",
  scope_difference: "Different part of the property",
  official_record_mismatch: "Official record differs",
  plot_or_type_variation: "Varies by house type",
};

const DOC_LABEL: Record<string, string> = {
  particulars: "Sales particulars",
  measured_survey: "Measured survey",
  developer_instruction: "Price instruction",
  schedule_of_finishes: "Schedule of finishes",
  epc_certificate: "EPC certificate",
};

const SCOPE_LABEL: Record<string, string> = {
  per_floor: "Per floor",
  total: "Whole building",
  "floor:lower_ground": "Lower ground floor",
  development: "Whole development",
  unit: "This home",
  house_type: "One house type",
};

const fieldName = (f: string) => FIELD_LABEL[f] ?? cap(f.replace(/_/g, " "));
const docName = (t: string) => DOC_LABEL[t] ?? cap(t.replace(/_/g, " "));
const cap = (v: string) => v.replace(/^\w/, (c) => c.toUpperCase());

function cleanValue(v: string) {
  return cap(v.replace(/\s+/g, " ").replace(/\[basis not stated\]/i, "(basis not stated)").trim());
}

function cleanQuote(q: string) {
  let t = q.replace(/\s+/g, " ").trim().replace(/-$/, "");
  if (/^[a-z]/.test(t)) t = `…${t}`;
  if (!/[.!?:;)"”]$/.test(t)) t = `${t}…`;
  return t;
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const monthOnly = /^\d{4}-\d{2}$/.test(d);
  return date.toLocaleDateString("en-GB", monthOnly ? { month: "short", year: "numeric" } : { day: "numeric", month: "short", year: "numeric" });
}

function sourceLine(f: { docType: string; issuer: string; docDate: string; page: number | null }) {
  return [docName(f.docType), f.issuer, fmtDate(f.docDate), f.page ? `page ${f.page}` : ""].filter(Boolean).join(" · ");
}

/** Facts that say the same thing (same value) are shown once, with every source listed under it. */
type ValueGroup = { value: string; facts: CheckFact[]; winner: boolean };

function groupByValue(facts: CheckFact[]): ValueGroup[] {
  const groups = new Map<string, ValueGroup>();
  for (const f of facts) {
    const value = cleanValue(f.display);
    const key = value.toLowerCase();
    const g = groups.get(key) ?? { value, facts: [], winner: false };
    g.facts.push(f);
    g.winner ||= f.winner;
    groups.set(key, g);
  }
  return [...groups.values()];
}

export function FactChecksView({ developments, reviewUrl }: { developments: Development[]; reviewUrl: string }) {
  const [devKey, setDevKey] = useState(developments[0]?.key ?? "");
  const dev = developments.find((d) => d.key === devKey) ?? developments[0];

  const { open, changed, scoped } = useMemo(() => {
    const cs = dev?.contradictions ?? [];
    return {
      open: cs.filter((c) => c.status === "open"),
      changed: cs.filter((c) => c.status !== "open" && c.resolution?.kind !== "keep_both_scoped"),
      scoped: cs.filter((c) => c.status !== "open" && c.resolution?.kind === "keep_both_scoped"),
    };
  }, [dev]);

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

  const openCount = (d: Development) => d.contradictions.filter((c) => c.status === "open").length;
  const jumpTo = (id: string) => document.getElementById(`c-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="pb-8 pt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--re-warm)]">Fact checks</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight sm:text-5xl">
          What changed, <span className="re-serif italic text-[var(--re-muted)]">and why.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--re-muted)]">
          We read every brochure, survey and price instruction for a home. When they disagree, a person checks which one
          is right before anything appears on the listing or is said by the voice agent.
        </p>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-full overflow-x-auto">
            <Segmented
              id="dev"
              label="Home"
              value={dev.key}
              onChange={setDevKey}
              options={developments.map((d) => ({ key: d.key, label: d.name }))}
            />
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--re-muted)]">
            <span>
              <b className="font-semibold text-[var(--re-ink)]">{dev.documents.length}</b> documents read
            </span>
            <span>
              <b className="font-semibold text-[var(--re-ink)]">{changed.length}</b> corrected
            </span>
            <span>
              <b className="font-semibold text-[var(--re-ink)]">{scoped.length}</b> clarified
            </span>
            <span>
              <b className={cn("font-semibold", openCount(dev) ? "text-[var(--re-warm)]" : "text-[var(--re-ink)]")}>
                {openCount(dev)}
              </b>{" "}
              being checked
            </span>
          </p>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="grid gap-10">
          {open.length ? (
            <Section
              icon={<Clock3 className="size-4" />}
              tone="warm"
              title="Still being checked"
              hint="The documents disagree and nobody has signed off yet, so these are not shown on the listing."
            >
              {open.map((c) => (
                <PendingCard key={c.id} c={c} />
              ))}
            </Section>
          ) : null}

          <Section
            icon={<Wrench className="size-4" />}
            title="Corrected"
            hint="One document was wrong or out of date, so its value was replaced by the one on the right."
          >
            {changed.length ? changed.map((c) => <ChangeCard key={c.id} c={c} />) : <Empty text="No corrections were needed." />}
          </Section>

          {scoped.length ? (
            <Section
              icon={<Layers className="size-4" />}
              title="Clarified"
              hint="Both statements can be true: they describe a different part, or measure a different way. Each is kept with its label."
            >
              {scoped.map((c) => (
                <ScopedCard key={c.id} c={c} />
              ))}
            </Section>
          ) : null}
        </main>

        <aside className="grid content-start gap-5 lg:sticky lg:top-24">
          <ListingNow fields={dev.fields} listingId={dev.listingId} onJump={jumpTo} />

          <section className="re-card p-5">
            <h2 className="text-base font-medium">Documents we read</h2>
            <ul className="mt-3 grid gap-3">
              {dev.documents.map((d) => (
                <li key={d.docId} className="flex gap-3 text-sm">
                  <FileText className="mt-0.5 size-4 shrink-0 text-[var(--re-muted)]" />
                  <span className="min-w-0">
                    <span className="block font-medium">{docName(d.docType)}</span>
                    <span className="block text-[13px] text-[var(--re-muted)]">
                      {d.issuer} · {fmtDate(d.docDate)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <a href={reviewUrl} target="_blank" rel="noreferrer" className="text-center text-[13px] text-[var(--re-muted)] underline-offset-4 hover:underline">
            For agents: open the review workbench →
          </a>
        </aside>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  hint,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  tone?: "warm";
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xl font-medium">
        <span style={{ color: tone === "warm" ? "var(--re-warm)" : "var(--re-accent)" }}>{icon}</span>
        {title}
      </h2>
      <p className="mt-1 text-sm text-[var(--re-muted)]">{hint}</p>
      <ul className="mt-4 grid gap-3">{children}</ul>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <li className="re-card p-5 text-sm text-[var(--re-muted)]">{text}</li>;
}

function CardHead({ c, right }: { c: Contradiction; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-lg font-medium">{fieldName(c.field)}</h3>
      <span className="flex items-center gap-2">
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium text-[var(--re-muted)]" style={{ background: "var(--re-surface-2)" }}>
          {WHY_LABEL[c.type] ?? cap(c.type.replace(/_/g, " "))}
        </span>
        {right}
      </span>
    </div>
  );
}

function Sources({ facts }: { facts: CheckFact[] }) {
  return (
    <ul className="mt-1 grid gap-0.5">
      {facts.map((f) => (
        <li key={f.id} className="text-[13px] leading-snug text-[var(--re-muted)]">
          {sourceLine(f)}
        </li>
      ))}
    </ul>
  );
}

function Quotes({ facts }: { facts: CheckFact[] }) {
  const withQuotes = facts.filter((f) => f.quote);
  if (!withQuotes.length) return null;
  return (
    <details className="group mt-4 border-t pt-3" style={{ borderColor: "var(--re-line)" }}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-[13px] font-medium text-[var(--re-muted)] hover:text-[var(--re-ink)]">
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        Show the exact wording ({withQuotes.length})
      </summary>
      <ul className="mt-3 grid gap-3">
        {withQuotes.map((f) => (
          <li key={f.id} className="text-sm">
            <p className="leading-relaxed">“{cleanQuote(f.quote!)}”</p>
            <p className="mt-0.5 text-[12px] text-[var(--re-muted)]">{sourceLine(f)}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Reviewed({ c }: { c: Contradiction }) {
  if (!c.resolution) return null;
  return (
    <div className="mt-4 text-sm">
      {c.resolution.note ? <p className="leading-relaxed">{c.resolution.note}</p> : null}
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--re-muted)]">
        <BadgeCheck className="size-3.5" style={{ color: "var(--re-accent)" }} />
        Checked by {c.resolution.reviewer ?? "a reviewer"}
        {c.resolution.at ? ` on ${fmtDate(c.resolution.at)}` : ""}
      </p>
    </div>
  );
}

function ChangeCard({ c }: { c: Contradiction }) {
  const groups = groupByValue(c.facts);
  const now = groups.find((g) => g.winner);
  // A losing value that was not superseded agrees with the winner (same fact, worded differently).
  const agrees = groups.filter((g) => !g.winner && g.facts.every((f) => f.status === "verified"));
  const before = groups.filter((g) => !g.winner && !agrees.includes(g));
  // Corrections can chain: a value chosen here may itself be replaced by a later check.
  const replacedLater = !!now && now.facts.filter((f) => f.winner).every((f) => f.status === "superseded");

  return (
    <li id={`c-${c.id}`} className="re-card scroll-mt-28 p-5">
      <CardHead c={c} />
      <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="rounded-xl p-4" style={{ background: "var(--re-surface-2)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--re-muted)]">Before</p>
          {before.length ? (
            before.map((g) => (
              <div key={g.value} className="mt-2">
                <p className="text-base text-[var(--re-muted)] line-through decoration-1">{g.value}</p>
                <Sources facts={g.facts} />
              </div>
            ))
          ) : (
            <p className="mt-2 text-sm text-[var(--re-muted)]">Same value, confirmed by more than one document.</p>
          )}
        </div>
        <ArrowRight className="hidden size-5 self-center text-[var(--re-muted)] sm:block" />
        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--re-accent) 45%, transparent)",
            background: "color-mix(in srgb, var(--re-accent-soft) 14%, var(--re-surface))",
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--re-accent)" }}>
            Corrected to
          </p>
          {now ? (
            <div className="mt-2">
              <p className="text-lg font-medium">{now.value}</p>
              <Sources facts={now.facts.filter((f) => f.winner).concat(now.facts.filter((f) => !f.winner))} />
              {agrees.map((g) => (
                <p key={g.value} className="mt-2 text-[13px] text-[var(--re-muted)]">
                  Also written as “{g.value}” ({g.facts.map((f) => sourceLine(f)).join("; ")})
                </p>
              ))}
              {replacedLater ? (
                <p className="mt-2 text-[13px] font-medium text-[var(--re-warm)]">Later replaced by a more reliable source, see below.</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-[var(--re-muted)]">Not shown</p>
          )}
        </div>
      </div>
      <Reviewed c={c} />
      <Quotes facts={c.facts} />
    </li>
  );
}

function ScopedCard({ c }: { c: Contradiction }) {
  const groups = groupByValue(c.facts);
  return (
    <li id={`c-${c.id}`} className="re-card scroll-mt-28 p-5">
      <CardHead c={c} />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {groups.map((g) => {
          const scope = SCOPE_LABEL[g.facts[0]?.scope ?? ""];
          return (
            <li key={g.value} className="rounded-xl p-4" style={{ background: "var(--re-surface-2)" }}>
              {scope ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--re-muted)]">{scope}</p>
              ) : null}
              <p className={cn("text-base font-medium", scope && "mt-1")}>{g.value}</p>
              <Sources facts={g.facts} />
            </li>
          );
        })}
      </ul>
      <Reviewed c={c} />
      <Quotes facts={c.facts} />
    </li>
  );
}

function PendingCard({ c }: { c: Contradiction }) {
  const groups = groupByValue(c.facts);
  return (
    <li
      id={`c-${c.id}`}
      className="re-card scroll-mt-28 p-5"
      style={{ borderColor: "color-mix(in srgb, var(--re-warm) 45%, transparent)" }}
    >
      <CardHead
        c={c}
        right={
          <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ background: "var(--re-warm)" }}>
            Not shown yet
          </span>
        }
      />
      <p className="mt-1 text-sm text-[var(--re-muted)]">The documents say:</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <li key={g.value} className="rounded-xl p-4" style={{ background: "var(--re-surface-2)" }}>
            <p className="text-base font-medium">{g.value}</p>
            <Sources facts={g.facts} />
          </li>
        ))}
      </ul>
      <Quotes facts={c.facts} />
    </li>
  );
}

function ListingNow({ fields, listingId, onJump }: { fields: ListingField[]; listingId: string | null; onJump: (id: string) => void }) {
  const shown = fields.filter((f) => f.status !== "not_stated");
  const missing = fields.length - shown.length;
  return (
    <section className="re-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">On the listing now</h2>
        {listingId ? (
          <Link href={`/property/${encodeURIComponent(listingId)}`} className="text-[13px] font-semibold text-[var(--re-warm)]">
            View home
          </Link>
        ) : null}
      </div>
      <ul className="mt-3 grid gap-3">
        {shown.map((f) => {
          const pending = f.status !== "verified";
          return (
            <li key={f.field} className="text-sm">
              <span className="flex items-center gap-1.5 text-[13px] text-[var(--re-muted)]">
                {pending ? (
                  <Clock3 className="size-3.5" style={{ color: "var(--re-warm)" }} />
                ) : (
                  <BadgeCheck className="size-3.5" style={{ color: "var(--re-accent)" }} />
                )}
                {fieldName(f.field)}
              </span>
              {pending ? (
                <button
                  type="button"
                  onClick={() => f.blockedBy[0] && onJump(f.blockedBy[0])}
                  className="mt-0.5 text-left font-medium text-[var(--re-warm)] underline-offset-4 hover:underline"
                >
                  Being checked
                </button>
              ) : (
                <span className="mt-0.5 block font-medium">{f.display ? cleanValue(f.display) : "Verified"}</span>
              )}
            </li>
          );
        })}
      </ul>
      {missing ? (
        <p className="mt-4 border-t pt-3 text-[13px] text-[var(--re-muted)]" style={{ borderColor: "var(--re-line)" }}>
          {missing} other {missing === 1 ? "detail is" : "details are"} not stated in any document.
        </p>
      ) : null}
    </section>
  );
}
