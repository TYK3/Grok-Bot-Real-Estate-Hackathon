import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isFactRecordExtracted, adaptFactRecordExtracted } from '../src/fact_record_adapter.js';
import { ingestJson } from '../src/ingest.js';
import { resolveAll, CLASSIFICATIONS } from '../src/resolve.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '..');
const extracted = JSON.parse(
  readFileSync(resolve(repoRoot, 'fact_record/contracts/01_extracted.json'), 'utf8')
);
const manifest = JSON.parse(
  readFileSync(resolve(repoRoot, 'fact_record/sample_data/manifest.json'), 'utf8')
);

describe('fact_record 01_extracted adapter', () => {
  it('detects the contract shape', () => {
    assert.equal(isFactRecordExtracted(extracted), true);
    assert.equal(isFactRecordExtracted({ facts: [] }), false);
    assert.equal(isFactRecordExtracted([{ field: 'price', value: 1 }]), false);
  });

  it('flattens developments into workbench facts and documents with PDF URLs', () => {
    const adapted = adaptFactRecordExtracted(extracted, {
      manifest,
      sampleDataBaseUrl: '../fact_record/sample_data',
    });
    assert.ok(adapted.facts.length >= 70, `expected many facts, got ${adapted.facts.length}`);
    assert.ok(adapted.documents.length >= 6);
    assert.ok(adapted.contradictions.length >= 11);
    assert.ok(adapted.scenarios.some((s) => s.id === 'C01'));

    const price = adapted.facts.find((f) => f.field === 'price' && f.value === 600000);
    assert.ok(price, 'October £600,000 guide should be present');
    assert.equal(price.unit, 'GBP');
    assert.equal(price.source.doc_id, 'carterjonas-f8692efa');
    assert.match(price.source.url || '', /carterjonas-f8692efa\.pdf$/);

    const nia = adapted.facts.find(
      (f) => f.field === 'net_floor_area' && Number(f.value) === 1990
    );
    assert.ok(nia, 'October NIA 1,990 sq ft should map to net_floor_area');
    assert.equal(nia.unit, 'sqft');
    assert.equal(nia.area_basis, 'net');

    const parkingTotal = adapted.facts.find(
      (f) => f.field === 'parking_total' && Number(f.value) === 5
    );
    assert.ok(parkingTotal, 'Survey 5 allocated spaces should map to parking_total');

    const epc = adapted.facts.find((f) => f.field === 'energy_rating');
    assert.ok(epc, 'EPC ratings should map to energy_rating');
  });

  it('ingestJson routes the contract and resolveAll classifies Kelso price / areas', () => {
    const ingested = ingestJson(extracted, '01_extracted.json', {
      manifest,
      sampleDataBaseUrl: '../fact_record/sample_data',
    });
    assert.equal(ingested.contract, '01_extracted');
    assert.ok(ingested.facts.length > 0);
    assert.ok(ingested.scenarios.length >= 11);

    const { records } = resolveAll(ingested.facts, { asOf: '2026-11-12', autoRetainContext: true });
    const kelsoWhole = records.filter((r) => r.property_id === 'kelso-villa-ba1-3au:whole');
    assert.ok(kelsoWhole.length > 0, 'kelso whole-building unit should resolve');

    const price = kelsoWhole.find((r) => r.field === 'price');
    assert.ok(price);
    assert.ok(
      [CLASSIFICATIONS.SUPERSEDED, CLASSIFICATIONS.TRUE_CONFLICT, CLASSIFICATIONS.STALE_LISTING].includes(
        price.primary_classification
      ) || price.candidates.length > 1,
      `price should show a disagreement, got ${price.primary_classification}`
    );

    const stHuberts = records.filter((r) => r.property_id === 'st-huberts-close-gerrards-cross:no-59');
    assert.ok(stHuberts.some((r) => r.field === 'price'), 'No. 59 price should be present');
  });
});
