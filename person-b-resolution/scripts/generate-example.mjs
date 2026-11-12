/** Reproducible illustrative hand-off. Never represents real human approval. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveAll, applyOverride } from '../src/resolve.js';
import { buildDatabaseHandoff } from '../src/database_handoff.js';
import { ingestJson } from '../src/ingest.js';

const file = JSON.parse(readFileSync(new URL('../data/review_scenarios.example.json', import.meta.url), 'utf8'));
const rules = JSON.parse(readFileSync(new URL('../config/field_rules.json', import.meta.url), 'utf8'));
const start = '2026-11-12T20:40:00.000Z';
const items = resolveAll(ingestJson(file, 'review_scenarios.example.json').facts, {
  rules, now: start, autoRetainContext: true,
}).records;
const approvedCaseIds = ['kelso-price', 'kelso-net', 'kelso-gross', 'kelso-parking-total', 'sthuberts-price'];
const notes = {
  'kelso-price': 'ILLUSTRATIVE: October brochure supersedes the April asking price. Evidence needs genuine PDF verification.',
  'kelso-net': 'ILLUSTRATIVE: measured survey states net 1,912 sq ft and has higher authority than marketing.',
  'kelso-gross': 'ILLUSTRATIVE: measured survey states gross 2,672 sq ft and outranks the brochure.',
  'kelso-parking-total': 'ILLUSTRATIVE: five usable parking spaces; bay six described as a bin store in scenario.',
  'sthuberts-price': 'ILLUSTRATIVE: solicitor instruction sets £1,395,000 effective 9 November 2026.',
};
const approved = items.map((item) => {
  const index = approvedCaseIds.indexOf(item.case_id);
  if (index < 0) return item;
  const date = new Date(Date.parse('2026-11-12T20:50:00.000Z') + index * 60_000).toISOString();
  return applyOverride(item, {
    action: 'accept', accepted_by: 'Example Reviewer (fictional)', accepted_at: date,
    note: notes[item.case_id],
  });
});
const handoff = buildDatabaseHandoff(approved, {
  generated_at: '2026-11-12T21:00:00.000Z',
  batch_id: 'EXAMPLE-kelso-sthuberts-v1',
  input_label: file.label,
  example: true,
  documents: file.documents,
});
const path = new URL('../examples/database-handoff.example.json', import.meta.url);
writeFileSync(path, JSON.stringify(handoff, null, 2) + '\n');
console.log(`Wrote ${path.pathname}; ${handoff.counts.accepted} accepted / ${handoff.counts.context} context / ${handoff.counts.unresolved} unresolved`);
