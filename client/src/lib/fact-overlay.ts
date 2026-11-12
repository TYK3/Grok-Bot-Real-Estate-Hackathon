import "server-only";

import type {
  FactCitation,
  Property,
  VerifiedField,
} from "./property-types";

/**
 * Reviewed facts from Supabase (published_fact_state RPC, migration
 * 20261112010000), laid over the contract-05 listings.
 *
 * Supabase is the review system of record: for every field it covers, its
 * state replaces the JSON contract's. Pending cases always blank the value.
 * Without SUPABASE_URL + SUPABASE_ANON_KEY, or if the call fails, listings are
 * returned unchanged (JSON contracts only).
 */

type Citation = FactCitation & { evidence_id?: string; title?: string };

type PublishedFact = {
  case_key: string;
  property_id: string;
  field: string;
  value: unknown;
  unit?: string | null;
  area_basis?: string | null;
  scope?: string | null;
  area_converted?: { sqft: number; sqm: number } | null;
  record_id?: string;
  citation?: Citation;
};

type PendingCase = {
  case_key: string;
  property_id: string;
  field: string;
  status: string;
  document_error?: boolean;
};

type ContextCase = {
  case_key: string;
  property_id: string;
  field: string;
  claims: {
    value: unknown;
    unit?: string | null;
    area_basis?: string | null;
    scope?: string | null;
    citation?: Citation;
  }[];
};

export type PublishedFactState = {
  properties: { property_id: string; property_name?: string | null }[];
  facts: PublishedFact[];
  pending: PendingCase[];
  context: ContextCase[];
};

/** Workbench property ids that differ from the listing ids. */
const PROPERTY_ALIASES: Record<string, string> = {
  "st-huberts-close": "59-st-huberts-close",
};

/** Workbench field -> contract 05 field key (see VerifiedFacts FIELD_LABELS). */
const FIELD_KEYS: Record<string, string> = {
  net_floor_area: "net_area",
  gross_floor_area: "gross_area",
  floor_area: "stated_area",
  energy_rating: "epc",
  epc_rating: "epc",
  parking_total: "parking",
};

export const listingId = (id: string) => PROPERTY_ALIASES[id] ?? id;
export const fieldKey = (field: string) => FIELD_KEYS[field] ?? field;

const num = (n: number) =>
  n.toLocaleString("en-GB", { maximumFractionDigits: 1 });

const BASIS: Record<string, string> = { net: "NIA", gross: "GIA" };

export function formatClaim(
  field: string,
  value: unknown,
  unit?: string | null,
  basis?: string | null,
  converted?: { sqft: number; sqm: number } | null,
): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  const n = typeof value === "number" ? value : Number(value);
  const isNum = Number.isFinite(n) && String(value).trim() !== "";
  if (unit === "GBP" && isNum) return `£${n.toLocaleString("en-GB")}`;
  if ((unit === "sqft" || unit === "sqm") && isNum) {
    const area = converted
      ? `${num(converted.sqft)} sq ft (${num(converted.sqm)} sq m)`
      : `${num(n)} ${unit === "sqft" ? "sq ft" : "sq m"}`;
    return `${area} ${basis ? BASIS[basis] ?? basis : "[basis not stated]"}`;
  }
  if (isNum && /parking/.test(field)) return `${n} space${n === 1 ? "" : "s"}`;
  if (isNum && field === "bedrooms") return `${n} bedroom${n === 1 ? "" : "s"}`;
  const s = String(value);
  return isNum && unit ? `${s} ${unit}` : s.charAt(0).toUpperCase() + s.slice(1);
}

const REVALIDATE_SECONDS = 30;

export async function loadPublishedFacts(): Promise<PublishedFactState | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url.replace(/\/$/, "")}/rest/v1/rpc/published_fact_state`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        next: { revalidate: REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()) as PublishedFactState;
  } catch (error) {
    console.error("Supabase published_fact_state failed; using JSON contracts", error);
    return null;
  }
}

function citationOf(c?: Citation): FactCitation | undefined {
  if (!c) return undefined;
  return {
    fact_id: c.evidence_id,
    doc_id: c.doc_id,
    doc_type: c.doc_type,
    issuer: c.issuer,
    page: c.page,
    quote: c.quote,
    doc_date: c.doc_date,
  };
}

/** Overlay Supabase review state onto listings; adds listings for new properties. */
export function applyFactOverlay(
  listings: Property[],
  state: PublishedFactState | null,
): Property[] {
  if (!state) return listings;

  const fields = new Map<string, Record<string, VerifiedField>>();
  const at = (pid: string) => {
    const id = listingId(pid);
    if (!fields.has(id)) fields.set(id, {});
    return fields.get(id)!;
  };

  for (const f of state.facts) {
    const key = fieldKey(f.field);
    const target = at(f.property_id);
    if (target[key]?.verification_status === "pending_verification") continue;
    target[key] = {
      value: f.value,
      display: formatClaim(f.field, f.value, f.unit, f.area_basis, f.area_converted),
      fact_id: f.record_id ?? null,
      verification_status: "verified",
      citation: citationOf(f.citation),
    };
  }
  for (const c of state.context) {
    const target = at(c.property_id);
    const key = fieldKey(c.field);
    if (target[key]?.verification_status === "pending_verification") continue;
    target[key] = {
      value: null,
      display: null,
      verification_status: "scoped",
      claims: c.claims.map((cl) => ({
        display: formatClaim(c.field, cl.value, cl.unit, cl.area_basis),
        scope: cl.scope ?? cl.area_basis ?? null,
        citation: citationOf(cl.citation),
      })),
    };
  }
  // Pending last: an open case always wins over any value for the same field.
  for (const p of state.pending) {
    const key = fieldKey(p.field);
    const target = at(p.property_id);
    const blocked = new Set([...(target[key]?.blocked_by ?? []), p.case_key]);
    target[key] = {
      value: null,
      display: "Pending verification",
      fact_id: null,
      verification_status: "pending_verification",
      blocked_by: [...blocked],
    };
  }

  const names = new Map(
    state.properties.map((p) => [listingId(p.property_id), p.property_name]),
  );
  const seen = new Set<string>();
  const out = listings.map((listing) => {
    const id = String(listing.property_id);
    const overlay = fields.get(id);
    if (!overlay || !listing.verified_fields) return listing;
    seen.add(id);
    const merged = { ...listing.verified_fields, ...overlay };
    const price = merged.price;
    return {
      ...listing,
      verified_fields: merged,
      // Never carry a JSON price the review now disputes.
      ...(price && price.verification_status !== "verified"
        ? { price: undefined, price_value: undefined }
        : price?.display
          ? { price: price.display, price_value: Number(price.value) || listing.price_value }
          : {}),
    };
  });

  // Properties reviewed in the workbench that have no listing contract yet.
  const added: Property[] = [];
  for (const [id, overlay] of fields) {
    if (seen.has(id) || listings.some((l) => String(l.property_id) === id)) continue;
    const price = overlay.price?.verification_status === "verified" ? overlay.price : null;
    added.push({
      property_id: id,
      reference: id,
      address: { display: names.get(id) ?? id },
      price: price?.display ?? undefined,
      price_value: price ? Number(price.value) || undefined : undefined,
      key_features: [],
      images: [],
      verified_fields: overlay,
    });
  }
  return [...out, ...added];
}
