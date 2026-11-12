import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractFactsFromPages } from '../src/extract_browser.js';
import { ingestJson } from '../src/ingest.js';

const pages = JSON.parse(fs.readFileSync(new URL('./fixtures/sample_page_texts.json', import.meta.url)));
const run = (frag) => { const [name, ps] = Object.entries(pages).find(([k]) => k.includes(frag)); return extractFactsFromPages(ps, { name, doc_id: 'd' }); };

test('measured survey: per-floor NIA and GIA kept separate', () => {
  const r = run('measured-survey');
  assert.equal(r.doc_type, 'measured_survey');
  const lg = r.facts.filter((f) => f.plot === 'lower-ground');
  assert.deepEqual(lg.map((f) => [f.field, f.value]).sort(), [['gross_floor_area', 656], ['net_floor_area', 461]]);
  assert.ok(r.facts.every((f) => f.quote && f.page));
});

test('price instruction keeps revised price, drops previous and change', () => {
  const prices = run('price-change').facts.filter((f) => f.field === 'price').map((f) => f.value);
  assert.deepEqual(prices, [1395000]);
});

test('schedule of finishes: house-type rows -> GIA per type; output passes ingestJson', () => {
  const r = run('schedule-of-finishes');
  assert.ok(r.facts.some((f) => f.plot === 'type-e' && f.field === 'gross_floor_area' && f.value === 2848));
  assert.equal(ingestJson({ facts: r.facts }, 'x').facts.length, r.facts.length);
});
