/**
 * Person B -> database engineer, versioned *ingestion* contract.
 *
 * It is intentionally a projection of reconciliation records, not another
 * decision engine. Person A's extracted candidates remain immutable evidence.
 * No context-only claim or unresolved candidate is emitted as an accepted fact.
 */
import { toSqft, toSqm } from './resolve.js';

export const DATABASE_HANDOFF_VERSION = '1.0';
const AREA_FIELDS = new Set(['floor_area', 'net_floor_area', 'gross_floor_area', 'lower_ground_floor_area']);
const safeText = (value) => value == null ? null : String(value);
const keyFor = (record) => `${record.property_id}::${record.field}`;
const rounded = (number) => Math.round((number + Number.EPSILON) * 100) / 100;
const reviewerEvents = (record) => (record.audit || []).filter((event) =>
  event.accepted_by && !['engine', 'rules-engine'].includes(event.accepted_by));
const latestReviewerEvent = (record) => reviewerEvents(record).at(-1) || null;
const candidateIdentity = (candidate, record, index) => candidate.fact_id || `${keyFor(record)}::candidate-${index + 1}`;
const evidenceIds = (record) => (record.candidates || []).map((candidate, index) => candidateIdentity(candidate, record, index));

function areaValues(value, unit) {
  if (!Number.isFinite(Number(value))) return null;
  if (unit !== 'sqft' && unit !== 'sqm') return null;
  return {
    sqft: rounded(toSqft(Number(value), unit)),
    sqm: rounded(toSqm(Number(value), unit)),
  };
}

function selectedCandidate(record) {
  return (record.candidates || []).find((candidate) => candidate.fact_id === record.winning_fact_id)
    || (record.candidates || []).find((candidate) => candidate.is_winner)
    || null;
}

/**
 * Stable field/version keys support idempotent upserts on the destination side.
 * Repeated exports of the same accepted version must not create new facts.
 *
 * @param {Array} records Output of resolveAll / applyOverride.
 * @param {Object} options {generated_at?, batch_id?, documents?, input_label?, example?}
 */
export function buildDatabaseHandoff(records, options = {}) {
  if (!Array.isArray(records)) throw new TypeError('Expected reconciliation records array.');
  const timestamp = options.generated_at || new Date().toISOString();
  const evidence = new Map();
  const documents = new Map();
  const accepted = [];
  const context = [];
  const unresolved = [];
  const events = [];
  const properties = new Map();

  for (const record of records) {
    if (!record?.property_id || !record.field) throw new Error('Reconciliation record is missing property_id or field.');
    const caseKey = keyFor(record);
    const ids = evidenceIds(record);
    if (!properties.has(record.property_id)) properties.set(record.property_id, {
      property_id: record.property_id,
      property_name: record.property_name || record.property_id,
    });

    (record.candidates || []).forEach((candidate, index) => {
      const id = ids[index];
      if (evidence.has(id)) {
        const previous = evidence.get(id);
        if (previous.property_id !== record.property_id || previous.field !== record.field) {
          throw new Error(`Evidence ID ${id} is reused across different fields.`);
        }
        return;
      }
      const src = candidate.source || {};
      if (src.doc_id && !documents.has(src.doc_id)) documents.set(src.doc_id, {
        document_id: src.doc_id,
        title: src.title || src.doc_id,
        document_type: src.doc_type || null,
        issuer: src.issuer || null,
        published_date: src.published_date || null,
        date_precision: src.date_precision || null,
        synthetic: Boolean(src.synthetic),
        uri: src.url || null,
      });
      evidence.set(id, {
        evidence_id: id,
        case_key: caseKey,
        property_id: record.property_id,
        field: record.field,
        source_document_id: src.doc_id || null,
        page_number: Number.isInteger(candidate.page) ? candidate.page : null,
        quote: safeText(candidate.quote),
        quote_attribution: safeText(candidate.quote_attribution),
        extraction_confidence: candidate.extraction_confidence ?? null,
        effective_date: candidate.effective_date || null,
        claim: {
          value: candidate.value ?? null,
          unit: candidate.unit || null,
          area_basis: candidate.area_basis || null,
          scope: candidate.scope || null,
          stated_equivalent: candidate.stated_equivalent || null,
        },
      });
    });

    (record.audit || []).forEach((entry, index) => {
      events.push({
        event_id: `${caseKey}::event-${index + 1}`,
        case_key: caseKey,
        action: entry.action,
        actor: entry.accepted_by,
        occurred_at: entry.accepted_at,
        classification: entry.classification || record.primary_classification,
        selected_evidence_id: entry.candidate_doc_id || null,
        reason: entry.note || null,
        rule_applied: entry.rule_applied || record.rule_applied || null,
        decision_version: entry.version ?? null,
      });
    });

    if (record.resolution_kind === 'scoped_context') {
      context.push({
        case_key: caseKey,
        property_id: record.property_id,
        field: record.field,
        classification: record.reviewer_classification || record.primary_classification,
        resolution: 'retain_separate_claims',
        publishable_as_single_fact: false,
        claims: (record.scoped_facts?.length ? record.scoped_facts : record.candidates || []).map((claim, index) => ({
          evidence_id: candidateIdentity(claim, record, index),
          value: claim.value ?? null,
          unit: claim.unit || null,
          area_basis: claim.area_basis || null,
          scope: claim.scope || null,
        })),
        rule_applied: record.rule_applied || null,
      });
      continue;
    }

    if (record.status === 'verified' && !record.blocked) {
      const source = selectedCandidate(record);
      const reviewer = latestReviewerEvent(record);
      const version = record.version || 1;
      const changedByEdit = reviewer?.action === 'edit';
      // A manual edit is not asserted to be supported by the engine's former winner.
      const winningEvidence = changedByEdit ? null : (source?.fact_id || null);
      accepted.push({
        record_id: `${caseKey}::v${version}`,
        case_key: caseKey,
        property_id: record.property_id,
        field: record.field,
        value: record.winning_value,
        unit: record.winning_unit || null,
        area_basis: AREA_FIELDS.has(record.field) ? (
          source?.area_basis || record.area_basis || (
            record.field === 'net_floor_area' ? 'net' : record.field === 'gross_floor_area' ? 'gross' : null
          )
        ) : null,
        scope: source?.scope || null,
        area_converted: AREA_FIELDS.has(record.field) ? areaValues(record.winning_value, record.winning_unit) : null,
        currency: record.field === 'price' ? (record.winning_unit || 'GBP') : null,
        classification: record.reviewer_classification || record.primary_classification,
        source_evidence_id: winningEvidence,
        related_evidence_ids: ids,
        source_document_id: changedByEdit ? null : (source?.source?.doc_id || null),
        effective_date: changedByEdit ? null : (source?.effective_date || null),
        source_published_date: changedByEdit ? null : (source?.source?.published_date || null),
        rule_applied: record.rule_applied || null,
        decision: {
          action: reviewer?.action || 'auto_resolve',
          accepted_by: reviewer?.accepted_by || 'rules-engine',
          accepted_at: reviewer?.accepted_at || (record.audit || []).at(-1)?.accepted_at || null,
          reason: reviewer?.note || record.headline_reason || null,
          trust_level: 'browser_local_unverified',
        },
        version,
      });
      continue;
    }

    const proposed = selectedCandidate(record);
    unresolved.push({
      case_key: caseKey,
      property_id: record.property_id,
      field: record.field,
      status: record.blocked ? 'blocked' : record.status,
      classification: record.reviewer_classification || record.primary_classification,
      document_error: Boolean(record.document_error),
      proposed_value: record.winning_value ?? null,
      proposed_unit: record.winning_unit || null,
      proposed_evidence_id: proposed?.fact_id || null,
      evidence_ids: ids,
      reason: latestReviewerEvent(record)?.note || record.headline_reason || null,
      rule_applied: record.rule_applied || null,
      publishable: false,
    });
  }

  // Document-library metadata may include PDFs that do not yet have extracted facts.
  for (const d of options.documents || []) {
    if (!d.doc_id || documents.has(d.doc_id)) continue;
    documents.set(d.doc_id, {
      document_id: d.doc_id,
      title: d.title || d.name || d.doc_id,
      document_type: d.doc_type || null,
      issuer: d.issuer || null,
      published_date: d.published_date || null,
      date_precision: d.date_precision || null,
      synthetic: Boolean(d.synthetic),
      uri: d.url || null,
    });
  }

  const sample = Boolean(options.example);
  return {
    schema_version: DATABASE_HANDOFF_VERSION,
    payload_type: 'property_fact_reconciliation',
    batch_id: options.batch_id || null,
    generated_at: timestamp,
    input_label: options.input_label || null,
    example_only: sample,
    ingestion_policy: {
      accepted_facts_only_for_canonical_values: true,
      context_claims_are_not_single_valued_facts: true,
      unresolved_cases_must_not_publish: true,
      reviewer_identity: 'browser_local_unverified',
      timestamps: 'client_clock_untrusted',
    },
    counts: { accepted: accepted.length, context: context.length, unresolved: unresolved.length },
    properties: [...properties.values()].sort((a, b) => a.property_id.localeCompare(b.property_id)),
    source_documents: [...documents.values()].sort((a, b) => a.document_id.localeCompare(b.document_id)),
    extracted_evidence: [...evidence.values()].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)),
    accepted_facts: accepted.sort((a, b) => a.record_id.localeCompare(b.record_id)),
    context_facts: context.sort((a, b) => a.case_key.localeCompare(b.case_key)),
    unresolved_cases: unresolved.sort((a, b) => a.case_key.localeCompare(b.case_key)),
    audit_events: events.sort((a, b) => a.event_id.localeCompare(b.event_id)),
  };
}
