/** Shapes of what Haven shows on its stage. The agent writes them to
 *  data/sessions/<room>/stage.json (src/session_store.save_stage); the Haven
 *  page also builds example versions from real data for its previews. */

export type StageKind = "map" | "price" | "agreement" | "viewing" | "reservation";

export type MapResult = {
  id: string;
  title?: string;
  address?: string;
  price?: string;
  bedrooms?: number | string | null;
  property_type?: string | null;
  lat?: number | null;
  lon?: number | null;
  nearest?: string;
  metres?: number;
  walk_minutes?: number;
};

export type MapStage = {
  amenity: string;
  max_price?: number | null;
  min_bedrooms?: number | null;
  results: MapResult[];
};

export type PriceStage = {
  property_id: string;
  title: string;
  price: number;
  bedrooms: number | null;
  basis: string;
  count: number;
  average: number;
  median: number;
  min: number;
  max: number;
  delta_pct: number;
  percentile: number;
  prices: number[];
  comparables: { id: string; title: string; price: number; bedrooms: number | null }[];
};

export type AgreementStage = {
  question: string;
  document: string;
  version?: string;
  clauses: { id: string; title: string; text: string }[];
  listing: { label: string; value: string }[];
  property_id: string | null;
  disclaimer: string;
};

export type ViewingStage = {
  property_id?: string | null;
  title?: string;
  date: string;
  time?: string;
  customer_name?: string;
  status?: string;
};

export type ReservationStage = {
  reference: string;
  property_id: string;
  title: string;
  price?: string | null;
  customer_name?: string;
  move_in_date?: string;
};

export type StageData =
  | { kind: "map"; data: MapStage }
  | { kind: "price"; data: PriceStage }
  | { kind: "agreement"; data: AgreementStage }
  | { kind: "viewing"; data: ViewingStage }
  | { kind: "reservation"; data: ReservationStage };

export type HavenPreviews = { [K in StageKind]: Extract<StageData, { kind: K }>["data"] };
