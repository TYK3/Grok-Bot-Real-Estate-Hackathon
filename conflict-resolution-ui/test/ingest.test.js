import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import {
  ingestJson,
  ingestCsv,
  ingestText,
  ingestFiles,
  organiseDocuments,
  detectKind,
  mergeFactSets,
  mergeDocumentSets,
} from '../src/ingest.js';
import { resolveAll, applyOverride, buildAcceptanceRecords, CLASSIFICATIONS, STATUSES } from '../src/resolve.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kelso = JSON.parse(readFileSync(resolve(root, 'data/kelso_villa.example.json'), 'utf8'));

describe('multi-document ingest', () => {
  it('detects kinds from name and magic bytes', () => {
    assert.equal(detectKind('facts.json'), 'json');
    assert.equal(detectKind('brochure.PDF'), 'pdf');
    assert.equal(detectKind('pack.zip'), 'zip');
    assert.equal(detectKind('rows.csv'), 'csv');
    const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    assert.equal(detectKind('unknown.bin', '', pdfMagic), 'pdf');
  });

  it('ingests Person A JSON and builds a virtual document library', () => {
    const { facts, documents, warnings } = ingestJson(kelso, 'kelso.json');
    assert.equal(facts.length, kelso.facts.length);
    assert.ok(documents.some((d) => d.doc_id === '20020159'));
    assert.ok(documents.some((d) => d.doc_id === '20018480'));
    assert.equal(warnings.length, 0);
  });

  it('ingests CSV listing rows into facts', () => {
    const csv = readFileSync(resolve(root, 'data/listings.sample.csv'), 'utf8');
    const { facts, documents } = ingestCsv(csv, 'listings.sample.csv');
    assert.equal(facts.length, 4);
    assert.ok(facts.some((f) => f.field === 'tenure' && String(f.value).toLowerCase() === 'leasehold'));
    assert.equal(documents[0].kind, 'csv');
  });

  it('parses key:value text evidence', () => {
    const { facts } = ingestText('price: £600,000\ntenure: freehold\n', 'note.txt', {
      property_id: 'kelso-villa',
    });
    assert.equal(facts.length, 2);
    assert.equal(facts[0].field, 'price');
  });

  it('organises related Carter Jonas brochure versions into one family', () => {
    const { facts, documents } = ingestJson(
      JSON.parse(readFileSync(resolve(root, 'data/kelso_villa.bundle.example.json'), 'utf8')),
      'bundle.json'
    );
    const groups = organiseDocuments(documents, facts);
    const kelsoGroup = groups.find((g) => g.property_id === 'kelso-villa');
    assert.ok(kelsoGroup);
    const brochureFamily = kelsoGroup.families.find((f) =>
      f.documents.some((d) => d.doc_id === '20018480') && f.documents.some((d) => d.doc_id === '20020159')
    );
    assert.ok(brochureFamily, 'April and October brochures should cluster');
    assert.ok(brochureFamily.version_timeline.length >= 2);
  });

  it('reads a deflate ZIP and ingests nested JSON', async () => {
    const payload = JSON.stringify({
      facts: [
        {
          property_id: 'zip-house',
          property_name: 'Zip House',
          field: 'price',
          value: 100000,
          unit: 'GBP',
          source: { doc_id: 'z1', doc_type: 'brochure', title: 'Inside ZIP', published_date: '2026-01-01' },
          quote: '£100,000',
        },
      ],
    });
    const zipBytes = buildSimpleZip('nested/facts.json', Buffer.from(payload, 'utf8'));
    const { facts, documents } = await ingestFiles([
      { name: 'pack.zip', bytes: zipBytes, mime: 'application/zip' },
    ]);
    assert.equal(facts.length, 1);
    assert.equal(facts[0].property_id, 'zip-house');
    assert.ok(documents.some((d) => d.kind === 'zip'));
    assert.ok(documents.some((d) => d.kind === 'json'));
  });

  it('accepts multiple JSON documents in one ingest batch', async () => {
    const kelsoBytes = new TextEncoder().encode(JSON.stringify(kelso));
    const edge = JSON.parse(readFileSync(resolve(root, 'data/edge_cases.example.json'), 'utf8'));
    const edgeBytes = new TextEncoder().encode(JSON.stringify(edge));
    const { facts, documents, warnings } = await ingestFiles([
      { name: 'kelso.json', bytes: kelsoBytes, mime: 'application/json' },
      { name: 'edge.json', bytes: edgeBytes, mime: 'application/json' },
    ]);
    assert.equal(warnings.length, 0);
    assert.ok(facts.length >= kelso.facts.length);
    assert.ok(documents.some((d) => /kelso/i.test(d.name || d.title || '')));
    assert.ok(documents.some((d) => /edge/i.test(d.name || d.title || '')));
    const mergedFacts = mergeFactSets([], facts);
    const mergedDocs = mergeDocumentSets([], documents);
    assert.equal(mergedFacts.length, facts.length);
    assert.equal(mergedDocs.length, documents.length);
  });
});

describe('acceptance records and escalation', () => {
  it('exports accepted facts in the downstream shape and keeps tenure blocked when escalated', () => {
    const { records } = resolveAll(kelso, { now: '2026-11-12T20:20:00.000Z', asOf: '2026-11-12' });
    const price = records.find((r) => r.field === 'price');
    const tenure = records.find((r) => r.field === 'tenure');
    assert.equal(price.primary_classification, CLASSIFICATIONS.SUPERSEDED);
    assert.equal(tenure.primary_classification, CLASSIFICATIONS.TRUE_CONFLICT);

    const acceptedPrice = applyOverride(price, {
      action: 'accept',
      accepted_by: 'jigar',
      accepted_at: '2026-11-12T21:00:00.000Z',
      classification: CLASSIFICATIONS.SUPERSEDED,
      note: 'October brochure supersedes April; listings are stale.',
    });
    const blockedTenure = applyOverride(tenure, {
      action: 'escalate',
      accepted_by: 'jigar',
      accepted_at: '2026-11-12T21:01:00.000Z',
      classification: CLASSIFICATIONS.TRUE_CONFLICT,
      note: 'Listing rows disagree; needs official title check.',
    });

    assert.equal(acceptedPrice.status, STATUSES.VERIFIED);
    assert.equal(blockedTenure.status, STATUSES.CONFLICTING);
    assert.equal(blockedTenure.blocked, true);

    const pack = buildAcceptanceRecords(
      records.map((r) => (r.field === 'price' ? acceptedPrice : r.field === 'tenure' ? blockedTenure : r))
    );
    assert.ok(pack.accepted.some((a) => a.field === 'price' && a.status === 'accepted'));
    const priceRow = pack.accepted.find((a) => a.field === 'price');
    assert.equal(priceRow.accepted_by, 'jigar');
    assert.ok(Array.isArray(priceRow.source_evidence_ids));
    assert.ok(priceRow.version >= 1);
    assert.ok(pack.blocked.some((b) => b.field === 'tenure'));
  });
});

/** Minimal ZIP writer for tests (single deflated entry). */
function buildSimpleZip(name, dataBuf) {
  const nameBuf = Buffer.from(name, 'utf8');
  const comp = deflateRawSync(dataBuf);
  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(0, 14); // crc skipped for test reader that trusts CD sizes
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(dataBuf.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  nameBuf.copy(local, 30);

  const cd = Buffer.alloc(46 + nameBuf.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt16LE(0, 14);
  cd.writeUInt32LE(0, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(dataBuf.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(0, 42); // local header offset
  nameBuf.copy(cd, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(local.length + comp.length, 16);
  eocd.writeUInt16LE(0, 20);

  return new Uint8Array(Buffer.concat([local, comp, cd, eocd]));
}
