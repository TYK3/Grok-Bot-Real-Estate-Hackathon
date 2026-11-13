import "server-only";
import fs from "node:fs";
import path from "node:path";

import type { ListingSummary } from "@/lib/listing-summary";
import { money } from "@/lib/listing-summary";
import type { AgreementStage, HavenPreviews, MapResult, PriceStage } from "@/lib/haven-types";

/**
 * Example stages for the Haven page, built from the same data the agent uses
 * (listings, work/amenities.json, work/tenancy_terms.json), so a visitor can
 * see each capability before starting a call.
 */

const WORK_DIR = process.env.HAVEN_WORK_DIR ?? path.join(process.cwd(), "..", "work");

type Point = { name: string; lat: number; lon: number };

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(WORK_DIR, file), "utf8")) as T;
  } catch {
    return null;
  }
}

function metres(a: [number, number], b: [number, number]) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearPreview(listings: ListingSummary[], amenity = "park", maxPrice = 2500, minBeds = 2) {
  const points = readJson<Record<string, Point[]>>("amenities.json")?.[amenity] ?? [];
  const results: MapResult[] = listings
    .filter((l) => l.deal === "let" && l.lat != null && l.lng != null && l.price <= maxPrice && l.bedrooms >= minBeds)
    .flatMap((l) => {
      if (!points.length) return [];
      let best = points[0];
      let dist = Infinity;
      for (const p of points) {
        const d = metres([l.lat!, l.lng!], [p.lat, p.lon]);
        if (d < dist) {
          dist = d;
          best = p;
        }
      }
      return [{
        id: l.id,
        title: l.title,
        address: l.address,
        price: l.priceLabel,
        bedrooms: l.bedrooms,
        property_type: l.type,
        lat: l.lat,
        lon: l.lng,
        nearest: best.name,
        metres: Math.round(dist),
        walk_minutes: Math.max(1, Math.round(dist / 80)),
      }];
    })
    .sort((a, b) => (a.metres ?? 0) - (b.metres ?? 0))
    .slice(0, 5);
  return { amenity, max_price: maxPrice, min_bedrooms: minBeds, results };
}

export function pricePreview(listings: ListingSummary[], subject: ListingSummary): PriceStage | null {
  if (subject.deal !== "let") return null;
  const lets = listings.filter((l) => l.deal === "let" && l.id !== subject.id && l.price > 0);
  const same = lets.filter((l) => l.bedrooms === subject.bedrooms);
  const [pool, basis] = same.length >= 3 ? [same, `${subject.bedrooms}-bedroom lettings`] : [lets, "all lettings"];
  const prices = pool.map((l) => l.price).sort((a, b) => a - b);
  if (!prices.length) return null;
  const avg = prices.reduce((s, v) => s + v, 0) / prices.length;
  const mid = prices.length % 2 ? prices[(prices.length - 1) / 2] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
  return {
    property_id: subject.id,
    title: subject.title,
    price: subject.price,
    bedrooms: subject.bedrooms,
    basis,
    count: prices.length,
    average: Math.round(avg),
    median: Math.round(mid),
    min: prices[0],
    max: prices[prices.length - 1],
    delta_pct: Math.round(((subject.price - avg) / avg) * 1000) / 10,
    percentile: Math.round((prices.filter((v) => v < subject.price).length / prices.length) * 100),
    prices,
    comparables: [...pool]
      .sort((a, b) => Math.abs(a.price - subject.price) - Math.abs(b.price - subject.price))
      .slice(0, 5)
      .map((l) => ({ id: l.id, title: l.title, price: l.price, bedrooms: l.bedrooms })),
  };
}

type Terms = { document?: { title?: string; version?: string }; clauses?: { id: string; title: string; text: string }[] };

export function agreementPreview(subject: ListingSummary | null): AgreementStage {
  const terms = readJson<Terms>("tenancy_terms.json") ?? {};
  const pick = new Set(["5", "4"]);
  const listing: { label: string; value: string }[] = [];
  if (subject) {
    if (subject.councilTax) listing.push({ label: "Council tax band", value: subject.councilTax });
    if (subject.liveDate) listing.push({ label: "Available from", value: subject.liveDate });
    if (subject.furnishing) listing.push({ label: "Furnishing", value: subject.furnishing });
    if (subject.deal === "let") listing.push({ label: "Max deposit (5 weeks)", value: money((subject.price * 12 * 5) / 52) });
  }
  return {
    question: "How much notice do I give, and is my deposit protected?",
    document: terms.document?.title ?? "Standard tenancy terms",
    version: terms.document?.version,
    clauses: (terms.clauses ?? []).filter((c) => pick.has(c.id)).map(({ id, title, text }) => ({ id, title, text })),
    listing,
    property_id: subject?.id ?? null,
    disclaimer: "This is a summary of our standard terms, not legal advice; the lettings team confirms the final agreement.",
  };
}

function nextWeekday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function getHavenPreviews(listings: ListingSummary[], contextId: string | null): HavenPreviews {
  const lets = listings.filter((l) => l.deal === "let");
  const subject = listings.find((l) => l.id === contextId) ?? lets[0] ?? listings[0];
  const letSubject = subject?.deal === "let" ? subject : lets[0];
  return {
    map: nearPreview(listings),
    price: (letSubject && pricePreview(listings, letSubject)) as PriceStage,
    agreement: agreementPreview(subject ?? null),
    viewing: {
      property_id: subject?.id,
      title: subject?.title,
      date: nextWeekday(3),
      time: "14:00",
      customer_name: "Sam",
      status: "confirmed",
    },
    reservation: {
      reference: "HV-EXAMPLE",
      property_id: letSubject?.id ?? "",
      title: letSubject?.title ?? "",
      price: letSubject?.priceLabel,
      customer_name: "Sam",
      move_in_date: nextWeekday(21),
    },
  };
}
