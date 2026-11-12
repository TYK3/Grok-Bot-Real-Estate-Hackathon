/**
 * Adapter: fact_record contracts (01_extracted.json) → Person B workbench facts.
 *
 * Accepts the Person A pipeline contract:
 *   { contract: "01_extracted", developments: { <slug>: { documents, facts, contradictions } } }
 * and flattens it into the workbench's extracted-fact shape, with document library
 * entries pointing at sample_data PDFs when a manifest is provided.
 */

import { loadFacts, canonicalDocType, canonicalBasis, canonicalUnit } from './resolve.js';

const CONTRADICTION_TYPE_MAP = Object.freeze({
  version_supersession: 'SUPERSEDED',
  true_conflict: 'TRUE_CONFLICT',
  unit_or_measurement_mismatch: 'UNIT_MISMATCH',
  scope_difference: 'SCOPE_DIFFERENCE',
  plot_or_type_variation: 'PLOT_OR_TYPE',
  official_record_mismatch: 'OFFICIAL_RECORD_DISAGREEMENT',
  stale_listing: 'STALE_LISTING',
});

const DEVELOPMENT_LABELS = Object.freeze({
  'kelso-villa': 'Kelso Villa',
  'kelso-villa-ba1-3au': 'Kelso Villa, Bath BA1 3AU',
  '59-st-huberts-close': '59 St Huberts Close',
  'st-huberts-close-gerrards-cross': 'St Huberts Close, Gerrards Cross',
});

export function isFactRecordExtracted(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (payload.contract === '01_extracted') return true;
  if (payload.developments && typeof payload.developments === 'object') {
    const first = Object.values(payload.developments)[0];
    return Boolean(first && (Array.isArray(first.facts) || Array.isArray(first.contradictions)));
  }
  return false;
}

/**
 * @param {object} payload 01_extracted contract (or equivalent)
 * @param {object} [options]
 * @param {object} [options.manifest] sample_data/manifest.json
 * @param {string} [options.sampleDataBaseUrl] URL prefix for PDFs, e.g. '../fact_record/sample_data'
 */
export function adaptFactRecordExtracted(payload, options = {}) {
  const sampleDataBaseUrl = (options.sampleDataBaseUrl || '../fact_record/sample_data').replace(/\/$/, '');
  const manifestByDoc = indexManifest(options.manifest);

  const factsOut = [];
  const documentsOut = [];
  const scenarios = [];
  const contradictions = [];
  const warnings = [];
  const seenDocs = new Set();

  const developments = payload.developments || {};
  for (const [devKey, dev] of Object.entries(developments)) {
    const developmentId = dev.development_id || devKey;
    const developmentLabel = DEVELOPMENT_LABELS[devKey] || DEVELOPMENT_LABELS[developmentId] || humanise(developmentId);

    for (const doc of dev.documents || []) {
      const enriched = enrichDocument(doc, {
        developmentId,
        developmentLabel,
        developmentKey: devKey,
        manifestByDoc,
        sampleDataBaseUrl,
      });
      const key = enriched.doc_id;
      if (!seenDocs.has(key)) {
        seenDocs.add(key);
        documentsOut.push(enriched);
      }
    }

    const factById = new Map();
    (dev.facts || []).forEach((raw, index) => {
      const adapted = adaptOneFact(raw, {
        index,
        developmentId,
        developmentLabel,
        developmentKey: devKey,
        manifestByDoc,
        sampleDataBaseUrl,
      });
      if (!adapted) {
        warnings.push(`Skipped fact ${raw.id || index} (${raw.field}) — could not normalise value.`);
        return;
      }
      factById.set(raw.id, adapted);
      factsOut.push(adapted);

      // Ensure document library entry exists even if documents[] omitted the source.
      if (adapted.source?.doc_id && !seenDocs.has(adapted.source.doc_id)) {
        seenDocs.add(adapted.source.doc_id);
        documentsOut.push(
          enrichDocument(
            {
              doc_id: adapted.source.doc_id,
              doc_type: adapted.source.doc_type,
              issuer_org: adapted.source.issuer,
              doc_date: adapted.source.published_date,
              unit_id: raw.unit_id,
            },
            {
              developmentId,
              developmentLabel,
              developmentKey: devKey,
              manifestByDoc,
              sampleDataBaseUrl,
            }
          )
        );
      }
    });

    for (const c of dev.contradictions || []) {
      const mappedType = CONTRADICTION_TYPE_MAP[c.type] || c.type;
      const memberFacts = (c.fact_ids || []).map((id) => factById.get(id)).filter(Boolean);
      const recommended = factById.get(c.recommended_fact_id) || null;
      const unitLabel = propertyNameFromUnit(c.unit_id, developmentLabel);
      const scenario = {
        id: c.id,
        title: `${c.id} · ${fieldTitle(c.field)}`,
        development_id: developmentId,
        unit_id: c.unit_id,
        field: c.field,
        type: c.type,
        classification: mappedType,
        requires_human: Boolean(c.requires_human),
        status: c.status || 'open',
        recommendation_reason: c.recommendation_reason || null,
        recommended_fact_id: c.recommended_fact_id || null,
        values: c.values || [],
        fact_ids: c.fact_ids || [],
        summary: c.recommendation_reason || `${mappedType} on ${c.field}`,
      };
      scenarios.push(scenario);
      contradictions.push({
        ...c,
        classification: mappedType,
        property_id: propertyIdFromUnit(c.unit_id, developmentId),
        property_name: unitLabel,
        member_facts: memberFacts,
        recommended_fact: recommended,
      });

      // Stamp case_id onto member facts so the UI can title the queue item.
      for (const f of memberFacts) {
        if (!f.case_id) f.case_id = c.id;
      }
    }
  }

  // Second pass through loadFacts so engine aliases / units / basis are applied consistently.
  const normalised = loadFacts({
    label: payload.label || 'fact_record 01_extracted',
    facts: factsOut,
  });

  // Preserve case_id / doc_error / display after loadFacts (which keeps unknown extras only via rebuild).
  const byId = new Map(factsOut.map((f) => [f.fact_id, f]));
  for (const f of normalised) {
    const prior = byId.get(f.fact_id);
    if (!prior) continue;
    if (prior.case_id) f.case_id = prior.case_id;
    if (prior.doc_error) f.doc_error = true;
    if (prior.display_hint) f.display_hint = prior.display_hint;
    if (prior.unit_id) f.unit_id = prior.unit_id;
    if (prior.development_id) f.development_id = prior.development_id;
  }

  return {
    label: payload.label || 'fact_record · 01_extracted',
    example: Boolean(payload.example),
    facts: normalised,
    documents: documentsOut,
    scenarios,
    contradictions,
    warnings,
    contract: '01_extracted',
    version: payload.version || 1,
  };
}

function adaptOneFact(raw, ctx) {
  const flattened = flattenValue(raw);
  if (flattened == null && raw.display == null && raw.value_raw == null) return null;

  const basis = canonicalBasis(raw.basis || raw.qualifier?.basis || null);
  let field = raw.field;
  // Map floor_area + NIA/GIA into net/gross groups the engine already understands.
  if (field === 'floor_area' && basis === 'net') field = 'net_floor_area';
  if (field === 'floor_area' && basis === 'gross') field = 'gross_floor_area';
  if (field === 'floor_area' && String(raw.unit_id || '').includes('lower-ground')) {
    field = 'lower_ground_floor_area';
  }
  if (field === 'parking') {
    const scope = String(raw.scope || raw.qualifier?.scope || '').toLowerCase();
    if (scope === 'per_floor') field = 'parking_scope';
    else if (scope === 'total' || scope === 'building' || scope === 'whole') field = 'parking_total';
  }
  if (field === 'bathroom_fixture' || field === 'en_suite_fittings') field = 'en_suite_bathroom';
  if (field === 'epc_rating') field = 'energy_rating';

  const unitId = raw.unit_id || ctx.developmentId;
  const propertyId = propertyIdFromUnit(unitId, ctx.developmentId);
  const propertyName = propertyNameFromUnit(unitId, ctx.developmentLabel);
  const manifest = ctx.manifestByDoc.get(raw.doc_id) || null;
  const pdfUrl = manifest?.file ? `${ctx.sampleDataBaseUrl}/${manifest.file}` : null;

  const scope = mapScope(raw.scope || raw.qualifier?.scope || null);
  const plot = extractPlot(unitId);
  const unitType = extractUnitType(unitId, raw.scope);

  return {
    id: raw.id,
    fact_id: raw.id,
    property_id: propertyId,
    property_name: propertyName,
    unit_id: unitId,
    development_id: ctx.developmentId,
    field,
    value: flattened.value,
    unit: flattened.unit,
    area_basis: basis === 'unspecified' ? null : basis,
    scope,
    plot,
    unit_type: unitType,
    page: raw.page,
    quote: raw.quote || raw.value_raw || raw.display || null,
    quote_attribution: raw.quote_source ? `quote_source=${raw.quote_source}` : null,
    extraction_confidence: raw.extraction_method === 'regex' ? 0.85 : 0.75,
    entity_match_confidence: 1.0,
    doc_error: Boolean(raw.doc_error),
    display_hint: raw.display || null,
    case_id: null,
    source: {
      doc_id: raw.doc_id,
      doc_type: mapDocType(raw.doc_type),
      title: documentTitle(raw, manifest),
      published_date: normaliseLooseDate(raw.doc_date || manifest?.date),
      issuer: raw.issuer || manifest?.issuer || null,
      agent: raw.issuer || manifest?.issuer || null,
      url: pdfUrl,
      synthetic: Boolean(manifest?.synthetic),
      authority_tier: raw.authority_tier ?? manifest?.authority_tier ?? null,
    },
  };
}

function flattenValue(raw) {
  const v = raw.value;
  if (v == null) {
    if (raw.display != null) return { value: raw.display, unit: null };
    if (raw.value_raw != null) return { value: raw.value_raw, unit: null };
    return null;
  }
  if (typeof v !== 'object') return { value: v, unit: raw.unit || null };

  if (v.amount != null && v.currency) {
    return { value: v.amount, unit: canonicalUnit(v.currency) || 'GBP' };
  }
  if (v.amount != null && v.unit) {
    return { value: v.amount, unit: canonicalUnit(v.unit) };
  }
  if (v.spaces != null) {
    return { value: v.spaces, unit: null };
  }
  if (v.count != null) {
    return { value: v.count, unit: null };
  }
  if (v.band != null) {
    return { value: String(v.band).toUpperCase(), unit: null };
  }
  if (v.tenure != null) {
    return { value: v.tenure, unit: null };
  }
  if (v.fixture != null) {
    return { value: v.text || v.fixture, unit: null };
  }
  if (v.status != null) {
    return { value: v.status, unit: null };
  }
  if (v.type != null) {
    return { value: v.type, unit: null };
  }
  if (v.grade != null) {
    return { value: v.grade, unit: null };
  }
  if (v.text != null) {
    return { value: v.text, unit: null };
  }
  // Fallback: keep display string so the fact is still reviewable.
  return { value: raw.display || raw.value_raw || JSON.stringify(v), unit: null };
}

function enrichDocument(doc, ctx) {
  const manifest = ctx.manifestByDoc.get(doc.doc_id) || null;
  const file = manifest?.file || null;
  const objectUrl = file ? `${ctx.sampleDataBaseUrl}/${file}` : null;
  return {
    doc_id: doc.doc_id,
    name: file || `${doc.doc_id}.pdf`,
    kind: 'pdf',
    doc_type: mapDocType(doc.doc_type || manifest?.doc_type),
    title: documentTitle(doc, manifest),
    published_date: normaliseLooseDate(doc.doc_date || manifest?.date),
    issuer: doc.issuer_org || doc.issuer || manifest?.issuer || null,
    property_ids: [propertyIdFromUnit(doc.unit_id, ctx.developmentId)],
    page_count: doc.page_count || manifest?.page_count || null,
    object_url: objectUrl,
    url: objectUrl,
    synthetic: Boolean(manifest?.synthetic),
    authority_tier: doc.authority_tier ?? manifest?.authority_tier ?? null,
    note: manifest?.description || null,
  };
}

function documentTitle(docOrFact, manifest) {
  if (manifest?.description) {
    const short = String(manifest.description).split(':')[0];
    return `${manifest.issuer || docOrFact.issuer || docOrFact.issuer_org || 'Source'} — ${short}`;
  }
  const issuer = docOrFact.issuer || docOrFact.issuer_org || manifest?.issuer;
  const dtype = (docOrFact.doc_type || manifest?.doc_type || 'document').replace(/_/g, ' ');
  const date = docOrFact.doc_date || manifest?.date || '';
  return [issuer, dtype, date].filter(Boolean).join(' · ') || docOrFact.doc_id;
}

function mapDocType(raw) {
  const key = String(raw || '').toLowerCase();
  if (key === 'particulars' || key === 'sale_particulars') return 'brochure';
  if (key === 'schedule_of_finishes' || key === 'finishes_schedule') return 'specification';
  if (key === 'developer_instruction') return 'developer_instruction';
  if (key === 'measured_survey') return 'measured_survey';
  return canonicalDocType(raw);
}

function mapScope(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).toLowerCase();
  if (s === 'per_floor') return 'unit'; // engine scope vocab; preserve detail via field split
  if (s === 'building' || s === 'whole' || s === 'total') return 'unit';
  if (s === 'development') return 'development';
  if (s === 'unit') return 'unit';
  if (s.startsWith('floor:')) return 'unit';
  if (s.startsWith('house_type')) return 'unit';
  return s;
}

function propertyIdFromUnit(unitId, developmentId) {
  if (unitId && String(unitId).includes(':')) return String(unitId);
  return String(unitId || developmentId || 'unknown');
}

function propertyNameFromUnit(unitId, developmentLabel) {
  const id = String(unitId || '');
  if (!id.includes(':')) return developmentLabel || humanise(id);
  const [, unit] = id.split(':');
  const unitBit = humanise(unit);
  if (unit === 'whole' || unit === 'development') return developmentLabel;
  if (unit === 'no-59') return '59 St Huberts Close';
  return `${developmentLabel} · ${unitBit}`;
}

function extractPlot(unitId) {
  const id = String(unitId || '');
  if (id.endsWith(':no-59')) return '59';
  if (/:type-[a-z]$/i.test(id)) return null;
  return null;
}

function extractUnitType(unitId, scope) {
  const id = String(unitId || '');
  const m = id.match(/:type-([a-z0-9-]+)$/i);
  if (m) return `type ${m[1].toUpperCase()}`;
  const s = String(scope || '');
  const sm = s.match(/house_type:([a-z0-9-]+)/i);
  if (sm) return `type ${sm[1].toUpperCase()}`;
  if (s === 'house_type') return 'house type';
  return null;
}

function fieldTitle(field) {
  return String(field || 'field').replace(/_/g, ' ');
}

function humanise(s) {
  return String(s || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function normaliseLooseDate(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  return s;
}

function indexManifest(manifest) {
  const map = new Map();
  const docs = Array.isArray(manifest?.documents) ? manifest.documents : Array.isArray(manifest) ? manifest : [];
  for (const d of docs) {
    if (d?.doc_id) map.set(d.doc_id, d);
  }
  return map;
}

export function contradictionTypeToClassification(type) {
  return CONTRADICTION_TYPE_MAP[type] || type;
}
