import type { Property } from "./property-types";
import { primaryImage } from "./property-types";
import { shortAddress, titleFor } from "./format";

/**
 * Slim, serialisable view of a listing for the interactive pages. The full
 * dataset embeds several base64 images per property; these pages only need
 * one thumbnail, so everything else is dropped before it reaches the browser.
 */
export type ListingSummary = {
  id: string;
  reference: string | null;
  title: string;
  address: string;
  postcode: string;
  district: string;
  lat: number | null;
  lng: number | null;
  price: number;
  priceLabel: string;
  /** "let" for rentals (price is per month), "sale" for homes for sale. */
  deal: "let" | "sale";
  bedrooms: number;
  bathrooms: number;
  receptions: number;
  type: string;
  furnishing: string;
  liveDate: string;
  features: string[];
  blurb: string;
  image: string | null;
  verified: boolean;
  /** Fields held back from the listing until a contradiction is resolved. */
  pendingChecks: number;
  councilTax: string | null;
  deposit: string | null;
};

export function toSummary(p: Property): ListingSummary {
  const postcode = p.address?.postcode ?? "";
  const price = p.price_value ?? 0;
  const tx = `${p.transaction_type ?? ""} ${p.status ?? ""} ${p.price ?? ""}`.toLowerCase();
  const deal: "let" | "sale" =
    /sale|guide|offers|freehold|leasehold/.test(tx) || (!/let|pcm|pw/.test(tx) && price >= 50000)
      ? "sale"
      : "let";
  return {
    id: String(p.property_id),
    reference: p.reference ?? null,
    title: titleFor(p),
    address: shortAddress(p),
    postcode,
    district: postcode.split(" ")[0] || "London",
    lat: p.address?.latitude ?? null,
    lng: p.address?.longitude ?? null,
    price,
    priceLabel: p.price ?? (price ? `£${price.toLocaleString()}${deal === "let" ? " pcm" : ""}` : "POA"),
    deal,
    bedrooms: p.bedrooms ?? 0,
    bathrooms: p.bathrooms ?? 0,
    receptions: p.reception_rooms ?? 0,
    type: (p.property_type ?? "other").toLowerCase(),
    furnishing: p.furnishing ?? "unspecified",
    liveDate: p.live_date ?? "",
    features: [...new Set(p.key_features ?? [])].slice(0, 4),
    blurb: (p.description ?? "").slice(0, 180),
    image: primaryImage(p),
    verified: Boolean(p.verified_fields),
    pendingChecks: Object.values(p.verified_fields ?? {}).filter((f) => f?.verification_status === "pending_verification").length,
    councilTax: p.council_tax_band ?? null,
    deposit: p.security_deposit ?? null,
  };
}

/**
 * Categorical colours per property type, in a fixed order (validated for
 * colour-blind separation on both the light and dark surfaces).
 */
const TYPE_ORDER = ["apartment", "flat", "penthouse", "maisonette", "house", "other"] as const;
const TYPE_HEX = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#6250d6"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#9085e9"],
};

function typeSlot(type: string): number {
  const i = TYPE_ORDER.indexOf(type as (typeof TYPE_ORDER)[number]);
  return i < 0 ? TYPE_ORDER.length - 1 : i;
}

/** CSS colour for DOM elements; follows the active theme automatically. */
export function typeColor(type: string): string {
  return `var(--re-type-${typeSlot(type) + 1})`;
}

/** Plain hex for SVG chart marks, which need a concrete colour. */
export function typeHex(type: string, theme: "light" | "dark"): string {
  return TYPE_HEX[theme][typeSlot(type)];
}

export const TYPE_CSS_VARS = TYPE_HEX;

export function bedsShort(n: number): string {
  return n === 0 ? "Studio" : `${n} bed`;
}

export function shortMoney(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n % 1_000_000 ? 2 : 0).replace(/0$/, "")}m`;
  if (n >= 10_000) return `£${Math.round(n / 1000)}k`;
  return `£${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
}

export function money(n: number): string {
  return `£${Math.round(n).toLocaleString("en-GB")}`;
}
