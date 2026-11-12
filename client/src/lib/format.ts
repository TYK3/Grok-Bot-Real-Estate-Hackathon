import type { Property } from "./property-types";
import { fieldStatus, isVerifiedListing } from "./property-types";

export const PENDING_LABEL = "Pending verification";

export function shortAddress(p: Property): string {
  return p.address?.display ?? p.address?.full ?? "Address not stated";
}

export function fullAddress(p: Property): string {
  return p.address?.full ?? p.address?.display ?? "Address not stated";
}

export function priceLabel(p: Property): string {
  // Contract 05: a field blocked by an open contradiction carries no value.
  const status = fieldStatus(p, "price");
  if (status === "pending_verification") return PENDING_LABEL;
  if (status === "not_stated") return "Price not stated";
  return p.price ?? (p.price_value ? `£${p.price_value.toLocaleString()} pcm` : "POA");
}

/** Sidebar heading over the price: verified listings may be for sale. */
export function priceHeading(p: Property): string {
  return isVerifiedListing(p) ? "Price" : "Rent";
}

export function bedsLabel(p: Property): string {
  if (p.bedrooms == null) {
    if (isVerifiedListing(p)) {
      return fieldStatus(p, "bedrooms") === "pending_verification"
        ? `Beds: ${PENDING_LABEL.toLowerCase()}`
        : "Beds not stated";
    }
    return "Studio";
  }
  return `${p.bedrooms} bed${p.bedrooms === 1 ? "" : "s"}`;
}

export function bathsLabel(p: Property): string {
  if (p.bathrooms == null && isVerifiedListing(p)) return "Baths not stated";
  const n = p.bathrooms ?? 0;
  return `${n} bath${n === 1 ? "" : "s"}`;
}

export function receptionLabel(p: Property): string | null {
  if (p.reception_rooms == null && isVerifiedListing(p)) return null;
  return `${p.reception_rooms ?? 0} reception`;
}

export function titleFor(p: Property): string {
  if (isVerifiedListing(p) && !p.property_type) {
    return p.address?.display ?? p.address?.full ?? "Verified listing";
  }
  const type = p.property_type
    ? p.property_type.charAt(0).toUpperCase() + p.property_type.slice(1)
    : "Property";
  return `${type} in ${p.address?.town ?? p.address?.postcode ?? "London"}`;
}

export function capitalise(value?: string | null): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
