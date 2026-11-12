import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * Contradiction-check results for the Fact checks page, read from the
 * fact_record contracts: 03_resolved (facts, contradictions, resolutions)
 * and 05_listing (what the public listing is allowed to show per field).
 */

const CONTRACTS_DIR = process.env.FACT_CONTRACTS_DIR ?? path.join(process.cwd(), "..", "fact_record", "contracts");

export type CheckFact = {
  id: string;
  display: string;
  docId: string;
  docType: string;
  issuer: string;
  docDate: string;
  tier: number | null;
  page: number | null;
  quote: string | null;
  status: string;
  recommended: boolean;
  winner: boolean;
};

export type Contradiction = {
  id: string;
  type: string;
  field: string;
  scope: string[];
  status: "open" | "resolved" | string;
  requiresHuman: boolean;
  reason: string | null;
  facts: CheckFact[];
  resolution: {
    kind: string;
    winningFactId: string | null;
    reviewer: string | null;
    at: string | null;
    note: string | null;
  } | null;
};

export type CheckDocument = {
  docId: string;
  docType: string;
  issuer: string;
  docDate: string;
  tier: number | null;
  pages: number | null;
};

export type ListingField = {
  field: string;
  status: string;
  display: string | null;
  blockedBy: string[];
};

export type Development = {
  key: string;
  name: string;
  listingId: string | null;
  documents: CheckDocument[];
  factCounts: Record<string, number>;
  totalFacts: number;
  contradictions: Contradiction[];
  fields: ListingField[];
};

type Raw = Record<string, unknown>;

function readJson(file: string): Raw | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, file), "utf8")) as Raw;
  } catch {
    return null;
  }
}

const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown): number | null => (typeof v === "number" ? v : null);

export function getFactChecks(): Development[] {
  const resolved = readJson("03_resolved.json");
  const listing = readJson("05_listing.json");
  const devs = (resolved?.developments ?? {}) as Record<string, Raw>;
  const listings = (listing?.listings ?? {}) as Record<string, Raw>;

  return Object.entries(devs).map(([key, dev]) => {
    const facts = (dev.facts ?? []) as Raw[];
    const byId = new Map(facts.map((f) => [s(f.id), f]));
    const docs = ((dev.documents ?? []) as Raw[]).map<CheckDocument>((d) => ({
      docId: s(d.doc_id),
      docType: s(d.doc_type),
      issuer: s(d.issuer_org),
      docDate: s(d.doc_date),
      tier: n(d.authority_tier),
      pages: n(d.page_count),
    }));

    const factCounts: Record<string, number> = {};
    for (const f of facts) factCounts[s(f.status)] = (factCounts[s(f.status)] ?? 0) + 1;

    const contradictions = ((dev.contradictions ?? []) as Raw[]).map<Contradiction>((c) => {
      const res = (c.resolution ?? null) as Raw | null;
      const winning = res ? s(res.winning_fact_id) || null : null;
      const reviewer = res?.reviewer as Raw | undefined;
      return {
        id: s(c.id),
        type: s(c.type),
        field: s(c.field),
        scope: ((c.scope ?? []) as unknown[]).map(s),
        status: s(c.status),
        requiresHuman: Boolean(c.requires_human),
        reason: s(c.recommendation_reason) || null,
        facts: ((c.fact_ids ?? []) as unknown[]).map((idRaw) => {
          const id = s(idRaw);
          const f = byId.get(id) ?? {};
          return {
            id,
            display: s(f.display) || id,
            docId: s(f.doc_id),
            docType: s(f.doc_type),
            issuer: s(f.issuer),
            docDate: s(f.doc_date),
            tier: n(f.authority_tier),
            page: n(f.page),
            quote: s(f.quote) || null,
            status: s(f.status),
            recommended: id === s(c.recommended_fact_id),
            winner: winning ? id === winning : false,
          };
        }),
        resolution: res
          ? {
              kind: s(res.kind),
              winningFactId: winning,
              reviewer: reviewer ? s(reviewer.name) || s(reviewer.id) : null,
              at: s(res.at) || null,
              note: s(res.note) || null,
            }
          : null,
      };
    });

    const l = listings[key];
    const prop = (l?.property ?? {}) as Raw;
    const fields = Object.entries((l?.fields ?? {}) as Record<string, Raw>).map<ListingField>(([field, v]) => ({
      field,
      status: s(v.verification_status),
      display: v.display == null ? null : s(v.display),
      blockedBy: ((v.blocked_by ?? []) as unknown[]).map(s),
    }));
    const addr = (prop.address ?? {}) as Raw;

    return {
      key,
      name: s(addr.display) || key,
      listingId: prop.property_id != null ? s(prop.property_id) : null,
      documents: docs,
      factCounts,
      totalFacts: facts.length,
      contradictions,
      fields,
    };
  });
}

// Served by app/review/[[...path]]/route.ts; ?data= opens the workbench straight
// onto the same pipeline facts this page reads, skipping the upload screen.
export const FACT_REVIEW_URL =
  process.env.NEXT_PUBLIC_FACT_REVIEW_URL ??
  "/review/conflict-resolution-ui/index.html?data=../fact_record/contracts/01_extracted.json";
