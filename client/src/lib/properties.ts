import "server-only";
import fs from "node:fs";
import path from "node:path";

import type { Property } from "./property-types";

export type { Property } from "./property-types";
export { primaryImage } from "./property-types";

const DATA_PATH = path.join(
  process.cwd(),
  "..",
  "work",
  "hamptons_e14_2dr_lettings.json",
);

let cache: Property[] | null = null;

export function getAllProperties(): Property[] {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as Property[];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function getPropertyById(id: string): Property | null {
  const target = String(id).trim();
  return (
    getAllProperties().find(
      (p) =>
        String(p.property_id) === target ||
        String(p.reference ?? "") === target,
    ) ?? null
  );
}
