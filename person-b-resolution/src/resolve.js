/**
 * Verified Fact Record — contradiction classification and resolution engine.
 *
 * Shared ES module: runs in Node (CLI + `node --test`) and in the browser
 * (the review UI imports this same file). No dependencies.
 *
 * ---------------------------------------------------------------------------
 * Decision order
 * ---------------------------------------------------------------------------
 * Facts are grouped by property_id + canonical field. Net and gross floor
 * area are kept as *separate* groups / resolved facts (a fact with
 * field=floor_area and area_basis=net is filed under net_floor_area).
 *
 * Within a group, each pair is classified as exactly one of the following.
 * The first matching rule wins:
 *
 *   0. AGREE
 *      Same normalised value, same unit (or both unitless), same area basis.
 *
 *   1. UNIT_MISMATCH
 *      a. Different area units (sqft vs sqm) and the values agree after
 *         conversion, within `unit_tolerance` (default 2%).
 *      b. Different area_basis (net vs gross): ALWAYS a basis mismatch,
 *         NEVER a conflict, even when the numbers differ. In normal
 *         operation these are split into two resolved facts before pairing;
 *         classifyPair still returns UNIT_MISMATCH if called directly.
 *      If units differ but converted values do *not* agree, this rule does
 *      not apply — fall through (it may be a true conflict or something else).
 *
 *   2. OFFICIAL_RECORD_DISAGREEMENT
 *      At least one source is an official record (Land Registry, EPC
 *      register, …) and the values disagree. Exception: for `price`, an
 *      official record is a last-sold (historical) price, so the pair is
 *      classified as SUPERSEDED (by time), not as this type. See step 4.
 *
 *   3. STALE_LISTING
 *      One source is a listing, the other is not, and the listing is out
 *      of date: either it has an earlier date than the other source, or it
 *      is older than `staleness_days` (default 90) relative to the other
 *      source (or the configured as-of date).
 *
 *   4. SUPERSEDED
 *      A newer dated document replaces an older one (revised brochure,
 *      asking-price reduction, historical official sale vs current asking
 *      price). Requires the dates to differ.
 *
 *   5. TRUE_CONFLICT
 *      Residual genuine disagreement — same-day (or undated) sources,
 *      with no unit, official-record, or staleness explanation.
 *
 * The field's `primary_classification` is the most significant non-AGREE
 * pair classification, in this headline order:
 *   OFFICIAL_RECORD_DISAGREEMENT > TRUE_CONFLICT > UNIT_MISMATCH
 *     > SUPERSEDED > STALE_LISTING > AGREE
 *
 * Each non-winning candidate is classified against the winning fact
 * (same decision order). The winner is tagged WINNER.
 *
 * Winner selection (per-field rules in config/field_rules.json):
 *   tenure            official_record > brochure > listing
 *   floor area        official / EPC register > brochure > listing
 *   price             most recent dated brochure or listing
 *                     (official last-sold is historical, never the winner)
 *   energy_rating     EPC register (official_record) wins
 *   parking           brochure > listing
 *   Tie-breaker:      most recent date (published_date, else retrieved_date)
 *
 * Status: TRUE_CONFLICT and OFFICIAL_RECORD_DISAGREEMENT → needs_review;
 * everything else → auto_resolved. Human Accept / Choose / Edit appends
 * an audit entry and sets status to `accepted`. Audit is append-only.
 */

export const SQFT_PER_SQM = 10.76391041671;
export const DEFAULT_TOLERANCE = 0.02;
export const DEFAULT_STALENESS_DAYS = 90;
export const SCHEMA_VERSION = '1.0';

export const CLASSIFICATIONS = Object.freeze({
  AGREE: 'AGREE',
  TRUE_CONFLICT: 'TRUE_CONFLICT',
  SUPERSEDED: 'SUPERSEDED', // version supersession (spec name)
  SUPERSESSION: 'SUPERSEDED', // alias
  UNIT_MISMATCH: 'UNIT_MISMATCH',
  STALE_LISTING: 'STALE_LISTING',
  OFFICIAL_RECORD_DISAGREEMENT: 'OFFICIAL_RECORD_DISAGREEMENT',
  SCOPE_DIFFERENCE: 'SCOPE_DIFFERENCE',
  PLOT_OR_TYPE: 'PLOT_OR_TYPE',
  UNMATCHED: 'UNMATCHED',
  WINNER: 'WINNER',
});

/** Headline priority: higher number is more significant. */
export const HEADLINE_PRIORITY = Object.freeze({
  OFFICIAL_RECORD_DISAGREEMENT: 60,
  TRUE_CONFLICT: 50,
  UNMATCHED: 45,
  UNIT_MISMATCH: 40,
  SCOPE_DIFFERENCE: 35,
  PLOT_OR_TYPE: 34,
  SUPERSEDED: 20,
  STALE_LISTING: 10,
  AGREE: 0,
  WINNER: 0,
});

export const STATUSES = Object.freeze({
  VERIFIED: 'verified',
  PENDING: 'pending',
  CONFLICTING: 'conflicting',
  UNKNOWN: 'unknown',
});

export const DEFAULT_RULES = Object.freeze({
  staleness_days: DEFAULT_STALENESS_DAYS,
  unit_tolerance: DEFAULT_TOLERANCE,
  sqft_per_sqm: SQFT_PER_SQM,
  as_of: null,
  entity_match_threshold: 0.7,
  material_fields: ['price', 'tenure', 'net_floor_area', 'gross_floor_area', 'floor_area'],
  source_tiers: [
    { tier: 1, name: 'signed_legal', types: ['contract', 'signed_legal', 'lease', 'sale_contract', 'reservation', 'reservation_agreement', 'title', 'current_title'] },
    { tier: 2, name: 'official_register', types: ['official_record', 'land_registry', 'hmlr', 'epc_register', 'voa', 'price_paid'] },
    { tier: 3, name: 'signed_spec', types: ['specification', 'measured_survey', 'design_spec', 'survey', 'signed_specification'] },
    { tier: 4, name: 'price_list', types: ['price_list', 'signed_price_list', 'developer_instruction'] },
    { tier: 5, name: 'brochure', types: ['brochure', 'particulars', 'sale_particulars'] },
    { tier: 6, name: 'listing', types: ['listing', 'portal', 'web_listing', 'advert', 'crm', 'verbal'] },
  ],
  fields: {
    price: {
      label: 'Price',
      winner: 'highest_tier_then_most_recent',
      material: true,
      precedence: ['brochure', 'listing'],
      official_is_historical: true,
    },
    tenure: {
      label: 'Tenure',
      material: true,
      precedence: ['official_record', 'brochure', 'listing'],
    },
    net_floor_area: {
      label: 'Net floor area (NIA)',
      material: true,
      precedence: ['official_record', 'brochure', 'listing'],
      area_basis: 'net',
    },
    gross_floor_area: {
      label: 'Gross floor area (GIA)',
      material: true,
      precedence: ['official_record', 'brochure', 'listing'],
      area_basis: 'gross',
    },
    floor_area: {
      label: 'Floor area',
      material: true,
      precedence: ['official_record', 'brochure', 'listing'],
      split_net_gross: true,
    },
    energy_rating: {
      label: 'Energy rating (EPC)',
      precedence: ['official_record', 'brochure', 'listing'],
    },
    parking: {
      label: 'Parking',
      precedence: ['brochure', 'listing', 'official_record'],
    },
  },
});

const FIELD_ALIASES = {
  price: 'price',
  asking_price: 'price',
  guide_price: 'price',
  sale_price: 'price',
  askingprice: 'price',
  tenure: 'tenure',
  title_tenure: 'tenure',
  freehold_or_leasehold: 'tenure',
  net_floor_area: 'net_floor_area',
  net_area: 'net_floor_area',
  floor_area_net: 'net_floor_area',
  nia: 'net_floor_area',
  nia_sqft: 'net_floor_area',
  nia_sqm: 'net_floor_area',
  lower_ground_area: 'lower_ground_floor_area',
  lower_ground_floor_area: 'lower_ground_floor_area',
  lower_ground: 'lower_ground_floor_area',
  gross_floor_area: 'gross_floor_area',
  gross_area: 'gross_floor_area',
  floor_area_gross: 'gross_floor_area',
  gia: 'gross_floor_area',
  gia_sqft: 'gross_floor_area',
  gia_sqm: 'gross_floor_area',
  floor_area: 'floor_area',
  floorarea: 'floor_area',
  area: 'floor_area',
  size: 'floor_area',
  size_sqft: 'floor_area',
  size_sqm: 'floor_area',
  energy_rating: 'energy_rating',
  epc: 'energy_rating',
  epc_rating: 'energy_rating',
  energy: 'energy_rating',
  parking: 'parking',
  parking_spaces: 'parking',
  spaces: 'parking',
  parking_scope: 'parking_scope',
  parking_total: 'parking_total',
  en_suite_bathroom: 'en_suite_bathroom',
  ensuites: 'en_suite_bathroom',
};

const OFFICIAL_DOC_TYPES = new Set([
  'official_record',
  'official',
  'land_registry',
  'land-registry',
  'hmlr',
  'hm_land_registry',
  'epc_register',
  'epc-register',
  'voa',
  'price_paid',
  'price-paid',
]);

const BROCHURE_DOC_TYPES = new Set(['brochure', 'particulars', 'sale_particulars']);
const LISTING_DOC_TYPES = new Set(['listing', 'portal', 'web_listing', 'advert', 'crm', 'verbal']);
const CONTRACT_DOC_TYPES = new Set(['contract', 'signed_legal', 'lease', 'sale_contract', 'reservation', 'reservation_agreement', 'title', 'current_title']);
const SPEC_DOC_TYPES = new Set(['specification', 'measured_survey', 'design_spec', 'survey', 'signed_specification']);
const PRICE_LIST_DOC_TYPES = new Set(['price_list', 'signed_price_list', 'developer_instruction']);

const AREA_FIELDS = new Set(['net_floor_area', 'gross_floor_area', 'floor_area', 'lower_ground_floor_area']);

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

export function mergeRules(overrides) {
  if (!overrides) return structuredClone(DEFAULT_RULES);
  const base = structuredClone(DEFAULT_RULES);
  const out = { ...base, ...overrides, fields: { ...base.fields, ...(overrides.fields || {}) } };
  for (const [k, v] of Object.entries(overrides.fields || {})) {
    out.fields[k] = { ...(base.fields[k] || {}), ...v };
  }
  return out;
}

export function canonicalField(raw) {
  if (raw == null) return 'unknown';
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return FIELD_ALIASES[key] || key;
}

export function canonicalDocType(raw) {
  if (raw == null || raw === '') return 'unknown';
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (OFFICIAL_DOC_TYPES.has(key)) return 'official_record';
  if (BROCHURE_DOC_TYPES.has(key)) return 'brochure';
  if (LISTING_DOC_TYPES.has(key)) return 'listing';
  return key;
}

export function isOfficial(fact) {
  return canonicalDocType(sourceOf(fact).doc_type) === 'official_record';
}

export function isListing(fact) {
  return canonicalDocType(sourceOf(fact).doc_type) === 'listing';
}

export function isBrochure(fact) {
  return canonicalDocType(sourceOf(fact).doc_type) === 'brochure';
}

export function issuerOf(fact) {
  const s = sourceOf(fact);
  return s.issuer || s.agent || s.publisher || null;
}

export function sourceTier(fact, rules = DEFAULT_RULES) {
  const t = canonicalDocType(sourceOf(fact).doc_type);
  const tiers = (rules && rules.source_tiers) || DEFAULT_RULES.source_tiers;
  for (const row of tiers) {
    if (row.types.includes(t) || row.types.includes(sourceOf(fact).doc_type)) return row.tier;
  }
  // Fall back via canonical families
  if (CONTRACT_DOC_TYPES.has(t)) return 1;
  if (OFFICIAL_DOC_TYPES.has(t) || t === 'official_record') return 2;
  if (SPEC_DOC_TYPES.has(t)) return 3;
  if (PRICE_LIST_DOC_TYPES.has(t)) return 4;
  if (BROCHURE_DOC_TYPES.has(t) || t === 'brochure') return 5;
  if (LISTING_DOC_TYPES.has(t) || t === 'listing') return 6;
  return 50;
}

export function sourceTierName(fact, rules = DEFAULT_RULES) {
  const n = sourceTier(fact, rules);
  const tiers = (rules && rules.source_tiers) || DEFAULT_RULES.source_tiers;
  const row = tiers.find((r) => r.tier === n);
  return row ? row.name : 'unknown';
}

export function isConfidentMatch(fact, rules = DEFAULT_RULES) {
  const threshold = (rules && rules.entity_match_threshold) ?? 0.7;
  const em = fact.entity_match;
  if (em) {
    if (em.confident === false) return false;
    const c = String(em.confidence || '').toLowerCase();
    if (['low', 'uncertain', 'unmatched', 'refused', 'weak'].includes(c)) return false;
    if (typeof em.score === 'number' && em.score < threshold) return false;
  }
  if (typeof fact.entity_match_confidence === 'number' && fact.entity_match_confidence < threshold) {
    return false;
  }
  return true;
}

export function statedEquivalentOf(fact) {
  if (fact && fact.stated_equivalent && fact.stated_equivalent.value != null) {
    return {
      value: parseNumber(fact.stated_equivalent.value),
      unit: canonicalUnit(fact.stated_equivalent.unit),
    };
  }
  return parseStatedEquivalentFromQuote(fact && fact.quote, fact);
}

const UNIT_TOKEN = '(?:sq\.?\s*m(?:etres?)?|m[²2]|sq\.?\s*ft|sf|ft[²2])';

export function parseStatedEquivalentFromQuote(quote, fact) {
  if (!quote) return null;
  const re = new RegExp(
    '(\\d[\\d,]*(?:\\.\\d+)?)\\s*(' + UNIT_TOKEN + ')\\s*(?:\\/|,|or|as|=|\\()\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*(' + UNIT_TOKEN + ')',
    'i'
  );
  const m = String(quote).match(re);
  if (!m) return null;
  const u1 = canonicalUnit(m[2]);
  const u2 = canonicalUnit(m[4]);
  const v1 = parseNumber(m[1]);
  const v2 = parseNumber(m[3]);
  if (!u1 || !u2 || u1 === u2) return null;
  const factUnit = fact ? canonicalUnit(fact.unit) : null;
  if (factUnit && factUnit === u1) return { value: v2, unit: u2 };
  if (factUnit && factUnit === u2) return { value: v1, unit: u1 };
  return { value: v2, unit: u2, other: { value: v1, unit: u1 } };
}

export function isWrongConversion(fact, rules = DEFAULT_RULES) {
  const eq = statedEquivalentOf(fact);
  if (!eq || eq.value == null || !eq.unit) return false;
  const sqftPer = rules.sqft_per_sqm ?? SQFT_PER_SQM;
  const a = toSqm(fact.value, fact.unit, sqftPer);
  const b = toSqm(eq.value, eq.unit, sqftPer);
  if (a == null || b == null) return false;
  return !valuesWithinTolerance(a, b, rules.unit_tolerance ?? DEFAULT_TOLERANCE);
}

export function plotKey(fact) {
  const plot = fact.plot || fact.plot_id || fact.unit_id || '';
  const type = fact.unit_type || fact.house_type || '';
  return { plot: String(plot).trim().toLowerCase(), unit_type: String(type).trim().toLowerCase() };
}

export function plotOrTypeClash(factA, factB) {
  const a = plotKey(factA);
  const b = plotKey(factB);
  if (a.plot && b.plot && a.plot !== b.plot) {
    return `Different plots (${factA.plot} vs ${factB.plot}). Resolve the entity first; never merge plots. A fact belongs to a named plot only.`;
  }
  if (a.unit_type && b.unit_type && a.unit_type !== b.unit_type) {
    return `Different house types (${factA.unit_type} vs ${factB.unit_type}). Never merge types. Answer only for the named type.`;
  }
  return null;
}

export function canonicalScope(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (['development', 'scheme', 'block', 'building-wide', 'development-wide', 'all_units'].includes(s)) {
    return 'development';
  }
  if (['unit', 'plot', 'per-unit', 'per_unit', 'this_unit', 'dwelling'].includes(s)) return 'unit';
  return s;
}

export function scopeDifference(factA, factB) {
  const a = canonicalScope(factA.scope);
  const b = canonicalScope(factB.scope);
  if (a && b && a !== b) {
    return (
      `Scope difference: one fact is ${a}-level and the other is ${b}-level. ` +
      `Do not copy a development-wide claim onto a unit without a unit-level source. Keep both facts at their stated scope.`
    );
  }
  return null;
}

export function canonicalUnit(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase().replace(/[\s._]/g, '');
  if (['gbp', '£', 'pound', 'pounds', 'sterling', 'ukp'].includes(s)) return 'GBP';
  if (['sqft', 'sqfeet', 'sqfoot', 'ft2', 'ft²', 'sqf', 'squarefeet', 'squarefoot', 'sf'].includes(s)) {
    return 'sqft';
  }
  if (['sqm', 'sqmetre', 'sqmetres', 'sqmeter', 'sqmeters', 'm2', 'm²', 'squaremetres', 'squaremeters', 'squaremetre', 'sqmetre'].includes(s)) {
    return 'sqm';
  }
  return String(raw).trim();
}

export function canonicalBasis(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (['net', 'nia', 'n.i.a', 'n.i.a.', 'ipms2', 'ipms 2', 'net internal', 'net_internal'].includes(s)) {
    return 'net';
  }
  if (['gross', 'gia', 'g.i.a', 'g.i.a.', 'geas', 'gea', 'ipms1', 'ipms 1', 'gross internal', 'gross_internal'].includes(s)) {
    return 'gross';
  }
  return s;
}

export function parseNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  let s = String(value).trim();
  s = s.replace(/£/g, '').replace(/,/g, '').replace(/\s+/g, '');
  s = s.replace(/(gbp|pounds?)$/i, '');
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function toSqm(value, unit, sqftPerSqm = SQFT_PER_SQM) {
  const n = parseNumber(value);
  if (n == null) return null;
  const u = canonicalUnit(unit);
  if (u === 'sqm') return n;
  if (u === 'sqft') return n / sqftPerSqm;
  return null;
}

export function toSqft(value, unit, sqftPerSqm = SQFT_PER_SQM) {
  const n = parseNumber(value);
  if (n == null) return null;
  const u = canonicalUnit(unit);
  if (u === 'sqft') return n;
  if (u === 'sqm') return n * sqftPerSqm;
  return null;
}

export function relativeDiff(a, b) {
  if (a == null || b == null) return Infinity;
  if (a === b) return 0;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / denom;
}

export function valuesWithinTolerance(a, b, tolerance = DEFAULT_TOLERANCE) {
  return relativeDiff(a, b) <= tolerance;
}

function sourceOf(fact) {
  return fact && fact.source ? fact.source : {};
}

/**
 * Best available date for a fact, as YYYY-MM-DD (or a sortable ISO prefix).
 * published_date is preferred; retrieved_date is the fallback.
 */
export function factDate(fact) {
  const s = sourceOf(fact);
  const raw = s.published_date || s.publishedDate || s.date || s.retrieved_date || s.retrievedDate || null;
  return normaliseDate(raw);
}

export function normaliseDate(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

export function daysBetween(later, earlier) {
  const a = normaliseDate(later);
  const b = normaliseDate(earlier);
  if (!a || !b) return null;
  const ms = Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z');
  return Math.round(ms / 86400000);
}

function slug(name) {
  return String(name || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}

// ---------------------------------------------------------------------------
// Tolerant loader
// ---------------------------------------------------------------------------

/**
 * Accept an array of facts, `{facts:[...]}`, `{data:{facts}}`, or a single
 * fact object. Fills optional fields, normalises field / unit / doc_type /
 * area_basis, and accepts a handful of aliases Person A might use.
 */
export function loadFacts(input) {
  if (input == null) return [];
  let rows = [];
  let envelope = {};
  if (Array.isArray(input)) {
    rows = input;
  } else if (typeof input === 'object') {
    envelope = input;
    if (Array.isArray(input.facts)) rows = input.facts;
    else if (input.data && Array.isArray(input.data.facts)) rows = input.data.facts;
    else if (Array.isArray(input.extracted_facts)) rows = input.extracted_facts;
    else if (Array.isArray(input.records)) rows = input.records;
    else if (input.field != null && input.value !== undefined) rows = [input];
    else rows = [];
  }
  return rows.map((raw, i) => normaliseFact(raw, i, envelope));
}

export function normaliseFact(raw, index = 0, envelope = {}) {
  const srcIn = raw.source || raw.Source || {};
  // Flattened aliases: doc_id at the top level, or source_doc, document, …
  const source = {
    doc_id:
      srcIn.doc_id ||
      srcIn.docId ||
      srcIn.id ||
      raw.doc_id ||
      raw.source_doc ||
      raw.document_id ||
      raw.document ||
      `anon-${index + 1}`,
    doc_type: canonicalDocType(
      srcIn.doc_type || srcIn.docType || srcIn.type || raw.doc_type || raw.source_type || 'unknown'
    ),
    title: srcIn.title || raw.source_title || raw.title || srcIn.doc_id || raw.doc_id || 'Untitled source',
    published_date: normaliseDate(
      srcIn.published_date || srcIn.publishedDate || srcIn.date || raw.published_date || raw.date
    ),
    retrieved_date: normaliseDate(
      srcIn.retrieved_date || srcIn.retrievedDate || raw.retrieved_date
    ),
    url: srcIn.url || raw.url || null,
    agent: srcIn.agent || raw.agent || null,
    issuer: srcIn.issuer || srcIn.agent || raw.issuer || raw.agent || null,
    date_precision: srcIn.date_precision || raw.date_precision || null,
    synthetic: Boolean(srcIn.synthetic || raw.synthetic),
  };
  // Preserve original doc_type string when it was a more specific official type.
  const rawType = srcIn.doc_type || srcIn.docType || srcIn.type || raw.doc_type;
  if (rawType && canonicalDocType(rawType) === 'official_record') {
    source.official_kind = String(rawType).trim();
  }

  let field = canonicalField(raw.field || raw.field_name || raw.name);
  let unit = canonicalUnit(raw.unit || raw.units || raw.u || null);
  let basis = canonicalBasis(raw.area_basis || raw.areaBasis || raw.basis || raw.measurement_basis || null);

  if (field === 'floor_area' && basis === 'net') field = 'net_floor_area';
  if (field === 'floor_area' && basis === 'gross') field = 'gross_floor_area';
  if (field === 'net_floor_area' && !basis) basis = 'net';
  if (field === 'gross_floor_area' && !basis) basis = 'gross';
  if (field === 'price' && !unit) unit = 'GBP';

  const propertyName =
    raw.property_name || raw.propertyName || raw.address || envelope.property_name || envelope.propertyName || null;
  const propertyId =
    raw.property_id || raw.propertyId || envelope.property_id || envelope.propertyId || (propertyName ? slug(propertyName) : 'unknown');

  return {
    fact_id: raw.fact_id || raw.id || `${propertyId}:${field}:${source.doc_id}:${index}`,
    property_id: String(propertyId),
    property_name: propertyName,
    case_id: raw.case_id || null,
    field,
    value: raw.value !== undefined ? raw.value : raw.val ?? raw.extracted_value,
    unit,
    area_basis: basis,
    source,
    page: raw.page ?? raw.page_number ?? raw.pageNumber ?? srcIn.page ?? null,
    quote: raw.quote ?? raw.excerpt ?? raw.text ?? raw.evidence ?? null,
    extraction_confidence:
      raw.extraction_confidence ?? raw.confidence ?? raw.extractionConfidence ?? null,
    stated_equivalent: raw.stated_equivalent || raw.statedEquivalent || null,
    effective_date: normaliseDate(raw.effective_date || raw.effective_from || null),
    scope: canonicalScope(raw.scope || raw.fact_scope || null),
    plot: raw.plot || raw.plot_id || raw.unit_id || null,
    unit_type: raw.unit_type || raw.house_type || raw.type_name || null,
    quote_attribution: raw.quote_attribution || null,
    entity_match: raw.entity_match || null,
    entity_match_confidence:
      raw.entity_match_confidence ??
      raw.entityMatchConfidence ??
      (raw.entity_match && raw.entity_match.score) ??
      null,
    _raw: raw,
  };
}

// ---------------------------------------------------------------------------
// Value comparison
// ---------------------------------------------------------------------------

export function normaliseValue(fact) {
  const field = canonicalField(fact.field);
  if (field === 'price' || field === 'parking') {
    return { kind: 'number', value: parseNumber(fact.value), unit: canonicalUnit(fact.unit), field };
  }
  if (AREA_FIELDS.has(field)) {
    return {
      kind: 'area',
      value: parseNumber(fact.value),
      unit: canonicalUnit(fact.unit),
      basis: canonicalBasis(fact.area_basis) || (field === 'net_floor_area' ? 'net' : field === 'gross_floor_area' ? 'gross' : null),
      field,
    };
  }
  if (field === 'energy_rating') {
    return { kind: 'enum', value: fact.value == null ? null : String(fact.value).trim().toUpperCase(), field };
  }
  if (field === 'tenure') {
    return { kind: 'enum', value: fact.value == null ? null : String(fact.value).trim().toLowerCase(), field };
  }
  if (typeof fact.value === 'number') {
    return { kind: 'number', value: fact.value, unit: canonicalUnit(fact.unit), field };
  }
  return { kind: 'string', value: fact.value == null ? null : String(fact.value).trim().toLowerCase(), field };
}

export function areasAgree(a, b, tolerance, sqftPerSqm) {
  const aSqm = toSqm(a.value, a.unit, sqftPerSqm);
  const bSqm = toSqm(b.value, b.unit, sqftPerSqm);
  if (aSqm != null && bSqm != null) return valuesWithinTolerance(aSqm, bSqm, tolerance);
  if (a.unit && b.unit && a.unit !== b.unit) return false;
  return valuesWithinTolerance(a.value, b.value, tolerance);
}

export function valuesAgree(factA, factB, rules = DEFAULT_RULES) {
  const a = normaliseValue(factA);
  const b = normaliseValue(factB);
  const tolerance = rules.unit_tolerance ?? DEFAULT_TOLERANCE;
  const sqft = rules.sqft_per_sqm ?? SQFT_PER_SQM;
  if (a.kind === 'area' && b.kind === 'area') {
    if (a.basis && b.basis && a.basis !== b.basis) return false;
    // A 2% tolerance is for conversion / rounding between *different units*.
    // It must not hide a 28 sq ft gross-area discrepancy between two sources.
    if (a.unit && a.unit === b.unit) return a.value === b.value;
    return areasAgree(a, b, tolerance, sqft);
  }
  if (a.kind === 'number' && b.kind === 'number') {
    if (a.value == null || b.value == null) return String(factA.value) === String(factB.value);
    return a.value === b.value;
  }
  return a.value === b.value;
}

function sameUnit(a, b) {
  const ua = canonicalUnit(a.unit);
  const ub = canonicalUnit(b.unit);
  return !ua || !ub || ua === ub;
}

// ---------------------------------------------------------------------------
// Pairwise classification
// ---------------------------------------------------------------------------

/**
 * Classify a single pair of facts for the same property+field.
 * Returns { classification, reason, roles } where roles may tag which
 * fact is the stale listing / older document / official record.
 */
export function classifyPair(factA, factB, options = {}) {
  const rules = mergeRules(options.rules);
  const field = canonicalField(options.field || factA.field);
  const fieldRules = rules.fields[field] || {};
  const tolerance = rules.unit_tolerance ?? DEFAULT_TOLERANCE;
  const sqft = rules.sqft_per_sqm ?? SQFT_PER_SQM;
  const asOf = normaliseDate(options.asOf || rules.as_of) || null;

  const labelA = sourceLabel(factA);
  const labelB = sourceLabel(factB);
  const displayA = displayValue(factA);
  const displayB = displayValue(factB);

  // Unmatched: low entity-match confidence — do not raise a conflict.
  if (!isConfidentMatch(factA, rules) || !isConfidentMatch(factB, rules)) {
    const weak = !isConfidentMatch(factA, rules) ? factA : factB;
    const why = (weak.entity_match && (weak.entity_match.reason || weak.entity_match.matched_to)) ||
      `confidence ${weak.entity_match_confidence}`;
    return {
      classification: CLASSIFICATIONS.UNMATCHED,
      reason:
        `Entity resolution is not confident (${why}). The source is held as unmatched ` +
        `and no live fact is changed. This is a matching failure, not a fact conflict.`,
    };
  }

  // Plot or type variation — never merge.
  const plotClash = plotOrTypeClash(factA, factB);
  if (plotClash) {
    return { classification: CLASSIFICATIONS.PLOT_OR_TYPE, reason: plotClash };
  }

  // Scope difference (development-wide vs unit).
  const scopeClash = scopeDifference(factA, factB);
  if (scopeClash) {
    return { classification: CLASSIFICATIONS.SCOPE_DIFFERENCE, reason: scopeClash };
  }

  const a = normaliseValue(factA);
  const b = normaliseValue(factB);

  // 0. AGREE — same unit (or unitless), same basis, same value.
  const basisClash = a.kind === 'area' && b.kind === 'area' && a.basis && b.basis && a.basis !== b.basis;
  const basisUncertain = a.kind === 'area' && b.kind === 'area' && Boolean(a.basis) !== Boolean(b.basis);
  const unitClash = a.kind === 'area' && b.kind === 'area' && a.unit && b.unit && a.unit !== b.unit;
  if (!basisClash && !basisUncertain && !unitClash && valuesAgree(factA, factB, rules)) {
    return {
      classification: CLASSIFICATIONS.AGREE,
      reason: `${labelA} and ${labelB} agree on ${displayA}.`,
    };
  }

  // 1. UNIT_MISMATCH (including a wrong conversion — a document error, not two areas)
  if (a.kind === 'area' && b.kind === 'area') {
    if (basisUncertain) {
      return {
        classification: CLASSIFICATIONS.UNIT_MISMATCH,
        basis_uncertain: true,
        reason: `Measurement basis is not comparable: ${labelA} states ${displayA} (${a.basis || 'unspecified basis'}), while ${labelB} states ${displayB} (${b.basis || 'unspecified basis'}). Keep both labelled with their stated basis; do not infer net or gross from an unlabelled figure.`,
      };
    }
    if (basisClash) {
      return {
        classification: CLASSIFICATIONS.UNIT_MISMATCH,
        reason:
          `Net vs gross floor area are different bases, not a conflict. ` +
          `${labelA} reports ${a.basis} ${displayA}; ${labelB} reports ${b.basis} ${displayB}. ` +
          `Both are retained as separate resolved facts.`,
      };
    }
    if (unitClash) {
      const aSqm = toSqm(a.value, a.unit, sqft);
      const bSqm = toSqm(b.value, b.unit, sqft);
      if (aSqm != null && bSqm != null && valuesWithinTolerance(aSqm, bSqm, tolerance)) {
        const pct = (relativeDiff(aSqm, bSqm) * 100).toFixed(2);
        return {
          classification: CLASSIFICATIONS.UNIT_MISMATCH,
          reason:
            `${displayA} converts to ${formatArea(toSqft(a.value, a.unit, sqft), 'sqft')} / ` +
            `${formatArea(aSqm, 'sqm')}, which is within ${tolerance * 100}% of ${displayB} ` +
            `(relative difference ${pct}%). This is a unit mismatch, not a conflict.`,
        };
      }
      // Arithmetically wrong conversion: same document, or a stated equivalent that does not convert.
      const sameDoc = (sourceOf(factA).doc_id || '') && sourceOf(factA).doc_id === sourceOf(factB).doc_id;
      const wrongA = isWrongConversion(factA, rules);
      const wrongB = isWrongConversion(factB, rules);
      if (sameDoc || wrongA || wrongB) {
        const expectedA = aSqm != null ? formatArea(toSqft(a.value, a.unit, sqft), 'sqft') : displayA;
        return {
          classification: CLASSIFICATIONS.UNIT_MISMATCH,
          reason:
            `Document conversion or basis error, not two different areas. ` +
            `${labelA} states ${displayA}` +
            (wrongA ? ` as equivalent to ${formatArea(statedEquivalentOf(factA).value, statedEquivalentOf(factA).unit)}` : '') +
            `, and ${labelB} states ${displayB}. ` +
            `${displayA} is about ${expectedA}, which does not match. ` +
            `Prefer the source that states both figures consistently, and keep NIA and GIA as separate facts.`,
          document_error: true,
        };
      }
      // Units differ and values do not agree — fall through unless it is a document error (handled below).
    }
    // Same unit, values disagree, but one document states a wrong equivalent
    // (April brochure: 185 sq m printed as 2,700 sq ft — a conversion/basis error, not a later version).
    if (!valuesAgree(factA, factB, rules) && (isWrongConversion(factA, rules) || isWrongConversion(factB, rules))) {
      const wrong = isWrongConversion(factA, rules) ? factA : factB;
      const eq = statedEquivalentOf(wrong);
      return {
        classification: CLASSIFICATIONS.UNIT_MISMATCH,
        reason:
          `Document conversion or basis error, not two different areas. ` +
          `${sourceLabel(wrong)} states ${displayValue(wrong)}` +
          (eq ? ` as equivalent to ${formatArea(eq.value, eq.unit)}` : '') +
          `, which does not convert within ${tolerance * 100}%. ` +
          `Prefer the source that states both figures consistently, and keep NIA and GIA as separate facts.`,
        document_error: true,
      };
    }
  }

  const officialA = isOfficial(factA);
  const officialB = isOfficial(factB);
  const officialIsHistorical = field === 'price' || fieldRules.official_is_historical === true;

  // 2. OFFICIAL_RECORD_DISAGREEMENT (price official is historical last-sold → step 4)
  //    Do not auto-correct. Mark 'check this'. Human sign-off required.
  if ((officialA || officialB) && !valuesAgree(factA, factB, rules) && !officialIsHistorical) {
    const official = officialA ? factA : factB;
    const other = officialA ? factB : factA;
    return {
      classification: CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT,
      reason:
        `Official-record mismatch — check this, not an automatic error. ` +
        `${sourceLabel(other)} states ${displayValue(other)}, but the official record ` +
        `${sourceLabel(official)} states ${displayValue(official)}. ` +
        `Do not auto-correct. The agent should check the current title, not only a ` +
        `historical Price Paid extract (which is as at the sale date and may lag a later ` +
        `private transaction). Human sign-off is required.`,
      official_fact_id: official.fact_id,
      check_this: true,
    };
  }

  // 3. STALE_LISTING — a listing disagrees with a higher-tier source (typical: price
  //    still at an old figure after a new brochure). For tenure, two peer listings
  //    that disagree are a true conflict, not a stale listing — fall through.
  if (isListing(factA) !== isListing(factB) && !valuesAgree(factA, factB, rules)) {
    const listing = isListing(factA) ? factA : factB;
    const other = isListing(factA) ? factB : factA;
    const otherTier = sourceTier(other, rules);
    const listingTier = sourceTier(listing, rules);
    const listingDate = factDate(listing);
    const otherDate = factDate(other);
    const listingIsOlder = listingDate && otherDate && listingDate < otherDate;
    const staleDays = rules.staleness_days ?? DEFAULT_STALENESS_DAYS;
    const gap = listingDate && otherDate ? daysBetween(otherDate, listingDate) : null;
    // Stale listings are the "portal not updated after a new brochure" case (price).
    // Tenure disagreements between a listing and a brochure, or between two listing
    // rows, are a true conflict — do not reclassify them as stale.
    if (otherTier < listingTier && field === 'price') {
      const when = listingDate ? ` dated ${listingDate}` : '';
      const vs = otherDate ? ` against ${sourceLabel(other)} dated ${otherDate}` : ` against ${sourceLabel(other)}`;
      return {
        classification: CLASSIFICATIONS.STALE_LISTING,
        reason:
          `The listing${when} still carries ${displayValue(listing)}${vs} ` +
          `(${displayValue(other)}). A portal or CRM row that was not updated after a ` +
          `newer higher-tier document is a stale listing. The latest verified document ` +
          `wins; flag the listing for update and notify the agent.`,
        stale_fact_id: listing.fact_id,
        flag_listing_for_update: true,
      };
    }
  }

  // 4. SUPERSEDED — a later document of the same type from the same issuer
  //    replaces an earlier one. Recency applies within the same tier only.
  //    Do not auto-pick by recency alone when sources are peers of a different
  //    issuer (two listing rows, two agents). Official last-sold price is
  //    historical and is superseded-by-time, not an official-record disagreement.
  if (!valuesAgree(factA, factB, rules)) {
    const dateA = factDate(factA);
    const dateB = factDate(factB);
    // A formal price-change instruction can replace earlier marketing from a
    // different issuer/type: this is a version change, not a true conflict.
    if (field === 'price' && dateA && dateB && dateA !== dateB) {
      const newer = dateA > dateB ? factA : factB;
      const older = newer === factA ? factB : factA;
      const newType = canonicalDocType(sourceOf(newer).doc_type);
      if (['developer_instruction', 'price_list', 'signed_price_list'].includes(newType) &&
          sourceTier(newer, rules) < sourceTier(older, rules)) {
        return {
          classification: CLASSIFICATIONS.SUPERSEDED,
          reason: `${sourceLabel(newer)} (${factDate(newer)}) formally updates the asking price from ${displayValue(older)} to ${displayValue(newer)}. The later, higher-authority instruction replaces the earlier marketing figure. Keep the old figure in history; a human must confirm the change.`,
          older_fact_id: older.fact_id,
          newer_fact_id: newer.fact_id,
        };
      }
    }
    if (officialIsHistorical && (officialA || officialB) && !(officialA && officialB)) {
      const official = officialA ? factA : factB;
      const current = officialA ? factB : factA;
      return {
        classification: CLASSIFICATIONS.SUPERSEDED,
        reason:
          `Official record ${sourceLabel(official)} is a historical last-sold price ` +
          `(${displayValue(official)}, ${factDate(official) || 'undated'}), not a current ` +
          `asking price. It is superseded by ${sourceLabel(current)} at ${displayValue(current)}. ` +
          `This is classified as superseded-by-time, not as a conflict.`,
        older_fact_id: official.fact_id,
      };
    }
    const sameType = canonicalDocType(sourceOf(factA).doc_type) === canonicalDocType(sourceOf(factB).doc_type);
    const sameIss = sameIssuer(factA, factB);
    const sameTier = sourceTier(factA, rules) === sourceTier(factB, rules);
    // Listings are peers: a later listing row does not supersede another on tenure etc.
    const versionable = sameType && sameIss && sameTier && !isListing(factA) && !isListing(factB);
    if (versionable && dateA && dateB && dateA !== dateB) {
      const older = dateA < dateB ? factA : factB;
      const newer = dateA < dateB ? factB : factA;
      const gap = daysBetween(factDate(newer), factDate(older));
      return {
        classification: CLASSIFICATIONS.SUPERSEDED,
        reason:
          `${sourceLabel(older)} (${factDate(older)}) value ${displayValue(older)} is replaced ` +
          `by the later ${sourceLabel(newer)} (${factDate(newer)}) value ${displayValue(newer)}` +
          (gap != null ? ` (${gap} days later)` : '') +
          `. A later document of the same type from the same issuer becomes the candidate. ` +
          `History is kept. For a material field such as price, a human still confirms.`,
        older_fact_id: older.fact_id,
        newer_fact_id: newer.fact_id,
      };
    }
  }

  // 5. TRUE_CONFLICT — residual genuine disagreement (same-tier peers, or
  //    no unit / official / staleness / version explanation).
  return {
    classification: CLASSIFICATIONS.TRUE_CONFLICT,
    reason:
      `${labelA} (${factDate(factA) || 'undated'}) states ${displayA}, but ` +
      `${labelB} (${factDate(factB) || 'undated'}) states ${displayB}. ` +
      `Same unit, same field, same measurement basis: the values cannot both be right. ` +
      `Do not auto-pick by recency alone when sources are peers. Human sign-off is required, ` +
      `and the voice agent must not quote either value.`,
  };
}

function sameIssuer(a, b) {
  const ia = (issuerOf(a) || '').toLowerCase().trim();
  const ib = (issuerOf(b) || '').toLowerCase().trim();
  if (!ia || !ib) return true;
  return ia === ib;
}

function precedenceRank(fact, fieldRules) {
  const order = fieldRules.precedence || ['official_record', 'brochure', 'listing'];
  const t = canonicalDocType(sourceOf(fact).doc_type);
  const i = order.indexOf(t);
  return i === -1 ? order.length + 1 : i;
}

export function pickWinner(facts, field, rules = DEFAULT_RULES) {
  const fieldRules = rules.fields[canonicalField(field)] || {};
  const list = facts.slice();
  // Asking price: an official Price Paid figure is last-sold, historical — never the current asking price.
  if (fieldRules.official_is_historical || canonicalField(field) === 'price') {
    const current = list.filter((f) => !isOfficial(f));
    const pool = current.length ? current : list;
    pool.sort((a, b) => compareForWinner(a, b, fieldRules, rules));
    return pool[0];
  }
  // Prefer unit-level over development-wide when scope differs.
  list.sort((a, b) => compareForWinner(a, b, fieldRules, rules));
  return list[0];
}

function compareForWinner(a, b, fieldRules, rules = DEFAULT_RULES) {
  // Source-authority hierarchy first. Recency applies only within the same tier.
  // A newer brochure never beats a higher tier (contract, official register, signed spec, price list).
  const ta = sourceTier(a, rules);
  const tb = sourceTier(b, rules);
  if (ta !== tb) return ta - tb;
  // Prefer a consistent area statement over a document conversion error.
  const wa = isWrongConversion(a, rules) ? 1 : 0;
  const wb = isWrongConversion(b, rules) ? 1 : 0;
  if (wa !== wb) return wa - wb;
  // Prefer unit/plot scope over a development-wide claim.
  const sa = canonicalScope(a.scope) === 'development' ? 1 : 0;
  const sb = canonicalScope(b.scope) === 'development' ? 1 : 0;
  if (sa !== sb) return sa - sb;
  const da = factDate(a) || '';
  const db = factDate(b) || '';
  if (da !== db) return db.localeCompare(da); // most recent first, within the same tier
  const ca = a.extraction_confidence ?? 0;
  const cb = b.extraction_confidence ?? 0;
  return cb - ca;
}

function ruleDescription(field, rules, winner) {
  const fr = (rules.fields && rules.fields[field]) || {};
  if (field === 'price' || (fr.winner && String(fr.winner).includes('recent'))) {
    return (
      `price: highest source-authority tier, then most recent dated brochure or price list in-tier (a newer brochure never beats a higher tier)` +
      (winner ? ` (${sourceLabel(winner)}, ${factDate(winner) || 'undated'})` : '') +
      `; official last-sold prices are historical`
    );
  }
  const tier = winner ? `tier ${sourceTier(winner, rules)} (${sourceTierName(winner, rules)})` : 'source-authority hierarchy';
  return (
    `${fieldLabel(field, rules)}: source-authority hierarchy (signed legal > official register > signed spec > signed price list > particulars > listing); ` +
    `recency only within the same tier; a newer brochure never beats a higher tier` +
    (winner ? ` — selected ${sourceLabel(winner)} (${tier}, ${factDate(winner) || 'undated'})` : '')
  );
}

export function fieldLabel(field, rules = DEFAULT_RULES) {
  const f = canonicalField(field);
  if (rules.fields && rules.fields[f] && rules.fields[f].label) return rules.fields[f].label;
  return f.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sourceLabel(fact) {
  const s = sourceOf(fact);
  const type = canonicalDocType(s.doc_type);
  const title = s.title || s.doc_id || 'source';
  return `${title} [${type}]`;
}

export function displayValue(fact) {
  const field = canonicalField(fact.field);
  const unit = canonicalUnit(fact.unit);
  if (field === 'price') return formatPrice(fact.value);
  if (AREA_FIELDS.has(field)) return formatArea(fact.value, unit);
  if (fact.value == null) return '—';
  return String(fact.value);
}

export function formatPrice(value) {
  const n = parseNumber(value);
  if (n == null) return String(value ?? '—');
  return '£' + Math.round(n).toLocaleString('en-GB');
}

export function formatArea(value, unit) {
  const n = parseNumber(value);
  if (n == null) return String(value ?? '—');
  const u = canonicalUnit(unit);
  const num = Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { maximumFractionDigits: 2 });
  if (u === 'sqft') return `${num} sq ft`;
  if (u === 'sqm') return `${num} sq m`;
  return u ? `${num} ${u}` : num;
}

export function areaEquivalent(fact, rules = DEFAULT_RULES) {
  const sqftPer = rules.sqft_per_sqm ?? SQFT_PER_SQM;
  const unit = canonicalUnit(fact.unit);
  const n = parseNumber(fact.value);
  if (n == null || (unit !== 'sqft' && unit !== 'sqm')) return null;
  const sqm = toSqm(n, unit, sqftPer);
  const sqft = toSqft(n, unit, sqftPer);
  return {
    sqm: roundNice(sqm, 2),
    sqft: roundNice(sqft, 0),
  };
}

function roundNice(n, places) {
  if (n == null) return null;
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

export function preferredEquivalent(winner, candidates, rules = DEFAULT_RULES) {
  const eq = areaEquivalent(winner, rules);
  if (!eq || !candidates) return eq;
  const tolerance = rules.unit_tolerance ?? DEFAULT_TOLERANCE;
  const sqftPer = rules.sqft_per_sqm ?? SQFT_PER_SQM;
  for (const c of candidates) {
    const u = canonicalUnit(c.unit);
    const n = parseNumber(c.value);
    if (n == null) continue;
    if (u === 'sqm' && valuesWithinTolerance(n, eq.sqm, tolerance)) eq.sqm = n;
    if (u === 'sqft' && valuesWithinTolerance(n, eq.sqft, tolerance)) eq.sqft = n;
  }
  return eq;
}

export function winningDisplay(winner, candidates, rules = DEFAULT_RULES) {
  if (!winner) return '—';
  const field = canonicalField(winner.field);
  if (AREA_FIELDS.has(field)) {
    const eq = preferredEquivalent(winner, candidates, rules);
    if (eq) return `${formatArea(eq.sqft, 'sqft')} (${formatArea(eq.sqm, 'sqm')})`;
  }
  return displayValue(winner);
}

function headlineOf(classifications) {
  let best = CLASSIFICATIONS.AGREE;
  let bestP = -1;
  for (const c of classifications) {
    const p = HEADLINE_PRIORITY[c] ?? -1;
    if (p > bestP) {
      bestP = p;
      best = c;
    }
  }
  return best;
}

function fieldStatus(primary, options = {}) {
  if (options.unmatched || primary === CLASSIFICATIONS.UNMATCHED) return STATUSES.UNKNOWN;
  if (primary === CLASSIFICATIONS.TRUE_CONFLICT) return STATUSES.CONFLICTING;
  if (primary === CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT) return STATUSES.CONFLICTING;
  if (primary === CLASSIFICATIONS.AGREE || primary === CLASSIFICATIONS.WINNER) return STATUSES.VERIFIED;
  // Supersession of a material field, unit mismatch, stale listing, scope, plot:
  // a candidate is proposed but not yet signed off — pending, not quotable.
  return STATUSES.PENDING;
}

/**
 * Voice-agent contract for a resolved field.
 * Only a verified field is quotable. Pending, conflicting and unknown must
 * not be quoted as fact; explain briefly, escalate, take a lead.
 */
export function voiceState(record) {
  if (record.resolution_kind === 'scoped_context') {
    return {
      quotable: false,
      confidence: 'context_only',
      speaker_note: 'These statements refer to different scopes or measurement bases. Both are retained as evidence; neither has been promoted to a single unit-level fact.',
    };
  }
  const status = record.status || STATUSES.PENDING;
  const field = fieldLabel(record.field);
  const value = record.winning_display || String(record.winning_value ?? '');
  const winner = (record.candidates || []).find((c) => c.is_winner);
  const src = winner && winner.source ? `${winner.source.title || winner.source.doc_id || 'the source'}, ${factDate(winner) || 'undated'}` : 'the current source';
  const stale = (record.candidates || []).filter((c) => c.classification === CLASSIFICATIONS.STALE_LISTING);
  const older = (record.candidates || []).filter((c) => c.classification === CLASSIFICATIONS.SUPERSEDED);
  let speaker_note;
  if (status === STATUSES.VERIFIED) {
    let extra = '';
    if (older.length) {
      extra += ` An earlier ${older[0].source && older[0].source.title ? older[0].source.title : 'document'} said ${displayValue(older[0])}; that document is superseded.`;
    }
    if (stale.length) {
      extra += ` ${stale.length === 1 ? 'A portal listing still shows' : 'Portal listings still show'} ${displayValue(stale[0])}, which looks out of date against the verified document.`;
    }
    speaker_note =
      `The current ${field.toLowerCase()} is ${value}, from ${src}. That figure has been verified.` + extra;
    return { quotable: true, confidence: status, speaker_note };
  }
  if (status === STATUSES.CONFLICTING) {
    if (record.check_this) {
      speaker_note =
        `I can't confirm ${field.toLowerCase()} yet. The official record and the marketing disagree, ` +
        `so this is a 'check this' — not a yes or no from me, and not an automatic correction. ` +
        `An agent will confirm against the current title and call you back. Can I take a name and number?`;
    } else {
      const vals = [...new Set((record.candidates || []).map((c) => displayValue(c)))].join(' vs ');
      speaker_note =
        `I can't give you a verified ${field.toLowerCase()} yet. Sources disagree (${vals}). ` +
        `I won't quote either value as fact. I'll pass this to the agent to confirm and come back to you. ` +
        `Can I take your name and a number?`;
    }
    return { quotable: false, confidence: status, speaker_note };
  }
  if (status === STATUSES.UNKNOWN) {
    speaker_note =
      `We do not have a verified ${field.toLowerCase()} for this property, and I will not guess. ` +
      `I can ask the agent to look it up and get back to you. Can I take your name and a number?`;
    return { quotable: false, confidence: status, speaker_note };
  }
  // pending
  if (record.primary_classification === CLASSIFICATIONS.UNIT_MISMATCH) {
    speaker_note =
      `A floor area is in the file but has not been verified, so I will not give a single unlabelled figure. ` +
      `Once verified, net and gross will be given separately, each with its basis. ` +
      `I can have the agent confirm and take a lead.`;
  } else {
    speaker_note =
      `A ${field.toLowerCase()} is in the file (${value} is the candidate from ${src}) but has not been verified, ` +
      `so it will not be quoted as fact. I can have the agent confirm and take a lead. ` +
      `Can I take your name and a number?`;
  }
  return { quotable: false, confidence: STATUSES.PENDING, speaker_note };
}


/**
 * Resolve one property+field group into a resolved-field record.
 */
export function resolveGroup(facts, options = {}) {
  const rules = mergeRules(options.rules);
  const now = options.now || new Date().toISOString();
  if (!facts.length) return null;
  const field = canonicalField(facts[0].field);
  const winner = pickWinner(facts, field, rules);
  const pairClasses = [];

  const candidates = facts.map((fact) => {
    let classification = CLASSIFICATIONS.WINNER;
    let reason = `Selected as the resolved value. ${ruleDescription(field, rules, winner)}.`;
    if (fact !== winner) {
      const pair = classifyPair(fact, winner, { rules, field, asOf: options.asOf || rules.as_of });
      classification = pair.classification;
      reason = pair.reason;
      fact._pair_document_error = pair.document_error;
      fact._pair_flag_listing = pair.flag_listing_for_update;
      pairClasses.push(classification);
    } else {
      // If the winner agrees (after unit conversion) with every other fact,
      // that's fine; if some UNIT_MISMATCH peers exist we still tag WINNER.
      const peers = facts.filter((f) => f !== fact);
      const agrees = peers.filter((f) => {
        const c = classifyPair(f, fact, { rules, field, asOf: options.asOf || rules.as_of });
        return c.classification === CLASSIFICATIONS.AGREE || c.classification === CLASSIFICATIONS.UNIT_MISMATCH;
      });
      if (peers.length && agrees.length === peers.length) {
        const units = [...new Set(peers.map((p) => classifyPair(p, fact, { rules, field }).classification))];
        if (units.includes(CLASSIFICATIONS.UNIT_MISMATCH)) {
          reason =
            `Selected as the resolved value; other candidates report the same area in a ` +
            `different unit (within ${((rules.unit_tolerance ?? DEFAULT_TOLERANCE) * 100)}% after conversion). ` +
            ruleDescription(field, rules, winner) + '.';
        }
      }
    }
    return {
      ...publicFact(fact),
      classification,
      reason,
      is_winner: fact === winner,
      document_error: fact._pair_document_error || undefined,
      flag_listing_for_update: fact._pair_flag_listing || classification === CLASSIFICATIONS.STALE_LISTING || undefined,
    };
  });

  // Pairwise headlines should also consider pairs among non-winners
  // (e.g. two losers that official-disagree) — already covered if one is winner.
  // For completeness, walk all pairs:
  for (let i = 0; i < facts.length; i++) {
    for (let j = i + 1; j < facts.length; j++) {
      const pair = classifyPair(facts[i], facts[j], { rules, field, asOf: options.asOf || rules.as_of });
      if (pair.classification !== CLASSIFICATIONS.AGREE && pair.classification !== CLASSIFICATIONS.WINNER) {
        pairClasses.push(pair.classification);
      }
    }
  }

  const primary = facts.length === 1 ? CLASSIFICATIONS.AGREE : headlineOf(pairClasses.length ? pairClasses : [CLASSIFICATIONS.AGREE]);
  const checkThis = pairClasses.includes(CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT) ||
    candidates.some((c) => c.classification === CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT) ||
    primary === CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT;
  const status = fieldStatus(primary, { checkThis });
  const hasDocumentError = candidates.some((c) => c.document_error);
  const hasUncertainBasis = pairClasses.includes(CLASSIFICATIONS.UNIT_MISMATCH) &&
    AREA_FIELDS.has(field) && facts.some((f) => !canonicalBasis(f.area_basis)) &&
    facts.some((f) => Boolean(canonicalBasis(f.area_basis)));
  const retainSeparately = primary === CLASSIFICATIONS.SCOPE_DIFFERENCE || hasUncertainBasis;
  const eq = AREA_FIELDS.has(field) ? preferredEquivalent(winner, candidates, rules) : null;
  const listingFlags = candidates
    .filter((c) => c.classification === CLASSIFICATIONS.STALE_LISTING || c.flag_listing_for_update)
    .map((c) => ({
      doc_id: c.source && c.source.doc_id,
      title: c.source && c.source.title,
      current_value: displayValue(c),
      proposed_value: winningDisplay(winner, candidates, rules),
      action: 'flag_listing_for_update',
    }));
  // Mark stale candidates so the UI can show the flag.
  for (const c of candidates) {
    if (c.classification === CLASSIFICATIONS.STALE_LISTING) c.flag_listing_for_update = true;
  }

  const record = {
    property_id: winner.property_id,
    property_name: winner.property_name,
    field,
    case_id: winner.case_id || null,
    area_basis: winner.area_basis || ((rules.fields[field] || {}).area_basis ?? null),
    winning_value: coerceWinningValue(winner),
    winning_unit: canonicalUnit(winner.unit),
    winning_display: winningDisplay(winner, candidates, rules),
    equivalent: eq,
    rule_applied: ruleDescription(field, rules, winner),
    primary_classification: primary,
    headline_reason: (candidates.find((c) => !c.is_winner && c.document_error && c.classification === primary)
      || candidates.find((c) => !c.is_winner && c.classification === primary)
      || {}).reason || null,
    status,
    check_this: checkThis || undefined,
    document_error: hasDocumentError || undefined,
    basis_uncertain: hasUncertainBasis || undefined,
    retain_separately: retainSeparately || undefined,
    scoped_facts: retainSeparately ? candidates.map((c) => ({
      fact_id: c.fact_id, value: c.value, unit: c.unit, area_basis: c.area_basis,
      scope: c.scope, source_doc_id: c.source?.doc_id, quote: c.quote, page: c.page,
    })) : undefined,
    auto_corrected: false,
    listing_update_flags: listingFlags.length ? listingFlags : undefined,
    candidates,
    audit: [
      {
        action: 'auto_resolve',
        accepted_by: 'engine',
        accepted_at: now,
        value: coerceWinningValue(winner),
        unit: canonicalUnit(winner.unit),
        note: status === STATUSES.CONFLICTING
          ? (checkThis
            ? `Official-record mismatch marked 'check this'. Not auto-corrected. Proposed value is pending human sign-off (${primary}).`
            : `Proposed value is conflicting and needs human sign-off (${primary}). The voice agent must not quote it.`)
          : status === STATUSES.PENDING
            ? `Candidate proposed (${primary}). Material or unresolved difference — pending until a human signs it off. History is kept.`
            : `Settled as ${primary} with no human review required.`,
        rule_applied: ruleDescription(field, rules, winner),
        candidate_doc_id: sourceOf(winner).doc_id || null,
      },
    ],
  };
  record.voice = voiceState(record);
  return record;
}

function coerceWinningValue(winner) {
  const field = canonicalField(winner.field);
  if (field === 'price' || field === 'parking' || AREA_FIELDS.has(field)) {
    const n = parseNumber(winner.value);
    if (n != null) return n;
  }
  if (field === 'energy_rating' && winner.value != null) return String(winner.value).trim().toUpperCase();
  if (field === 'tenure' && winner.value != null) {
    const s = String(winner.value).trim();
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return winner.value;
}

function publicFact(fact) {
  return {
    fact_id: fact.fact_id,
    case_id: fact.case_id || null,
    property_id: fact.property_id,
    property_name: fact.property_name,
    field: fact.field,
    value: fact.value,
    unit: fact.unit,
    area_basis: fact.area_basis,
    source: { ...fact.source },
    page: fact.page,
    quote: fact.quote,
    effective_date: fact.effective_date || null,
    quote_attribution: fact.quote_attribution || null,
    extraction_confidence: fact.extraction_confidence,
    stated_equivalent: fact.stated_equivalent || null,
    scope: fact.scope || null,
    plot: fact.plot || null,
    unit_type: fact.unit_type || null,
    entity_match: fact.entity_match || null,
    entity_match_confidence: fact.entity_match_confidence,
  };
}

function groupKey(fact) {
  // Never merge different plots or house types into one resolved field.
  const pk = plotKey(fact);
  const plotPart = pk.plot ? `::plot:${pk.plot}` : '';
  const typePart = pk.unit_type ? `::type:${pk.unit_type}` : '';
  return `${fact.property_id}::${canonicalField(fact.field)}${plotPart}${typePart}`;
}

/**
 * Resolve every property+field group in an input payload (array, envelope,
 * or already-loaded facts). Returns { records, facts, rules }.
 */
export function resolveAll(input, options = {}) {
  const rules = mergeRules(options.rules);
  const now = options.now || new Date().toISOString();
  const facts = Array.isArray(input) && input.length && input[0] && input[0].field && input[0].source && input[0].fact_id
    ? input
    : loadFacts(input);
  const groups = new Map();
  const unmatchedFacts = [];
  for (const f of facts) {
    if (!isConfidentMatch(f, rules)) {
      unmatchedFacts.push(f);
      continue;
    }
    const k = groupKey(f);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const records = [];
  for (const [, group] of groups) {
    const rec = resolveGroup(group, { ...options, rules });
    if (rec) records.push(rec);
  }
  for (const f of unmatchedFacts) {
    records.push(unmatchedRecord(f, { now, rules }));
  }
  records.sort((a, b) => {
    if (a.property_id !== b.property_id) return a.property_id.localeCompare(b.property_id);
    return fieldOrder(a.field) - fieldOrder(b.field) || a.field.localeCompare(b.field);
  });
  return {
    records: options.autoRetainContext ? records.map((r) => applySafeAutomaticRule(r, { now })) : records,
    facts,
    rules,
  };
}

/**
 * Safe zero-click reconciliation: only organise facts that should *not* be
 * collapsed into a single value. This never verifies a disputed scalar,
 * chooses a conflict winner, or makes the value quotable by a voice agent.
 */
export function applySafeAutomaticRule(record, options = {}) {
  if (record.resolution_kind === 'scoped_context' ||
      !(record.primary_classification === CLASSIFICATIONS.SCOPE_DIFFERENCE || record.basis_uncertain) ||
      record.document_error) return record;
  const next = structuredClone(record);
  const timestamp = options.now || new Date().toISOString();
  next.resolution_kind = 'scoped_context';
  next.auto_resolved = true;
  next.winning_value = null;
  next.winning_unit = null;
  next.winning_display = 'Both statements retained separately';
  next.winning_fact_id = null;
  next.candidates.forEach((c) => { c.is_winner = false; });
  next.status = STATUSES.VERIFIED;
  next.blocked = false;
  next.audit = [...(record.audit || []), {
    action: 'auto_retain_context',
    accepted_by: 'rules-engine',
    accepted_at: timestamp,
    value: null,
    unit: null,
    note: record.basis_uncertain
      ? 'Measurement basis is not stated in one source. Preserve both labelled measurements; do not declare a winner.'
      : 'Evidence refers to different scopes. Preserve both statements; do not copy development-wide facts onto this unit.',
    rule_applied: 'safe:auto-retain-separate-scopes-or-bases',
    classification: next.primary_classification,
  }];
  next.voice = voiceState(next);
  return next;
}

function unmatchedRecord(fact, { now, rules }) {
  const field = canonicalField(fact.field);
  const why = (fact.entity_match && (fact.entity_match.reason || fact.entity_match.matched_to)) ||
    `confidence ${fact.entity_match_confidence}`;
  const record = {
    property_id: fact.property_id,
    property_name: fact.property_name,
    field,
    area_basis: fact.area_basis || null,
    winning_value: null,
    winning_unit: canonicalUnit(fact.unit),
    winning_display: '— (unmatched)',
    equivalent: null,
    rule_applied:
      'If entity resolution is not confident, hold the source unmatched and do not raise a conflict. No live fact changes.',
    primary_classification: CLASSIFICATIONS.UNMATCHED,
    status: STATUSES.UNKNOWN,
    check_this: false,
    auto_corrected: false,
    candidates: [
      {
        ...publicFact(fact),
        classification: CLASSIFICATIONS.UNMATCHED,
        reason:
          `Held unmatched (${why}). This is a matching failure, not a dispute about the property. ` +
          `Treating it as a fact conflict would train agents and judges to distrust the product.`,
        is_winner: false,
      },
    ],
    audit: [
      {
        action: 'auto_resolve',
        accepted_by: 'engine',
        accepted_at: now,
        value: null,
        unit: canonicalUnit(fact.unit),
        note: `Source held unmatched (${why}). No conflict raised.`,
        rule_applied: 'unmatched entity — do not invent a conflict',
        candidate_doc_id: (fact.source && fact.source.doc_id) || null,
      },
    ],
  };
  record.voice = voiceState(record);
  return record;
}

const FIELD_ORDER = ['price', 'tenure', 'net_floor_area', 'gross_floor_area', 'floor_area', 'energy_rating', 'parking'];
function fieldOrder(f) {
  const i = FIELD_ORDER.indexOf(f);
  return i === -1 ? 100 : i;
}

/**
 * Append a human override to a resolved field. Never overwrites earlier
 * audit entries. Returns a new object (does not mutate).
 *
 * override = {
 *   action: 'accept' | 'choose_candidate' | 'edit',
 *   accepted_by: string,
 *   accepted_at?: ISO string,
 *   value?, unit?, note?, candidate_doc_id?,
 * }
 */
/** Reviewer-facing classification labels (product-spec taxonomy). */
export const REVIEW_CLASSIFICATIONS = Object.freeze([
  {
    id: CLASSIFICATIONS.TRUE_CONFLICT,
    label: 'True conflict',
    icon: 'conflict',
    summary: 'Incompatible values for the same field and effective period; require a justified winner or escalation.',
  },
  {
    id: CLASSIFICATIONS.SUPERSEDED,
    label: 'Newer version',
    icon: 'timeline',
    summary: 'A later document of the same type from the same issuer supersedes an earlier value.',
  },
  {
    id: CLASSIFICATIONS.UNIT_MISMATCH,
    label: 'Unit / net–gross mismatch',
    icon: 'ruler',
    summary: 'Unit conversion or net vs gross basis explains the difference; preserve originals.',
  },
  {
    id: CLASSIFICATIONS.STALE_LISTING,
    label: 'Out-of-date listing',
    icon: 'stale',
    summary: 'A portal or CRM row was not updated after a higher-tier document.',
  },
  {
    id: CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT,
    label: 'Official-record disagreement',
    icon: 'official',
    summary: 'Marketing disagrees with Land Registry / EPC. Mark check-this; do not auto-correct.',
  },
  {
    id: CLASSIFICATIONS.SCOPE_DIFFERENCE,
    label: 'Scope difference',
    icon: 'scope',
    summary: 'Per-floor, total, development-wide and unit-specific statements must stay at their own scope.',
  },
]);

export function applyOverride(record, override) {
  if (!override || !override.accepted_by || !String(override.accepted_by).trim()) {
    throw new Error('A reviewer name (accepted_by) is required.');
  }
  if (record.resolution_kind === 'scoped_context' && ['accept', 'choose_candidate', 'edit'].includes(override.action)) {
    throw new Error('Context-only evidence cannot be converted into one verified property value. Preserve each scope or basis separately.');
  }
  if (record.document_error && ['accept', 'choose_candidate'].includes(override.action)) {
    throw new Error('A document conversion error cannot be approved as printed. Supply an evidenced correction or keep the case blocked.');
  }
  if (override.action === 'edit' && !(override.note && String(override.note).trim())) {
    throw new Error('A note is required when editing a value.');
  }
  if (override.action === 'escalate' && !(override.note && String(override.note).trim())) {
    throw new Error('A reason is required when escalating.');
  }
  const accepted_at = override.accepted_at || new Date().toISOString();
  const next = structuredClone(record);
  let value = override.value !== undefined ? override.value : record.winning_value;
  let unit = override.unit !== undefined ? override.unit : record.winning_unit;
  let winningFactId = (record.candidates.find((c) => c.is_winner) || {}).fact_id || null;

  if (
    override.classification &&
    Object.values(CLASSIFICATIONS).includes(override.classification)
  ) {
    next.reviewer_classification = override.classification;
    next.primary_classification = override.classification;
  }

  if (override.action === 'choose_candidate' && override.candidate_doc_id) {
    const cand = next.candidates.find(
      (c) => (c.source && c.source.doc_id) === override.candidate_doc_id || c.fact_id === override.candidate_doc_id
    );
    if (cand) {
      winningFactId = cand.fact_id;
      value = AREA_FIELDS.has(next.field) || next.field === 'price' || next.field === 'parking'
        ? (parseNumber(cand.value) ?? cand.value)
        : cand.value;
      unit = cand.unit;
      for (const c of next.candidates) {
        const isThis = c === cand || c.fact_id === cand.fact_id;
        c.is_winner = isThis;
        if (isThis) {
          c.classification = CLASSIFICATIONS.WINNER;
          c.reason = `Chosen by reviewer ${override.accepted_by}.`;
        }
      }
      next.winning_display = displayValue({ ...cand, field: next.field, value, unit });
      if (AREA_FIELDS.has(next.field)) {
        next.equivalent = areaEquivalent({ ...cand, value, unit });
        if (next.equivalent) {
          next.winning_display = `${formatArea(next.equivalent.sqft, 'sqft')} (${formatArea(next.equivalent.sqm, 'sqm')})`;
        }
      }
    }
  }

  if (override.action === 'edit') {
    winningFactId = null;
    next.winning_display = displayValue({ field: next.field, value, unit });
    if (AREA_FIELDS.has(next.field)) {
      next.equivalent = areaEquivalent({ field: next.field, value, unit });
      if (next.equivalent) {
        next.winning_display = `${formatArea(next.equivalent.sqft, 'sqft')} (${formatArea(next.equivalent.sqm, 'sqm')})`;
      }
    }
    for (const c of next.candidates) c.is_winner = false;
  }

  if (override.action === 'accept') {
    // keep engine winner
  }

  if (override.action === 'escalate') {
    next.winning_value = value;
    next.winning_unit = unit;
    next.status = STATUSES.CONFLICTING;
    next.blocked = true;
    next.voice = voiceState(next);
    next.audit = [
      ...(record.audit || []),
      {
        action: 'escalate',
        accepted_by: String(override.accepted_by).trim(),
        accepted_at,
        value,
        unit,
        note: String(override.note).trim(),
        rule_applied: record.rule_applied,
        candidate_doc_id: override.candidate_doc_id || null,
        classification: next.primary_classification,
      },
    ];
    return next;
  }

  next.winning_value = value;
  next.winning_unit = unit;
  next.winning_fact_id = winningFactId;
  next.blocked = false;
  next.status = STATUSES.VERIFIED;
  next.voice = voiceState(next);
  const version = (record.version || 0) + 1;
  next.version = version;
  next.audit = [
    ...(record.audit || []),
    {
      action: override.action,
      accepted_by: String(override.accepted_by).trim(),
      accepted_at,
      value,
      unit,
      note: override.note
        ? String(override.note).trim()
        : override.action === 'accept'
          ? 'Accepted the engine’s proposed value.'
          : null,
      rule_applied: record.rule_applied,
      candidate_doc_id: override.candidate_doc_id || null,
      classification: next.primary_classification,
      version,
    },
  ];
  return next;
}

/**
 * Immutable acceptance records for downstream (Person B → next stage).
 * Unresolved / blocked fields are omitted from `accepted` and listed in `blocked`.
 */
export function buildAcceptanceRecords(records, options = {}) {
  const accepted = [];
  const blocked = [];
  const context = [];
  for (const r of records) {
    const winner = (r.candidates || []).find((c) => c.is_winner);
    const evidenceIds = [...new Set(
      (r.candidates || [])
        .map((c) => (c.source && c.source.doc_id) || c.fact_id)
        .filter(Boolean)
    )];
    const lastHuman = [...(r.audit || [])].reverse().find((a) => a.accepted_by && a.accepted_by !== 'engine' && a.accepted_by !== 'rules-engine');
    const lastAutomatic = [...(r.audit || [])].reverse().find((a) => a.action === 'auto_retain_context');
    const base = {
      property_id: r.property_id,
      field: r.field,
      classification: r.reviewer_classification || r.primary_classification,
      accepted_value: r.winning_value,
      accepted_display: r.winning_display,
      winning_fact_id: r.winning_fact_id || (winner && winner.fact_id) || null,
      source_evidence_ids: evidenceIds,
      rule_id: r.rule_applied || `field-rule:${r.field}`,
      reason: (lastHuman && lastHuman.note) || r.headline_reason || null,
      accepted_by: lastHuman ? lastHuman.accepted_by : null,
      accepted_at: lastHuman ? lastHuman.accepted_at : null,
      status: r.status === STATUSES.VERIFIED ? 'accepted' : r.blocked ? 'blocked' : r.status,
      version: r.version || (r.status === STATUSES.VERIFIED ? 1 : 0),
      resolution_kind: r.resolution_kind || 'single_fact',
      scoped_facts: r.resolution_kind === 'scoped_context' ? r.scoped_facts || [] : undefined,
    };
    if (r.resolution_kind === 'scoped_context') {
      context.push({ ...base, accepted_value: null, accepted_display: 'Separate scoped evidence only',
        winning_fact_id: null, status: 'context_only',
        accepted_by: lastHuman?.accepted_by || lastAutomatic?.accepted_by || null,
        accepted_at: lastHuman?.accepted_at || lastAutomatic?.accepted_at || null,
        reason: lastHuman?.note || lastAutomatic?.note || base.reason,
      });
    } else if (r.status === STATUSES.VERIFIED && !r.blocked) accepted.push(base);
    else if (r.status === STATUSES.CONFLICTING || r.blocked || r.status === STATUSES.PENDING || r.status === STATUSES.UNKNOWN) {
      blocked.push({ ...base, status: r.blocked ? 'blocked' : r.status });
    }
  }
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: options.now || new Date().toISOString(),
    generated_by: options.generated_by || 'fact-reconciliation-workbench',
    input_label: options.input_label || null,
    accepted,
    blocked,
    context,
  };
}

/**
 * Build the verified-record document for the next stage.
 */
export function buildVerifiedRecord(records, options = {}) {
  const byProp = new Map();
  for (const r of records) {
    if (!byProp.has(r.property_id)) {
      byProp.set(r.property_id, {
        property_id: r.property_id,
        property_name: r.property_name,
        fields: [],
      });
    }
    byProp.get(r.property_id).fields.push(r);
    if (!byProp.get(r.property_id).property_name && r.property_name) {
      byProp.get(r.property_id).property_name = r.property_name;
    }
  }
  const properties = [];
  for (const p of byProp.values()) {
    const classifications = {};
    const statuses = { verified: 0, pending: 0, conflicting: 0, unknown: 0 };
    let quotable = 0;
    let contextOnly = 0;
    for (const f of p.fields) {
      classifications[f.primary_classification] = (classifications[f.primary_classification] || 0) + 1;
      if (statuses[f.status] != null) statuses[f.status] += 1;
      if (f.voice && f.voice.quotable) quotable += 1;
      if (f.resolution_kind === 'scoped_context') contextOnly += 1;
    }
    p.summary = {
      fields: p.fields.length,
      verified: statuses.verified - contextOnly,
      context_only: contextOnly,
      pending: statuses.pending,
      conflicting: statuses.conflicting,
      unknown: statuses.unknown,
      quotable,
      needs_review: statuses.conflicting + statuses.pending,
      classifications,
    };
    properties.push(p);
  }
  const acceptance = buildAcceptanceRecords(records, {
    now: options.now,
    generated_by: options.generated_by,
    input_label: options.input_label,
  });
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: options.now || new Date().toISOString(),
    generated_by: options.generated_by || 'verified-fact-record engine',
    input_label: options.input_label || null,
    reviewer: options.reviewer || null,
    rules: options.includeRules === false ? undefined : (options.rules || DEFAULT_RULES),
    properties,
    accepted_facts: acceptance.accepted,
    blocked_facts: acceptance.blocked,
    context_facts: acceptance.context,
  };
}

/**
 * Find spans in a quote that correspond to a fact's value, for UI highlighting.
 * Returns [{start, end, text}].
 */
export function highlightSpans(quote, fact) {
  if (!quote) return [];
  const spans = [];
  const add = (re) => {
    const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
    const r = new RegExp(re.source, flags);
    let m;
    while ((m = r.exec(quote)) !== null) {
      spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      if (m.index === r.lastIndex) r.lastIndex += 1;
    }
  };
  const field = canonicalField(fact.field);
  const unit = canonicalUnit(fact.unit);
  if (field === 'price') {
    const n = parseNumber(fact.value);
    if (n != null) {
      const raw = String(Math.round(n));
      const grouped = Math.round(n).toLocaleString('en-GB');
      add(new RegExp('£\\s*' + grouped.replace(/,/g, ',?'), 'g'));
      add(new RegExp('£\\s*' + raw, 'g'));
      add(new RegExp(grouped.replace(/,/g, ',?'), 'g'));
    }
  } else if (AREA_FIELDS.has(field)) {
    const n = parseNumber(fact.value);
    if (n != null) {
      const raw = String(n);
      const grouped = n.toLocaleString('en-GB');
      const unitPat = unit === 'sqm'
        ? '(?:sq\\.?\\s*m(?:etres?)?|m[²2])'
        : unit === 'sqft'
          ? '(?:sq\\.?\\s*ft|sf|ft[²2])'
          : '';
      add(new RegExp(grouped.replace(/,/g, ',?') + '\\s*' + unitPat, 'gi'));
      add(new RegExp(raw + '\\s*' + unitPat, 'gi'));
      add(new RegExp(grouped.replace(/,/g, ',?'), 'g'));
    }
  } else if (fact.value != null) {
    const v = String(fact.value).trim();
    if (v) add(new RegExp(escapeRe(v), 'gi'));
  }
  // Dedup overlapping, keep longest first then left-to-right, no overlaps.
  spans.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const kept = [];
  for (const s of spans) {
    if (kept.some((k) => !(s.end <= k.start || s.start >= k.end))) continue;
    kept.push(s);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findRecord(records, propertyId, field) {
  const f = canonicalField(field);
  return records.find((r) => r.property_id === propertyId && r.field === f) || null;
}

export const DECISION_ORDER_TEXT = `
Decision order (first match wins) for a pair of facts on the same property and field:

  0. UNMATCHED — entity resolution is not confident: hold the source unmatched
       and do not raise a conflict. Status: unknown. Voice: do not guess.
  0b. PLOT_OR_TYPE — different plots or house types: never merge. Answer only
       for the named plot. If the plot is not matched, treat as unknown.
  0c. SCOPE_DIFFERENCE — development-wide claim vs a per-unit fact: keep both
       at their stated scope; do not copy a block claim onto a unit.
  0d. AGREE — same normalised value, same unit (or both unitless), same area basis.

  1. UNIT_MISMATCH —
       a. sq ft vs sq m that agree after conversion within tolerance (default 2%);
       b. net vs gross: always a basis mismatch, never a conflict
          (stored as two separate resolved facts);
       c. a conversion that is arithmetically wrong (e.g. 185 sq m printed as
          2,700 sq ft) is a document error, not two areas. Prefer the source
          that states both figures consistently.
  2. OFFICIAL_RECORD_DISAGREEMENT — marketing or a listing disagrees with
       Land Registry or the EPC register. Do not auto-correct. Mark 'check this'.
       The agent checks the current title, not only Price Paid (which is as at
       the sale date and may lag). Human sign-off required. Status: conflicting.
       Exception: for asking price, an official last-sold is historical → SUPERSEDED.
  3. STALE_LISTING — a listing disagrees with a higher-tier document (typical:
       a portal still showing an old asking price after a new brochure). Flag
       the listing for update. Status: pending until the document is verified.
  4. SUPERSEDED (version supersession) — a later document of the same type
       from the same issuer replaces an earlier one. Recency applies only within
       the same source-authority tier; a newer brochure never beats a higher
       tier (contract > official register > signed spec > signed price list >
       particulars > listing). For a material field such as price, the candidate
       is proposed but status stays pending until a human signs it off. History
       is kept. Two peer listings that disagree are not supersession.
  5. TRUE_CONFLICT — same unit, field and basis; values that cannot both be
       right (e.g. two listing rows, one leasehold and one freehold). Do not
       auto-pick by recency alone when sources are peers. Human sign-off
       required. Status: conflicting. The voice agent must not quote either value.

Field statuses: verified | pending | conflicting | unknown.
The voice agent quotes a field only when status is verified.

Headline (primary_classification) priority:
  OFFICIAL_RECORD_DISAGREEMENT > TRUE_CONFLICT > UNMATCHED > UNIT_MISMATCH
    > SCOPE_DIFFERENCE > PLOT_OR_TYPE > SUPERSEDED > STALE_LISTING > AGREE.
`.trim();
