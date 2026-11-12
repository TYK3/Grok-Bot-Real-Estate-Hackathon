import { CircleCheck, CircleDashed, Clock3, FileText } from "lucide-react";

import type {
  FactCitation,
  Property,
  VerifiedField,
} from "@/lib/property-types";

// Display order and labels for contract 05 fields.
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

const DOC_TYPE_LABELS: Record<string, string> = {
  particulars: "particulars",
  measured_survey: "measured survey",
  price_change_instruction: "price change instruction",
  schedule_of_finishes: "schedule of finishes",
};

function formatDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sourceLine(c: FactCitation): string {
  return [
    c.issuer,
    c.doc_type ? DOC_TYPE_LABELS[c.doc_type] ?? c.doc_type.replace(/_/g, " ") : null,
    formatDate(c.doc_date),
    c.page != null ? `p.${c.page}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function valueText(field: string, f: VerifiedField): string | null {
  if (f.display) return f.display;
  if (field === "key_features" && f.items?.length) {
    return [...new Set(f.items.map((i) => i.text))].join(", ");
  }
  return null;
}

export function VerifiedFactsBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ee] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#16794a]">
      <CircleCheck className="size-3.5" />
      Verified facts
    </span>
  );
}

export function VerifiedFacts({ property }: { property: Property }) {
  const fields = property.verified_fields;
  if (!fields) return null;

  const known = new Set(FIELD_LABELS.map(([k]) => k));
  // Fields reviewed in the workbench that contract 05 has no slot for.
  const extra: [string, string][] = Object.keys(fields)
    .filter((k) => !known.has(k))
    .sort()
    .map((k) => [k, k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())]);
  const rows = [...FIELD_LABELS, ...extra].filter(([key]) => fields[key]);
  const verified = rows.filter(([k]) => fields[k].verification_status === "verified").length;
  const pending = rows.filter(
    ([k]) => fields[k].verification_status === "pending_verification",
  ).length;

  return (
    <section className="border-b border-[#d9dee5] pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#e95650]">
          Verified facts
        </h2>
        <p className="text-xs text-[#697586]">
          {verified} verified · {pending} pending · every value cites its source
          document
        </p>
      </div>

      <dl className="mt-4 divide-y divide-[#e4e7eb] rounded-lg border border-[#d9dee5] bg-white">
        {rows.map(([key, label]) => {
          const f = fields[key];
          const status = f.verification_status;
          const text = valueText(key, f);
          return (
            <div
              key={key}
              className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_minmax(0,1fr)] sm:gap-4"
            >
              <dt className="text-sm text-[#697586]">{label}</dt>
              <dd className="min-w-0 text-sm">
                {status === "verified" ? (
                  <>
                    <p className="flex items-start gap-1.5 font-medium text-[#13294b]">
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-[#16a34a]" />
                      <span className="break-words">{text ?? "Verified"}</span>
                    </p>
                    {f.citation ? (
                      <p className="mt-1 flex items-start gap-1.5 pl-[22px] text-xs text-[#697586]">
                        <FileText className="mt-0.5 size-3.5 shrink-0" />
                        <span className="min-w-0 break-words">
                          {sourceLine(f.citation)}
                          {f.citation.quote ? (
                            <span className="italic">
                              {" "}
                              — “{f.citation.quote.replace(/\s+/g, " ")}”
                            </span>
                          ) : null}
                        </span>
                      </p>
                    ) : null}
                  </>
                ) : status === "scoped" && f.claims?.length ? (
                  <ul className="space-y-1.5">
                    {f.claims.map((c, i) => (
                      <li key={i}>
                        <p className="flex items-start gap-1.5 font-medium text-[#13294b]">
                          <CircleCheck className="mt-0.5 size-4 shrink-0 text-[#16a34a]" />
                          <span className="break-words">
                            {c.display}
                            {c.scope ? (
                              <span className="font-normal text-[#697586]">
                                {" "}
                                · {c.scope.replace(/_/g, " ")}
                              </span>
                            ) : null}
                          </span>
                        </p>
                        {c.citation && sourceLine(c.citation) ? (
                          <p className="mt-0.5 flex items-start gap-1.5 pl-[22px] text-xs text-[#697586]">
                            <FileText className="mt-0.5 size-3.5 shrink-0" />
                            <span className="min-w-0 break-words">{sourceLine(c.citation)}</span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : status === "pending_verification" ? (
                  <p className="flex items-start gap-1.5 font-medium text-[#b45309]">
                    <Clock3 className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Pending verification
                      {f.blocked_by?.length ? (
                        <span className="font-normal text-[#697586]">
                          {" "}
                          · documents disagree (open contradiction{" "}
                          {f.blocked_by.join(", ")})
                        </span>
                      ) : null}
                    </span>
                  </p>
                ) : (
                  <p className="flex items-start gap-1.5 text-[#8a95a3]">
                    <CircleDashed className="mt-0.5 size-4 shrink-0" />
                    Not stated in the documents
                  </p>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
