export type PropertyAddress = {
  display?: string;
  full?: string;
  town?: string;
  postcode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

export type PropertyBranch = {
  name?: string;
  email?: string;
  phone?: string;
};

/** Where a verified fact came from (fact_record contract 05). */
export type FactCitation = {
  fact_id?: string;
  doc_id?: string;
  doc_type?: string;
  issuer?: string;
  page?: number;
  quote?: string;
  doc_date?: string;
};

export type VerificationStatus =
  | "verified"
  | "pending_verification"
  | "not_stated"
  | (string & {});

/** One field of a verified listing (fact_record contract 05). */
export type VerifiedField = {
  value?: unknown;
  display?: string | null;
  fact_id?: string | null;
  verification_status: VerificationStatus;
  citation?: FactCitation;
  blocked_by?: string[];
  items?: { text: string; fact_id?: string; verification_status?: string }[];
};

export type Property = {
  source_url?: string;
  property_id: number | string;
  reference?: string;
  agency?: string;
  branch?: PropertyBranch;
  status?: string;
  availability?: string;
  live_date?: string;
  price?: string;
  price_value?: number;
  address?: PropertyAddress;
  property_type?: string;
  transaction_type?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  showers?: number | null;
  reception_rooms?: number | null;
  furnishing?: string;
  description?: string;
  key_features?: string[];
  tags?: string[];
  council_tax_band?: string;
  security_deposit?: string;
  images?: string[];
  image_data?: string[];
  floorplans?: string[];
  epc?: { image?: string; rating?: string } | null;
  /** Set on listings that come from the fact_record pipeline (contract 05). */
  verified_fields?: Record<string, VerifiedField>;
  fact_provenance?: Record<string, string | null>;
  verification_status?: Record<string, VerificationStatus>;
};

export function isVerifiedListing(p: Property): boolean {
  return Boolean(p.verified_fields);
}

export function fieldStatus(
  p: Property,
  field: string,
): VerificationStatus | null {
  return p.verified_fields?.[field]?.verification_status ?? null;
}

export function propertyPhotos(p: Property): string[] {
  const embedded = p.image_data?.filter(Boolean) ?? [];
  const floorplanCount = p.floorplans?.filter(Boolean).length ?? 0;
  const embeddedPhotos = embedded.slice(floorplanCount);

  return embeddedPhotos.length ? embeddedPhotos : p.images?.filter(Boolean) ?? [];
}

export function primaryImage(p: Property): string | null {
  return propertyPhotos(p)[0] ?? null;
}
