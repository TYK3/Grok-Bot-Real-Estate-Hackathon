import type { Property } from "./property-types";

export function shortAddress(p: Property): string {
  return p.address?.display ?? p.address?.full ?? "Address not stated";
}

export function fullAddress(p: Property): string {
  return p.address?.full ?? p.address?.display ?? "Address not stated";
}

export function priceLabel(p: Property): string {
  return p.price ?? (p.price_value ? `£${p.price_value.toLocaleString()} pcm` : "POA");
}

export function bedsLabel(p: Property): string {
  if (p.bedrooms == null) return "Studio";
  return `${p.bedrooms} bed${p.bedrooms === 1 ? "" : "s"}`;
}

export function bathsLabel(p: Property): string {
  const n = p.bathrooms ?? 0;
  return `${n} bath${n === 1 ? "" : "s"}`;
}

export function titleFor(p: Property): string {
  const type = p.property_type
    ? p.property_type.charAt(0).toUpperCase() + p.property_type.slice(1)
    : "Property";
  return `${type} in ${p.address?.town ?? p.address?.postcode ?? "London"}`;
}

export function capitalise(value?: string | null): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
