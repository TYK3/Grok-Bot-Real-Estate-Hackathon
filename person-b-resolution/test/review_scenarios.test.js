import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { ingestJson } from '../src/ingest.js';
import { resolveAll, applyOverride, buildVerifiedRecord, classifyPair } from '../src/resolve.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(resolve(root, 'data/review_scenarios.example.json'), 'utf8'));
const rules = JSON.parse(readFileSync(resolve(root, 'config/field_rules.json'), 'utf8'));
const extracted = ingestJson(fixture, 'review_scenarios.example.json').facts;
const time = '2026-11-12T21:25:00Z';
const records = resolveAll(extracted, { autoRetainContext: true, rules, now: time }).records;
const get = (caseId) => records.find((r) => r.case_id === caseId);

const expectations = [
  ['kelso-price', 'SUPERSEDED'],
  ['kelso-document-error', 'UNIT_MISMATCH'],
  ['kelso-parking-scope', 'SCOPE_DIFFERENCE'],
  ['kelso-net', 'TRUE_CONFLICT'],
  ['kelso-gross', 'TRUE_CONFLICT'],
  ['kelso-lower-ground', 'UNIT_MISMATCH'],
  ['kelso-parking-total', 'TRUE_CONFLICT'],
  ['sthuberts-price', 'SUPERSEDED'],
  ['sthuberts-ensuite', 'SCOPE_DIFFERENCE'],
];

describe('Person B review scenarios (nine user-specified differences)', () => {
  it('classifies all nine without losing property identity or duplicating the cases', () => {
    assert.equal(records.length, 9);
    for (const [caseId, classification] of expectations) {
      const record = get(caseId);
      assert.ok(record, `${caseId} missing`);
      assert.equal(record.primary_classification, classification, caseId);
      assert.ok(record.candidates.every((c) => c.quote), `${caseId}: evidence missing`);
    }
  });
  it('Kelso price: latest same-issuer brochure £600,000 is selected but human confirmation remains pending', () => {
    const r = get('kelso-price');
    assert.equal(r.winning_value, 600000);
    assert.equal(r.status, 'pending');
    assert.equal(r.voice.quotable, false);
  });
  it('Kelso April total: mismatched 185 sqm and 2,700 sqft is flagged as a document error', () => {
    const r = get('kelso-document-error');
    assert.equal(r.document_error, true);
    assert.notEqual(r.status, 'verified');
    assert.throws(() => applyOverride(r, { action: 'accept', accepted_by: 'Person B' }), /document conversion error/i);
  });
  it('Kelso parking scope: per-floor and total statements stay separate and unquotable', () => {
    const r = get('kelso-parking-scope');
    assert.equal(r.resolution_kind, 'scoped_context');
    assert.equal(r.winning_value, null);
    assert.deepEqual(new Set(r.scoped_facts.map((c) => c.scope)), new Set(['per_floor', 'unit_total']));
    assert.equal(r.voice.quotable, false);
  });
  it('Kelso net and gross area conflicts: measured survey wins on authority even below 2% numeric difference', () => {
    assert.equal(get('kelso-net').winning_value, 1912);
    assert.equal(get('kelso-gross').winning_value, 2672);
    assert.equal(get('kelso-gross').status, 'conflicting');
    assert.equal(get('kelso-net').status, 'conflicting');
    const pair = get('kelso-gross').candidates;
    assert.equal(classifyPair(pair[0], pair[1], { rules }).classification, 'TRUE_CONFLICT');
  });
  it('Kelso lower ground: unlabelled 468 sq ft cannot be equated with net 461 sq ft', () => {
    const r = get('kelso-lower-ground');
    assert.equal(r.basis_uncertain, true);
    assert.equal(r.resolution_kind, 'scoped_context');
    assert.deepEqual(new Set(r.scoped_facts.map((c) => c.area_basis)), new Set([null, 'net']));
    assert.equal(r.voice.quotable, false);
  });
  it('Kelso parking total: survey says five spaces, brochure six, requiring human sign-off', () => {
    const r = get('kelso-parking-total');
    assert.equal(r.winning_value, 5);
    assert.equal(r.primary_classification, 'TRUE_CONFLICT');
    assert.equal(r.status, 'conflicting');
  });
  it('59 St Huberts price: formal solicitor instruction effective 9 Nov overrides brochure', () => {
    const r = get('sthuberts-price');
    assert.equal(r.winning_value, 1395000);
    assert.equal(r.primary_classification, 'SUPERSEDED');
    assert.equal(r.status, 'pending');
    assert.equal(r.candidates.find((c) => c.is_winner).effective_date, '2026-11-09');
  });
  it('59 St Huberts en-suites: close-wide statement is not applied to the unit', () => {
    const r = get('sthuberts-ensuite');
    assert.equal(r.resolution_kind, 'scoped_context');
    assert.equal(r.winning_value, null);
    assert.equal(r.voice.quotable, false);
    assert.deepEqual(new Set(r.scoped_facts.map((c) => c.scope)), new Set(['development', 'unit']));
    assert.throws(() => applyOverride(r, { action: 'accept', accepted_by: 'Person B' }), /Context-only/i);
  });
  it('safe automation sends three context cases separately; six disputed cases remain blocked', () => {
    const handoff = buildVerifiedRecord(records, { now: time });
    assert.equal(handoff.accepted_facts.length, 0);
    assert.equal(handoff.blocked_facts.length, 6);
    assert.equal(handoff.context_facts.length, 3);
    assert.ok(handoff.context_facts.every((c) => c.accepted_value === null && c.status === 'context_only'));
    assert.ok(handoff.context_facts.every((c) => c.accepted_by === 'rules-engine' && c.accepted_at === time));
  });
  it('human approval records reviewer + time and publishes only the approved price', () => {
    const price = get('kelso-price');
    const approved = applyOverride(price, { action: 'accept', accepted_by: 'Person B',
      accepted_at: '2026-11-12T21:28:00Z', note: 'Checked the October version against April.' });
    const next = records.map((r) => r===price ? approved : r);
    const handoff = buildVerifiedRecord(next, { now: time });
    assert.equal(handoff.accepted_facts.length, 1);
    assert.equal(handoff.accepted_facts[0].accepted_value, 600000);
    assert.equal(handoff.accepted_facts[0].accepted_by, 'Person B');
    assert.equal(handoff.accepted_facts[0].accepted_at, '2026-11-12T21:28:00Z');
    assert.equal(handoff.blocked_facts.length, 5);
    assert.equal(handoff.context_facts.length, 3);
  });
});
