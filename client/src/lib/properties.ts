import "server-only";
import fs from "node:fs";
import path from "node:path";

import { applyFactOverlay, loadPublishedFacts } from "./fact-overlay";
import type { Property, VerifiedField } from "./property-types";

export type { Property } from "./property-types";
export { primaryImage } from "./property-types";

const DATA_PATH = path.join(
  process.cwd(),
  "..",
  "work",
  "hamptons_e14_2dr_lettings.json",
);

// Verified listings published by the fact_record pipeline (contract 05).
const VERIFIED_PATH =
  process.env.FACT_LISTING_PATH ??
  path.join(process.cwd(), "..", "fact_record", "contracts", "05_listing.json");

type ListingContract = {
  listings?: Record<
    string,
    { property?: Property; fields?: Record<string, VerifiedField> }
  >;
};

let cache: Property[] | null = null;

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadVerifiedListings(): Property[] {
  const contract = readJson<ListingContract>(VERIFIED_PATH);
  if (!contract?.listings) return [];
  return Object.values(contract.listings)
    .filter((l) => l.property)
    .map((l) => ({
      ...(l.property as Property),
      // Duplicate feature facts from different pages read as one feature.
      key_features: [...new Set(l.property?.key_features ?? [])],
      verified_fields: l.fields ?? {},
    }));
}

function getStaticProperties(): Property[] {
  if (cache) return cache;
  const hamptons = readJson<Property[]>(DATA_PATH);
  // Verified listings first, then the Hamptons catalogue.
  cache = [
    ...loadVerifiedListings(),
    ...(Array.isArray(hamptons) ? hamptons : []),
  ];
  return cache;
}

/**
 * JSON listings with the reviewed Supabase facts laid over the verified ones
 * (fact-overlay.ts). Falls back to the JSON contracts when Supabase is unset
 * or unreachable. The Supabase call is cached for 30 s by Next's fetch cache.
 */
export async function getAllProperties(): Promise<Property[]> {
  return applyFactOverlay(getStaticProperties(), await loadPublishedFacts());
}

export async function getPropertyById(id: string): Promise<Property | null> {
  const target = decodeURIComponent(String(id)).trim();
  return (
    (await getAllProperties()).find(
      (p) =>
        String(p.property_id) === target ||
        String(p.reference ?? "") === target,
    ) ?? null
  );
}
