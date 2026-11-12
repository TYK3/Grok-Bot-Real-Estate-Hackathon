import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { resolveAll, applyOverride } from '../src/resolve.js';
import { buildDatabaseHandoff } from '../src/database_handoff.js';
import { ingestJson } from '../src/ingest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(resolve(root, 'data/review_scenarios.example.json'), 'utf8'));
const rules = JSON.parse(readFileSync(resolve(root, 'config/field_rules.json'), 'utf8'));
const time = '2026-11-12T21:25:00Z';
const facts = ingestJson(fixture, 'review_scenarios.example.json').facts;
const records = resolveAll(facts, { now: time, rules, autoRetainContext: true }).records;
const get = (caseId) => records.find((r) => r.case_id === caseId);
const produce = (items) => buildDatabaseHandoff(items, {
  generated_at: time,
  documents: fixture.documents,
  batch_id: 'test-example', example: true,
});

describe('database engineering handoff (not review archive)', () => {
  it('does not publish six pending/conflicting fields or three context-only cases', () => {
    const handoff = produce(records);
    assert.deepEqual(handoff.counts, { accepted: 0, context: 3, unresolved: 6 });
    assert.equal(handoff.example_only, true);
    assert.equal(handoff.properties.length, 2);
    assert.equal(handoff.source_documents.length, 6);
    assert.equal(handoff.extracted_evidence.length, facts.length);
    assert.ok(handoff.context_facts.every((c) => c.publishable_as_single_fact === false));
    assert.ok(handoff.unresolved_cases.every((c) => c.publishable === false));
    assert.ok(handoff.unresolved_cases.some((c) => c.field === 'floor_area' && c.document_error));
  });

  it('one accepted price carries value, stable version key, provenance and local reviewer trust caveat', () => {
    const original = get('kelso-price');
    const updated = applyOverride(original, {
      action: 'accept', accepted_by: 'Test Reviewer', accepted_at: time,
      note: 'Accepted newer October brochure after reviewing April.',
    });
    const handoff = produce(records.map((r) => r === original ? updated : r));
    assert.deepEqual(handoff.counts, { accepted: 1, context: 3, unresolved: 5 });
    const price = handoff.accepted_facts[0];
    assert.equal(price.record_id, 'kelso-villa::price::v1');
    assert.equal(price.value, 600000);
    assert.equal(price.unit, 'GBP');
    assert.equal(price.currency, 'GBP');
    assert.equal(price.source_document_id, 'kv-oct');
    assert.equal(price.source_evidence_id, 'kelso-price__kv-oct__2');
    assert.equal(price.decision.accepted_by, 'Test Reviewer');
    assert.equal(price.decision.accepted_at, time);
    assert.equal(price.decision.trust_level, 'browser_local_unverified');
    assert.ok(handoff.extracted_evidence.some((e) => e.evidence_id === price.source_evidence_id && e.quote));
    assert.ok(handoff.audit_events.some((a) => a.action === 'accept' && a.actor === 'Test Reviewer'));
  });

  it('retains separate per-floor, total, unit and development statements', () => {
    const handoff = produce(records);
    const scope = handoff.context_facts.find((c) => c.field === 'parking_scope');
    assert.deepEqual(new Set(scope.claims.map((c) => c.scope)), new Set(['per_floor','unit_total']));
    const ensuite = handoff.context_facts.find((c) => c.field === 'en_suite_bathroom');
    assert.deepEqual(new Set(ensuite.claims.map((c) => c.scope)), new Set(['development','unit']));
    const lowerGround = handoff.context_facts.find((c) => c.field === 'lower_ground_floor_area');
    assert.deepEqual(new Set(lowerGround.claims.map((c) => c.area_basis)), new Set([null,'net']));
    assert.ok(!handoff.accepted_facts.some((f) => ['parking_scope', 'en_suite_bathroom', 'lower_ground_floor_area'].includes(f.field)));
  });

  it('normalises accepted survey areas while preserving source value, unit and net/gross basis', () => {
    const approved = records.map((r) => ['kelso-net','kelso-gross'].includes(r.case_id)
      ? applyOverride(r, { action: 'accept', accepted_by: 'Test Reviewer', accepted_at: time, note: 'Survey takes precedence.' })
      : r);
    const handoff = produce(approved);
    assert.equal(handoff.accepted_facts.length, 2);
    const net = handoff.accepted_facts.find((f) => f.field === 'net_floor_area');
    const gross = handoff.accepted_facts.find((f) => f.field === 'gross_floor_area');
    assert.deepEqual([net.value, net.unit, net.area_basis], [1912, 'sqft', 'net']);
    assert.deepEqual([gross.value, gross.unit, gross.area_basis], [2672, 'sqft', 'gross']);
    assert.ok(Math.abs(net.area_converted.sqm - 177.63) < 0.01);
    assert.ok(Math.abs(gross.area_converted.sqm - 248.24) < 0.01);
  });

  it('manual corrections never pretend to be a source document quotation', () => {
    const original = get('kelso-price');
    const updated = applyOverride(original, { action: 'edit', accepted_by: 'Test Reviewer',
      accepted_at: time, value: 599000, unit: 'GBP', note: 'Hypothetical manual correction for contract tests.' });
    const handoff = produce(records.map((r) => r === original ? updated : r));
    const price = handoff.accepted_facts[0];
    assert.equal(price.value, 599000);
    assert.equal(price.source_document_id, null);
    assert.equal(price.source_evidence_id, null);
    assert.equal(price.related_evidence_ids.length, 2);
    assert.equal(price.decision.action, 'edit');
  });

  it('exports stable IDs and identical records when the same review version is exported twice', () => {
    const reviewed = applyOverride(get('kelso-price'), { action: 'accept', accepted_by:'Test',
      accepted_at:time, note:'Reviewed' });
    const list = records.map((r) => r.case_id === 'kelso-price' ? reviewed : r);
    assert.deepEqual(produce(list), produce(list));
  });
});
