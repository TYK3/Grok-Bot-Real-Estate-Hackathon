import "server-only";
import fs from "node:fs";
import path from "node:path";

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

export function getAllProperties(): Property[] {
  if (cache) return cache;
  const hamptons = readJson<Property[]>(DATA_PATH);
  // Verified listings first, then the Hamptons catalogue.
  cache = [
    ...loadVerifiedListings(),
    ...(Array.isArray(hamptons) ? hamptons : []),
  ];
  return cache;
}

export function getPropertyById(id: string): Property | null {
  const target = decodeURIComponent(String(id)).trim();
  return (
    getAllProperties().find(
      (p) =>
        String(p.property_id) === target ||
        String(p.reference ?? "") === target,
    ) ?? null
  );
}
