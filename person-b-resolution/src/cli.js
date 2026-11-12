#!/usr/bin/env node
/**
 * CLI: node src/cli.js [input.json|zip|csv ...] [-o out.json] [--rules config/field_rules.json]
 *
 * Reads Person A extracted facts and/or multi-document archives, writes a
 * verified record (+ accepted_facts / blocked_facts) to stdout or -o.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFacts, resolveAll, buildVerifiedRecord, mergeRules, DECISION_ORDER_TEXT } from './resolve.js';
import { ingestFiles, mergeFactSets, detectKind } from './ingest.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function usage(code = 0) {
  const text = `Usage: node src/cli.js [input ...] [options]

  Accepts one or more inputs: .json (Person A facts), .zip (nested docs),
  .csv/.tsv (listing rows), .pdf (evidence library only), .txt

  -o, --output FILE     Write JSON to FILE instead of stdout
  --rules FILE          Field-rule config (default: config/field_rules.json)
  --as-of YYYY-MM-DD    As-of date for staleness (default: today)
  --summary             Also print a human-readable summary to stderr
  -h, --help            Show this help
  --decision-order      Print the classification decision order and exit

Examples:
  node src/cli.js data/kelso_villa.example.json > resolved.json
  node src/cli.js person-a.json brochures.zip listings.csv -o verified.json --summary
`;
  process.stderr.write(text);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { inputs: [], output: null, rules: null, asOf: null, summary: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '-h' || a === '--help') usage(0);
    else if (a === '--decision-order') {
      process.stdout.write(DECISION_ORDER_TEXT + '\n');
      process.exit(0);
    } else if (a === '--summary') args.summary = true;
    else if (a === '-o' || a === '--output') args.output = rest[++i];
    else if (a === '--rules') args.rules = rest[++i];
    else if (a === '--as-of') args.asOf = rest[++i];
    else if (a.startsWith('-')) {
      process.stderr.write(`Unknown option: ${a}\n`);
      usage(1);
    } else args.inputs.push(a);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const inputs = args.inputs.length
    ? args.inputs.map((p) => resolve(p))
    : [resolve(root, 'data/kelso_villa.example.json')];

  for (const p of inputs) {
    if (!existsSync(p)) {
      process.stderr.write(`Input not found: ${p}\n`);
      process.exit(1);
    }
  }

  let rules;
  const rulesPath = args.rules || resolve(root, 'config/field_rules.json');
  if (existsSync(rulesPath)) {
    try {
      rules = mergeRules(JSON.parse(readFileSync(rulesPath, 'utf8')));
    } catch (err) {
      process.stderr.write(`Could not read rules file ${rulesPath}: ${err.message}\nUsing built-in defaults.\n`);
      rules = mergeRules();
    }
  } else {
    rules = mergeRules();
  }

  const fileDescriptors = inputs.map((p) => {
    const buf = readFileSync(p);
    const name = basename(p);
    return {
      name,
      bytes: new Uint8Array(buf),
      mime: mimeFor(name),
      kind: detectKind(name, '', buf),
    };
  });

  const ingested = await ingestFiles(fileDescriptors, { keepBytes: false });
  let facts = ingested.facts;
  // Pure JSON path still works if ingest returned facts; also accept raw loadFacts for envelopes
  if (!facts.length && fileDescriptors.length === 1 && fileDescriptors[0].kind === 'json') {
    facts = loadFacts(JSON.parse(readFileSync(inputs[0], 'utf8')));
  }
  facts = mergeFactSets(facts);

  if (!facts.length) {
    process.stderr.write(
      `No extracted facts found in: ${inputs.join(', ')}\n` +
        `PDFs alone are stored as evidence; include Person A JSON or CSV rows.\n` +
        (ingested.warnings.length ? ingested.warnings.join('\n') + '\n' : '')
    );
    process.exit(1);
  }

  const { records } = resolveAll(facts, { rules, asOf: args.asOf });
  const verified = buildVerifiedRecord(records, {
    rules,
    input_label: inputs.map((p) => basename(p)).join(' + '),
    generated_by: 'verified-fact-record CLI',
  });
  verified.documents = ingested.documents.map((d) => ({
    doc_id: d.doc_id,
    name: d.name,
    kind: d.kind,
    doc_type: d.doc_type,
    title: d.title,
    published_date: d.published_date,
    issuer: d.issuer,
    property_ids: d.property_ids,
    parent_archive: d.parent_archive,
    note: d.note,
  }));
  verified.ingest_warnings = ingested.warnings;
  verified.document_groups = ingested.groups.map((g) => ({
    property_id: g.property_id,
    property_name: g.property_name,
    document_count: g.document_count,
    families: g.families.map((f) => ({
      family_id: f.family_id,
      label: f.label,
      doc_type: f.doc_type,
      issuer: f.issuer,
      version_timeline: f.version_timeline,
    })),
  }));

  const json = JSON.stringify(verified, null, 2) + '\n';
  if (args.output) writeFileSync(resolve(args.output), json, 'utf8');
  else process.stdout.write(json);

  if (args.summary || args.output) {
    const out = process.stderr;
    out.write(`Loaded ${facts.length} facts from ${inputs.length} input(s); ${ingested.documents.length} document(s).\n`);
    out.write(
      `Resolved ${records.length} field(s) across ${verified.properties.length} propert${verified.properties.length === 1 ? 'y' : 'ies'}.\n`
    );
    out.write(
      `Accepted ${verified.accepted_facts.length}; blocked/pending ${verified.blocked_facts.length}.\n\n`
    );
    for (const p of verified.properties) {
      out.write(`${p.property_name || p.property_id}\n`);
      for (const f of p.fields) {
        out.write(
          `  ${f.field.padEnd(20)} ${String(f.primary_classification).padEnd(32)} ` +
            `${f.winning_display.padEnd(28)} ${f.status}\n`
        );
      }
      out.write('\n');
    }
    for (const w of ingested.warnings) out.write(`warn: ${w}\n`);
  }
}

function mimeFor(name) {
  const ext = extname(name).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.zip') return 'application/zip';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.tsv') return 'text/tab-separated-values';
  if (ext === '.txt' || ext === '.md') return 'text/plain';
  return 'application/octet-stream';
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + '\n');
  process.exit(1);
});
