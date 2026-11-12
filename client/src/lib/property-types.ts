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
  floorplans?: string[];
  epc?: { image?: string } | null;
};

export function primaryImage(p: Property): string | null {
  return p.images?.find(Boolean) ?? null;
}
