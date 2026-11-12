import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  loadFacts,
  resolveAll,
  classifyPair,
  applyOverride,
  buildVerifiedRecord,
  findRecord,
  CLASSIFICATIONS,
  STATUSES,
  canonicalField,
  canonicalUnit,
  canonicalDocType,
  toSqft,
  valuesWithinTolerance,
  sourceTier,
  isWrongConversion,
} from '../src/resolve.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kelsoJson = JSON.parse(readFileSync(resolve(root, 'data/kelso_villa.example.json'), 'utf8'));
const edgesJson = JSON.parse(readFileSync(resolve(root, 'data/edge_cases.example.json'), 'utf8'));

const NOW = '2026-11-12T20:20:00.000Z';

function resolveInput(input) {
  return resolveAll(input, { now: NOW, asOf: '2026-11-12' });
}

describe('tolerant loader', () => {
  it('accepts a raw array and a {facts:[...]} envelope', () => {
    const a = loadFacts(kelsoJson);
    const b = loadFacts(kelsoJson.facts);
    assert.equal(a.length, kelsoJson.facts.length);
    assert.equal(b.length, a.length);
    assert.equal(a[0].field, 'price');
    assert.equal(a[0].property_id, 'kelso-villa');
  });

  it('fills missing optional fields and accepts aliases', () => {
    const facts = loadFacts([
      {
        property_name: 'Alias House',
        field: 'asking_price',
        value: '£1,250,000',
        source_type: 'sale_particulars',
        doc_id: 'x',
        quote: 'Guide £1,250,000',
      },
      {
        property_name: 'Alias House',
        field: 'nia',
        value: 185,
        units: 'm²',
        basis: 'NIA',
        doc_type: 'brochure',
        page: 2,
      },
      {
        property_name: 'Alias House',
        field: 'epc',
        value: 'b',
        source: { type: 'epc_register', title: 'EPC register' },
      },
    ]);
    assert.equal(facts[0].field, 'price');
    assert.equal(facts[0].unit, 'GBP');
    assert.equal(facts[0].source.doc_type, 'brochure');
    assert.equal(facts[1].field, 'net_floor_area');
    assert.equal(facts[1].unit, 'sqm');
    assert.equal(facts[1].area_basis, 'net');
    assert.equal(facts[2].field, 'energy_rating');
    assert.equal(facts[2].source.doc_type, 'official_record');
    assert.ok(facts[0].property_id);
    assert.equal(facts[2].page, null);
  });

  it('normalises field, unit and doc-type aliases', () => {
    assert.equal(canonicalField('Guide Price'), 'price');
    assert.equal(canonicalField('GIA'), 'gross_floor_area');
    assert.equal(canonicalUnit('sq ft'), 'sqft');
    assert.equal(canonicalUnit('m²'), 'sqm');
    assert.equal(canonicalDocType('land_registry'), 'official_record');
    assert.equal(canonicalDocType('EPC register'), 'official_record');
    assert.equal(canonicalDocType('sale_contract'), 'sale_contract');
  });
});

describe('Kelso Villa — required classifications (product spec)', () => {
  const { records } = resolveInput(kelsoJson);
  const price = findRecord(records, 'kelso-villa', 'price');
  const net = findRecord(records, 'kelso-villa', 'net_floor_area');
  const tenure = findRecord(records, 'kelso-villa', 'tenure');

  it('resolves price, net floor area and tenure', () => {
    assert.ok(price, 'price record missing');
    assert.ok(net, 'net_floor_area record missing');
    assert.ok(tenure, 'tenure record missing');
  });

  it('price → SUPERSEDED (April £700,000 replaced by October £600,000); status pending; listings stale', () => {
    assert.equal(price.primary_classification, CLASSIFICATIONS.SUPERSEDED);
    assert.equal(price.winning_value, 600000);
    assert.equal(price.winning_unit, 'GBP');
    // Price is material: candidate is proposed, status stays pending until a human signs it off.
    assert.equal(price.status, STATUSES.PENDING);
    assert.equal(price.voice.quotable, false);
    assert.match(price.voice.speaker_note, /not been verified|will not be quoted/i);

    const older = price.candidates.find(
      (c) => c.source.doc_id === '20018480' && c.classification === CLASSIFICATIONS.SUPERSEDED
    );
    assert.ok(older, 'April brochure should be classified SUPERSEDED');
    assert.match(older.reason, /700,?000/);
    assert.match(older.reason, /600,?000/);
    assert.match(older.reason, /replaced|later|issuer/i);

    const winner = price.candidates.find((c) => c.is_winner);
    assert.equal(winner.source.doc_id, '20020159');

    const listings = price.candidates.filter((c) => c.source.doc_type === 'listing');
    assert.equal(listings.length, 2, 'both listing rows should be present');
    for (const listing of listings) {
      assert.equal(listing.classification, CLASSIFICATIONS.STALE_LISTING);
      assert.equal(listing.flag_listing_for_update, true);
    }
    assert.ok(price.listing_update_flags && price.listing_update_flags.length >= 2);

    // After human sign-off, the field is verified and the voice agent may quote it.
    const signed = applyOverride(price, {
      action: 'accept',
      accepted_by: 'Jigar Polra',
      accepted_at: NOW,
    });
    assert.equal(signed.status, STATUSES.VERIFIED);
    assert.equal(signed.voice.quotable, true);
    assert.match(signed.voice.speaker_note, /600,?000/);
    assert.equal(signed.audit.length, 2);
    assert.equal(signed.audit[0].accepted_by, 'engine');
    assert.equal(signed.audit[1].accepted_by, 'Jigar Polra');
  });

  it('net floor area → UNIT_MISMATCH (April 185 sq m printed as 2,700 sq ft is a conversion/basis error)', () => {
    assert.equal(net.primary_classification, CLASSIFICATIONS.UNIT_MISMATCH);
    assert.equal(net.status, STATUSES.PENDING);
    assert.equal(net.voice.quotable, false);

    // 185 sq m ≈ 1,991 sq ft, within 2% of 1,990; 2,700 sq ft does not convert.
    const sqft = toSqft(185, 'sqm');
    assert.ok(valuesWithinTolerance(sqft, 1990, 0.02), `185 sqm = ${sqft} sqft, expected ≈1990`);
    assert.equal(valuesWithinTolerance(sqft, 2700, 0.02), false);

    const aprilWrong = net.candidates.find((c) => c.source.doc_id === '20018480' && Number(c.value) === 2700);
    assert.ok(aprilWrong, 'April 2,700 sq ft extraction should be in the net group');
    assert.equal(aprilWrong.classification, CLASSIFICATIONS.UNIT_MISMATCH);
    assert.match(aprilWrong.reason, /document (conversion|error)|arithmetically|basis error|not two/i);

    // The consistent October brochure is preferred as the candidate.
    const winner = net.candidates.find((c) => c.is_winner);
    assert.equal(winner.source.doc_id, '20020159');
    assert.ok(net.equivalent);
    assert.ok(valuesWithinTolerance(net.equivalent.sqm, 185, 0.02));
    assert.ok(valuesWithinTolerance(net.equivalent.sqft, 1990, 0.02));
    assert.match(net.winning_display, /1,?990/);
    assert.match(net.winning_display, /185/);

    // GIA is a separate resolved fact, never mixed into a conflict with NIA.
    const gross = findRecord(records, 'kelso-villa', 'gross_floor_area');
    assert.ok(gross);
    assert.equal(gross.winning_value, 2700);
    assert.notEqual(gross.primary_classification, CLASSIFICATIONS.TRUE_CONFLICT);
    assert.ok(isWrongConversion(aprilWrong) || aprilWrong.stated_equivalent);
  });

  it('tenure → TRUE_CONFLICT (listing rows leasehold vs freehold); conflicting; voice must not quote', () => {
    assert.equal(tenure.primary_classification, CLASSIFICATIONS.TRUE_CONFLICT);
    assert.equal(tenure.status, STATUSES.CONFLICTING);
    assert.equal(tenure.voice.quotable, false);
    assert.match(tenure.voice.speaker_note, /disagree|won't quote|will not quote|can't give|cannot/i);

    const listings = tenure.candidates.filter((c) => c.source.doc_type === 'listing');
    assert.equal(listings.length, 2);
    const values = new Set(listings.map((c) => String(c.value).toLowerCase()));
    assert.ok(values.has('leasehold') && values.has('freehold'));
    const conflict = tenure.candidates.find(
      (c) => !c.is_winner && c.classification === CLASSIFICATIONS.TRUE_CONFLICT
    );
    assert.ok(conflict, 'a non-winner should be classified TRUE_CONFLICT');
    assert.match(conflict.reason, /cannot both be right|true conflict|peers/i);

    // No invented official record on Kelso tenure.
    assert.ok(!tenure.candidates.some((c) => c.source.doc_type === 'official_record'));
    assert.notEqual(tenure.primary_classification, CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT);
  });
});

describe('edge cases (product spec)', () => {
  const { records } = resolveInput(edgesJson);

  it('two same-dated peer brochures with different parking → TRUE_CONFLICT', () => {
    const parking = findRecord(records, 'edge-true-conflict', 'parking');
    assert.ok(parking);
    assert.equal(parking.primary_classification, CLASSIFICATIONS.TRUE_CONFLICT);
    assert.equal(parking.status, STATUSES.CONFLICTING);
    assert.equal(parking.voice.quotable, false);
  });

  it('outdated listing vs later brochure → STALE_LISTING, flagged for update', () => {
    const price = findRecord(records, 'edge-stale-listing', 'price');
    assert.ok(price);
    assert.equal(price.primary_classification, CLASSIFICATIONS.STALE_LISTING);
    assert.equal(price.winning_value, 520000);
    const listing = price.candidates.find((c) => c.source.doc_type === 'listing');
    assert.equal(listing.classification, CLASSIFICATIONS.STALE_LISTING);
    assert.equal(listing.flag_listing_for_update, true);
    assert.equal(price.status, STATUSES.PENDING);
  });

  it('official last-sold asking-price comparison is SUPERSEDED (historical), not an official disagreement', () => {
    const price = findRecord(records, 'edge-price-official-historical', 'price');
    assert.ok(price);
    assert.equal(price.primary_classification, CLASSIFICATIONS.SUPERSEDED);
    assert.equal(price.winning_value, 450000);
    const official = price.candidates.find((c) => c.source.doc_type === 'official_record');
    assert.equal(official.classification, CLASSIFICATIONS.SUPERSEDED);
    assert.notEqual(price.primary_classification, CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT);
    assert.notEqual(price.primary_classification, CLASSIFICATIONS.TRUE_CONFLICT);
  });

  it('net vs gross are separate resolved facts and never a conflict', () => {
    const net = findRecord(records, 'edge-net-vs-gross', 'net_floor_area');
    const gross = findRecord(records, 'edge-net-vs-gross', 'gross_floor_area');
    assert.ok(net && gross, 'should split into two resolved facts');
    assert.equal(net.winning_value, 1990);
    assert.equal(gross.winning_value, 2700);
    assert.notEqual(net.primary_classification, CLASSIFICATIONS.TRUE_CONFLICT);
    assert.notEqual(gross.primary_classification, CLASSIFICATIONS.TRUE_CONFLICT);
    const pair = classifyPair(net.candidates[0], gross.candidates[0]);
    assert.equal(pair.classification, CLASSIFICATIONS.UNIT_MISMATCH);
    assert.match(pair.reason, /net vs gross|bases/i);
  });

  it('Lumley House: official-record mismatch is check-this, never auto-corrected, conflicting', () => {
    const tenure = findRecord(records, 'lumley-house', 'tenure');
    assert.ok(tenure, 'Lumley House tenure missing');
    assert.equal(tenure.primary_classification, CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT);
    assert.equal(tenure.status, STATUSES.CONFLICTING);
    assert.equal(tenure.check_this, true);
    assert.equal(tenure.auto_corrected, false);
    assert.equal(tenure.voice.quotable, false);
    assert.match(tenure.voice.speaker_note, /check this|official record|current title/i);
    const official = tenure.candidates.find((c) => c.source.doc_type === 'official_record');
    const listing = tenure.candidates.find((c) => c.source.doc_type === 'listing');
    assert.ok(official && listing);
    const loser = tenure.candidates.find((c) => !c.is_winner);
    assert.ok(loser);
    assert.equal(loser.classification, CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT);
    assert.match(loser.reason, /check this|do not auto-correct|current title/i);
  });

  it('low entity-match confidence is held unmatched and does not raise a conflict (Coachman Court)', () => {
    const tenures = records.filter((r) => r.property_id === 'coachman-court-flat-53' && r.field === 'tenure');
    assert.ok(tenures.length >= 1);
    const unmatched = tenures.find((r) => r.primary_classification === CLASSIFICATIONS.UNMATCHED);
    assert.ok(unmatched, 'the Flat 21 bad join should be held unmatched');
    assert.equal(unmatched.status, STATUSES.UNKNOWN);
    assert.equal(unmatched.voice.quotable, false);
    assert.ok(tenures.every((r) => r.primary_classification !== CLASSIFICATIONS.TRUE_CONFLICT));
    assert.ok(tenures.every((r) => r.primary_classification !== CLASSIFICATIONS.OFFICIAL_RECORD_DISAGREEMENT));
    // The confident Flat 53 listing remains a live fact, not pulled into a false conflict.
    const live = tenures.find((r) => r.primary_classification !== CLASSIFICATIONS.UNMATCHED);
    assert.ok(live);
    assert.equal(String(live.winning_value).toLowerCase(), 'leasehold');
  });

  it('scope difference (development vs unit) is SCOPE_DIFFERENCE, not a true conflict', () => {
    const bathrooms = findRecord(records, 'edge-scope', 'bathrooms');
    assert.ok(bathrooms);
    assert.equal(bathrooms.primary_classification, CLASSIFICATIONS.SCOPE_DIFFERENCE);
    assert.notEqual(bathrooms.primary_classification, CLASSIFICATIONS.TRUE_CONFLICT);
    const pair = classifyPair(bathrooms.candidates[0], bathrooms.candidates[1]);
    assert.equal(pair.classification, CLASSIFICATIONS.SCOPE_DIFFERENCE);
  });

  it('different plots / house types are never merged and classify as PLOT_OR_TYPE', () => {
    const areas = records.filter((r) => r.property_id === 'edge-plot-type' && r.field === 'net_floor_area');
    assert.equal(areas.length, 2, 'two separate resolved facts, one per plot');
    assert.ok(areas.every((r) => r.primary_classification !== CLASSIFICATIONS.TRUE_CONFLICT));
    const pair = classifyPair(areas[0].candidates[0], areas[1].candidates[0]);
    assert.equal(pair.classification, CLASSIFICATIONS.PLOT_OR_TYPE);
    assert.match(pair.reason, /plot|type/i);
  });

  it('a newer brochure never beats a higher-tier signed contract', () => {
    const price = findRecord(records, 'edge-tier-precedence', 'price');
    assert.ok(price);
    assert.equal(price.winning_value, 500000);
    const winner = price.candidates.find((c) => c.is_winner);
    assert.equal(canonicalDocType(winner.source.doc_type), 'sale_contract');
    assert.equal(sourceTier(winner), 1);
    const brochure = price.candidates.find((c) => c.source.doc_type === 'brochure');
    assert.ok(brochure);
    assert.equal(brochure.is_winner, false);
    assert.ok(sourceTier(brochure) > sourceTier(winner));
  });
});

describe('unit conversion', () => {
  it('185 sq m is within 2% of 1,990 sq ft, and is not 2,700 sq ft', () => {
    const sqft = toSqft(185, 'sqm');
    assert.ok(valuesWithinTolerance(sqft, 1990, 0.02));
    assert.equal(valuesWithinTolerance(sqft, 2700, 0.02), false);
  });
});

describe('audit trail is append-only', () => {
  it('accept / choose / edit append entries, set verified, and never overwrite', () => {
    const { records } = resolveInput(kelsoJson);
    const tenure = findRecord(records, 'kelso-villa', 'tenure');
    assert.equal(tenure.audit.length, 1);
    assert.equal(tenure.audit[0].accepted_by, 'engine');
    assert.equal(tenure.status, STATUSES.CONFLICTING);

    const accepted = applyOverride(tenure, {
      action: 'accept',
      accepted_by: 'Jigar Polra',
      accepted_at: NOW,
    });
    assert.equal(accepted.audit.length, 2);
    assert.equal(tenure.audit.length, 1); // original untouched
    assert.equal(accepted.audit[0].accepted_by, 'engine');
    assert.equal(accepted.audit[1].accepted_by, 'Jigar Polra');
    assert.equal(accepted.status, STATUSES.VERIFIED);
    assert.equal(accepted.voice.quotable, true);

    const chosen = applyOverride(tenure, {
      action: 'choose_candidate',
      accepted_by: 'Jigar Polra',
      accepted_at: NOW,
      candidate_doc_id: '20020159',
      note: 'Brochure is a freehold sale of the whole building.',
    });
    assert.equal(chosen.audit.length, 2);
    assert.equal(String(chosen.winning_value).toLowerCase(), 'freehold');
    assert.equal(chosen.status, STATUSES.VERIFIED);

    const edited = applyOverride(tenure, {
      action: 'edit',
      accepted_by: 'Jigar Polra',
      accepted_at: NOW,
      value: 'Mixed (freehold building, leasehold parts)',
      note: 'Analyst note: confirm with solicitor against the current title.',
    });
    assert.equal(edited.audit.length, 2);
    assert.match(String(edited.winning_value), /Mixed/);

    assert.throws(
      () => applyOverride(tenure, { action: 'edit', accepted_by: 'Jigar Polra', value: 'x' }),
      /note is required/i
    );
    assert.throws(
      () => applyOverride(tenure, { action: 'accept', accepted_by: '  ' }),
      /reviewer name/i
    );
  });
});

describe('verified record export', () => {
  it('wraps resolved fields with statuses and voice state', () => {
    const { records, rules } = resolveInput(kelsoJson);
    const doc = buildVerifiedRecord(records, { rules, now: NOW, generated_by: 'test', input_label: 'kelso' });
    assert.equal(doc.schema_version, '1.0');
    assert.equal(doc.generated_at, NOW);
    assert.equal(doc.properties.length, 1);
    assert.equal(doc.properties[0].property_id, 'kelso-villa');
    assert.ok(doc.properties[0].summary.conflicting >= 1);
    assert.ok(doc.properties[0].summary.pending >= 1);
    assert.ok(doc.properties[0].fields.every((f) => f.voice && typeof f.voice.quotable === 'boolean'));
  });
});
