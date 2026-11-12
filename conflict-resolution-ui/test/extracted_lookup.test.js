import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { factsForUploads } from '../src/extracted_lookup.js';
import { ingestJson } from '../src/ingest.js';
import { resolveAll } from '../src/resolve.js';

const payload = JSON.parse(fs.readFileSync(new URL('../data/extracted/sample_extraction.json', import.meta.url)));

test('precomputed extraction maps onto uploaded sample PDFs by filename', () => {
  const uploads = payload.documents.map((d, i) => ({ name: d.file_name, doc_id: `upload-${i}` }));
  const { facts, matched, unmatched } = factsForUploads(payload, uploads);
  assert.equal(matched.length, 6);
  assert.equal(unmatched.length, 0);
  assert.equal(facts.length, payload.facts.length);
  assert.ok(facts.every((f) => f.source.doc_id.startsWith('upload-')));
  const { records } = resolveAll(ingestJson({ facts }, 'x').facts, { autoRetainContext: true });
  assert.ok(records.some((r) => r.status === 'conflicting'));
});

test('sha256 match wins over a renamed file; unknown PDFs get no facts', () => {
  const d = payload.documents[0];
  const r = factsForUploads(payload, [{ name: 'renamed.pdf', doc_id: 'a', sha256: d.sha256 }, { name: 'other.pdf', doc_id: 'b' }]);
  assert.deepEqual(r.matched, ['renamed.pdf']);
  assert.deepEqual(r.unmatched, ['other.pdf']);
  assert.ok(r.facts.length > 0 && r.facts.every((f) => f.source.doc_id === 'a'));
});
