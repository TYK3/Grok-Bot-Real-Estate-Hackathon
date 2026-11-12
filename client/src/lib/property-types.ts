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

export type Property = {
  source_url?: string;
  property_id: number;
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
  epc?: { image?: string } | null;
};

export function propertyPhotos(p: Property): string[] {
  const embedded = p.image_data?.filter(Boolean) ?? [];
  const floorplanCount = p.floorplans?.filter(Boolean).length ?? 0;
  const embeddedPhotos = embedded.slice(floorplanCount);

  return embeddedPhotos.length ? embeddedPhotos : p.images?.filter(Boolean) ?? [];
}

export function primaryImage(p: Property): string | null {
  return propertyPhotos(p)[0] ?? null;
}
