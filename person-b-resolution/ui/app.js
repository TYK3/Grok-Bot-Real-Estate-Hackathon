/**
 * Fact Reconciliation Workbench (Person B).
 * Evidence-first three-panel UI over the shared resolve + ingest engines.
 */
import {
  loadFacts,
  resolveAll,
  applyOverride,
  buildVerifiedRecord,
  buildAcceptanceRecords,
  highlightSpans,
  fieldLabel,
  displayValue,
  factDate,
  REVIEW_CLASSIFICATIONS,
  CLASSIFICATIONS,
} from '../src/resolve.js';
import {
  ingestFiles,
  ingestJson,
  mergeFactSets,
  mergeDocumentSets,
  organiseDocuments,
} from '../src/ingest.js';

const STATE_KEY = 'vfr-workbench-v2';
const DEFAULT_DATA = 'data/kelso_villa.example.json';

const CLASS_META = {
  AGREE: { short: 'Agree', plain: 'Sources report the same value.' },
  WINNER: { short: 'Selected', plain: 'Value selected as candidate or signed-off fact.' },
  TRUE_CONFLICT: {
    short: 'True conflict',
    plain: 'Same unit, field and basis; values that cannot both be right. Human sign-off or escalation required.',
  },
  SUPERSEDED: {
    short: 'Newer version',
    plain: 'A later document of the same type from the same issuer replaces an earlier one. Recency is a within-tier tie-breaker.',
  },
  UNIT_MISMATCH: {
    short: 'Unit / net–gross',
    plain: 'Different units or net vs gross basis — or a wrong conversion. Preserve originals; not necessarily a conflict.',
  },
  STALE_LISTING: {
    short: 'Out-of-date listing',
    plain: 'Portal/CRM row not updated after a higher-tier document. Flag for update.',
  },
  OFFICIAL_RECORD_DISAGREEMENT: {
    short: 'Official-record',
    plain: "Marketing disagrees with Land Registry or EPC. Mark 'check this'; do not auto-correct.",
  },
  SCOPE_DIFFERENCE: { short: 'Scope', plain: 'Development-wide claim vs per-unit fact.' },
  PLOT_OR_TYPE: { short: 'Plot / type', plain: 'Different plots or house types — never merge.' },
  UNMATCHED: { short: 'Unmatched', plain: 'Entity resolution not confident — hold unmatched.' },
};

const STATUS_LABEL = {
  verified: 'Verified',
  pending: 'Pending',
  conflicting: 'Conflicting',
  unknown: 'Unknown',
};

const CLASS_ICONS = {
  TRUE_CONFLICT: '!',
  SUPERSEDED: 'N',
  UNIT_MISMATCH: 'U',
  STALE_LISTING: 'S',
  OFFICIAL_RECORD_DISAGREEMENT: 'O',
};

const $ = (id) => document.getElementById(id);

const state = {
  reviewer: '',
  facts: [],
  records: [],
  documents: [],
  groups: [],
  rules: null,
  inputLabel: '',
  rawFingerprint: '',
  propertyId: null,
  stage: 'review',
  isExample: false,
  dataUrl: null,
  selectedKey: null,
  selectedClassification: null,
  selectedCandidateId: null,
  reason: '',
  evidenceOrder: ['a', 'b'],
  focusedDocId: null,
  editingKey: null,
  warnings: [],
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function fingerprint(facts) {
  try {
    return JSON.stringify(
      facts.map((f) => [f.property_id, f.field, f.value, f.unit, f.source && f.source.doc_id])
    );
  } catch {
    return String(facts.length);
  }
}

function persist() {
  try {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        reviewer: state.reviewer,
        records: state.records,
        fingerprint: state.rawFingerprint,
        inputLabel: state.inputLabel,
        propertyId: state.propertyId,
        stage: state.stage,
        isExample: state.isExample,
        dataUrl: state.dataUrl,
        selectedKey: state.selectedKey,
      })
    );
  } catch (err) {
    console.warn('Could not persist review state', err);
  }
}

function restoreIfMatching(fp) {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.reviewer) state.reviewer = saved.reviewer;
    if (saved.fingerprint === fp && Array.isArray(saved.records) && saved.records.length) return saved;
    return { reviewer: saved.reviewer };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Data loading / ingest
// ---------------------------------------------------------------------------

function ingestPayload(payload, label, { example = false, dataUrl = null, documents = [], warnings = [] } = {}) {
  const facts = Array.isArray(payload) || (payload && payload.facts) ? loadFacts(payload) : loadFacts({ facts: payload });
  if (!facts.length && !documents.length) {
    throw new Error('No facts or documents found. Expected JSON facts, or PDF/ZIP/CSV evidence.');
  }
  applyDataset(facts, {
    label: label || payload.label || 'uploaded',
    example: example || Boolean(payload && payload.example),
    dataUrl,
    documents,
    warnings,
  });
}

function applyDataset(facts, { label, example = false, dataUrl = null, documents = [], warnings = [] } = {}) {
  const { records, rules } = resolveAll(facts);
  const fp = fingerprint(facts);
  const saved = restoreIfMatching(fp);
  state.facts = facts;
  state.rules = rules;
  state.rawFingerprint = fp;
  state.inputLabel = label || 'uploaded';
  state.isExample = Boolean(example);
  state.dataUrl = dataUrl;
  state.warnings = warnings || [];
  state.documents = documents.length
    ? documents
    : ingestJson(
        { facts, label, example, documents: [] },
        label || 'facts.json'
      ).documents;
  state.groups = organiseDocuments(state.documents, facts);

  if (saved && saved.records) {
    state.records = saved.records;
    state.propertyId = saved.propertyId || records[0]?.property_id || null;
    state.stage = saved.stage || 'review';
    state.selectedKey = saved.selectedKey || null;
  } else {
    state.records = records;
    const props = properties();
    state.propertyId = props[0]?.id || null;
    state.stage = 'review';
    state.selectedKey = null;
  }
  if (saved?.reviewer) state.reviewer = saved.reviewer;

  ensureSelection();
  persist();
  render();
  flashIngest(state.warnings);
}

async function loadFromUrl(url, { example = /example\.json$/.test(url) } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  const payload = await res.json();
  const bundledDocs = Array.isArray(payload.documents) ? payload.documents : [];
  const { documents, facts, warnings } = ingestJson(payload, url);
  applyDataset(facts.length ? facts : loadFacts(payload), {
    label: payload.label || url,
    example,
    dataUrl: url,
    documents: mergeDocumentSets(documents, bundledDocs.map((d) => ({ ...d, name: d.name || d.title }))),
    warnings,
  });
}

async function ingestUserFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;

  // Create object URLs for PDFs so the evidence pane can render them
  const prepared = [];
  for (const f of files) {
    const objectUrl = /\.pdf$/i.test(f.name) || f.type === 'application/pdf' ? URL.createObjectURL(f) : null;
    prepared.push({
      name: f.name,
      mime: f.type,
      bytes: new Uint8Array(await f.arrayBuffer()),
      objectUrl,
    });
  }

  const result = await ingestFiles(prepared, { keepBytes: false });
  const facts = mergeFactSets(state.facts, result.facts);
  const documents = mergeDocumentSets(state.documents, result.documents);

  if (!facts.length && result.facts.length === 0 && state.facts.length === 0) {
    // Evidence-only upload: keep existing facts if any, else show docs
    if (!state.facts.length) {
      state.documents = documents;
      state.groups = organiseDocuments(documents, []);
      state.warnings = result.warnings;
      state.inputLabel = files.map((f) => f.name).join(', ');
      state.isExample = false;
      flashIngest([
        ...result.warnings,
        'Evidence stored in the source library. Load Person A JSON (or a ZIP that includes it) to reconcile fields.',
      ]);
      render();
      return;
    }
  }

  applyDataset(facts.length ? facts : state.facts, {
    label: [...new Set([state.inputLabel, ...files.map((f) => f.name)].filter(Boolean))].join(' + '),
    example: false,
    dataUrl: null,
    documents,
    warnings: result.warnings,
  });
}

function flashIngest(warnings) {
  const el = $('ingest-banner');
  if (!warnings || !warnings.length) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = warnings.join(' · ');
}

function properties() {
  const map = new Map();
  for (const r of state.records) {
    if (!map.has(r.property_id)) {
      map.set(r.property_id, { id: r.property_id, name: r.property_name || r.property_id });
    }
  }
  return [...map.values()];
}

function needsHuman(rec) {
  return rec.status === 'pending' || rec.status === 'conflicting' || rec.status === 'unknown';
}

function recordKey(r) {
  return `${r.property_id}::${r.field}`;
}

function recordsForView() {
  let list = state.records.filter((r) => r.property_id === state.propertyId);
  if (state.stage === 'review') list = list.filter((r) => needsHuman(r));
  else if (state.stage === 'verified') list = list.filter((r) => r.status === 'verified');
  else if (state.stage === 'extracted') list = list.filter((r) => r.status !== 'verified');
  else if (state.stage === 'reconcile') {
    list = list.filter((r) => r.primary_classification && r.primary_classification !== CLASSIFICATIONS.AGREE);
  }
  return list;
}

function ensureSelection() {
  const list = recordsForView();
  if (!list.length) {
    state.selectedKey = null;
    return;
  }
  if (!state.selectedKey || !list.some((r) => recordKey(r) === state.selectedKey)) {
    selectRecord(list[0]);
  } else {
    const rec = list.find((r) => recordKey(r) === state.selectedKey);
    syncSelectionFromRecord(rec);
  }
}

function selectRecord(rec) {
  if (!rec) {
    state.selectedKey = null;
    return;
  }
  state.selectedKey = recordKey(rec);
  syncSelectionFromRecord(rec);
  persist();
  render();
}

function syncSelectionFromRecord(rec) {
  if (!rec) return;
  state.selectedClassification = rec.reviewer_classification || rec.primary_classification;
  const winner = rec.candidates.find((c) => c.is_winner) || rec.candidates[0];
  state.selectedCandidateId = winner ? winner.fact_id || winner.source?.doc_id : null;
  const last = [...(rec.audit || [])].reverse().find((a) => a.accepted_by !== 'engine');
  state.reason = last?.note || '';
}

function selectedRecord() {
  return state.records.find((r) => recordKey(r) === state.selectedKey) || null;
}

function replaceRecord(next) {
  state.records = state.records.map((r) => (recordKey(r) === recordKey(next) ? next : r));
  syncSelectionFromRecord(next);
  persist();
  render();
}

function requireReviewer() {
  const name = (state.reviewer || '').trim();
  if (!name) {
    $('reviewer').focus();
    throw new Error('Enter your name in the Reviewer field before recording a decision.');
  }
  return name;
}

function flashError(msg) {
  const el = $('error-banner');
  el.hidden = !msg;
  el.textContent = msg || '';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(classification) {
  const meta = CLASS_META[classification] || { short: classification };
  return `<span class="badge ${classification}">${esc(meta.short)}</span>`;
}

function statusBadge(status) {
  const kind =
    status === 'conflicting'
      ? 'status-needs'
      : status === 'pending'
        ? 'status-pending'
        : status === 'unknown'
          ? 'status-unknown'
          : 'status-auto';
  return `<span class="badge ${kind}">${esc(STATUS_LABEL[status] || status)}</span>`;
}

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return (
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso)) + ' (London)'
    );
  } catch {
    return iso;
  }
}

function primaryReason(rec) {
  if (rec.headline_reason) return rec.headline_reason;
  const cand =
    rec.candidates.find((c) => !c.is_winner && c.classification === rec.primary_classification) ||
    rec.candidates.find((c) => !c.is_winner);
  return (cand && cand.reason) || rec.rule_applied;
}

function findDocumentForCandidate(cand) {
  if (!cand) return null;
  const docId = cand.source?.doc_id;
  if (!docId) return null;
  return (
    state.documents.find((d) => d.doc_id === docId && d.object_url) ||
    state.documents.find((d) => d.doc_id === docId) ||
    null
  );
}

function highlightedQuote(candidate) {
  const quote = candidate.quote;
  if (!quote) return '<p class="quote-block muted">No quote provided for this extraction.</p>';
  const spans = highlightSpans(quote, candidate);
  if (!spans.length) return `<p class="quote-block">${esc(quote)}</p>`;
  let html = '';
  let i = 0;
  for (const s of spans) {
    html += esc(quote.slice(i, s.start));
    html += `<mark>${esc(quote.slice(s.start, s.end))}</mark>`;
    i = s.end;
  }
  html += esc(quote.slice(i));
  return `<p class="quote-block">${html}</p>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function decisionPayload(rec, action) {
  const note = (state.reason || '').trim();
  const payload = {
    action,
    accepted_by: requireReviewer(),
    classification: state.selectedClassification || rec.primary_classification,
    note: note || undefined,
  };
  if (state.selectedCandidateId) payload.candidate_doc_id = state.selectedCandidateId;
  if (action === 'choose_candidate' && state.selectedCandidateId) {
    payload.action = 'choose_candidate';
    payload.candidate_doc_id = state.selectedCandidateId;
    if (!payload.note) {
      const cand = rec.candidates.find(
        (c) => c.fact_id === state.selectedCandidateId || c.source?.doc_id === state.selectedCandidateId
      );
      payload.note = `Chose ${displayValue(cand || {})} — ${(CLASS_META[payload.classification] || {}).short || payload.classification}.`;
    }
  }
  if (action === 'accept' && state.selectedCandidateId) {
    const winner = rec.candidates.find((c) => c.is_winner);
    const chosen = rec.candidates.find(
      (c) => c.fact_id === state.selectedCandidateId || c.source?.doc_id === state.selectedCandidateId
    );
    if (chosen && winner && chosen.fact_id !== winner.fact_id) {
      payload.action = 'choose_candidate';
      payload.candidate_doc_id = state.selectedCandidateId;
    }
  }
  return payload;
}

function onApprove() {
  const rec = selectedRecord();
  if (!rec) return;
  try {
    if (!state.selectedClassification) throw new Error('Choose a difference classification.');
    if (!state.reason.trim() && needsHuman(rec)) {
      throw new Error('Add a short reason before approving — every verified fact needs an explanation.');
    }
    const payload = decisionPayload(rec, 'accept');
    const next = applyOverride(rec, payload);
    flashError('');
    replaceRecord(next);
    advanceQueue();
  } catch (err) {
    flashError(err.message);
  }
}

function onEscalate() {
  const rec = selectedRecord();
  if (!rec) return;
  try {
    if (!state.reason.trim()) throw new Error('Explain why this field is blocked before escalating.');
    const next = applyOverride(rec, {
      action: 'escalate',
      accepted_by: requireReviewer(),
      classification: state.selectedClassification || rec.primary_classification,
      note: state.reason.trim(),
      candidate_doc_id: state.selectedCandidateId,
    });
    flashError('');
    replaceRecord(next);
    advanceQueue();
  } catch (err) {
    flashError(err.message);
  }
}

function advanceQueue() {
  const list = recordsForView();
  const idx = list.findIndex((r) => recordKey(r) === state.selectedKey);
  const next = list[idx + 1] || list[0] || null;
  if (next && recordKey(next) !== state.selectedKey) selectRecord(next);
  else ensureSelection();
}

function openEdit() {
  const rec = selectedRecord();
  if (!rec) return;
  try {
    requireReviewer();
  } catch (err) {
    flashError(err.message);
    return;
  }
  flashError('');
  state.editingKey = recordKey(rec);
  $('edit-field-label').textContent = `${fieldLabel(rec.field, state.rules)} — current ${rec.winning_display}`;
  $('edit-value').value = rec.winning_value == null ? '' : String(rec.winning_value);
  $('edit-unit').value = rec.winning_unit || '';
  $('edit-note').value = state.reason || '';
  $('edit-error').hidden = true;
  $('edit-dialog').showModal();
  $('edit-value').focus();
}

function submitEdit(event) {
  event.preventDefault();
  const rec = state.records.find((r) => recordKey(r) === state.editingKey);
  if (!rec) return;
  try {
    const next = applyOverride(rec, {
      action: 'edit',
      accepted_by: requireReviewer(),
      value: $('edit-value').value,
      unit: $('edit-unit').value.trim() || null,
      note: $('edit-note').value,
      classification: state.selectedClassification || rec.primary_classification,
    });
    $('edit-dialog').close();
    replaceRecord(next);
    advanceQueue();
  } catch (err) {
    $('edit-error').hidden = false;
    $('edit-error').textContent = err.message;
  }
}

function exportRecord() {
  const doc = buildVerifiedRecord(state.records, {
    rules: state.rules,
    generated_by: state.reviewer ? `${state.reviewer} (workbench)` : 'fact-reconciliation-workbench',
    input_label: state.inputLabel,
    reviewer: state.reviewer || null,
  });
  downloadJson(doc, `${slugFile(state.propertyId || 'verified-record')}-verified-record.json`);
}

function exportBlocked() {
  const pack = buildAcceptanceRecords(state.records, {
    generated_by: state.reviewer ? `${state.reviewer} (workbench)` : 'fact-reconciliation-workbench',
    input_label: state.inputLabel,
  });
  downloadJson(
    { ...pack, accepted: undefined, exception_queue: pack.blocked },
    `${slugFile(state.propertyId || 'exceptions')}-blocked-facts.json`
  );
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function slugFile(s) {
  return String(s).replace(/[^\w.-]+/g, '-');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSummary() {
  const all = state.records.filter((r) => r.property_id === state.propertyId);
  const counts = {};
  let pending = 0;
  let conflicting = 0;
  let verified = 0;
  let unknown = 0;
  let quotable = 0;
  for (const r of all) {
    counts[r.primary_classification] = (counts[r.primary_classification] || 0) + 1;
    if (r.status === 'pending') pending += 1;
    else if (r.status === 'conflicting') conflicting += 1;
    else if (r.status === 'unknown') unknown += 1;
    else verified += 1;
    if (r.voice?.quotable) quotable += 1;
  }
  const pills = [
    `<div class="pill"><span>Fields</span><strong>${all.length}</strong></div>`,
    `<div class="pill needs"><span>Conflicting</span><strong>${conflicting}</strong></div>`,
    `<div class="pill c-SUPERSEDED"><span>Pending</span><strong>${pending}</strong></div>`,
    `<div class="pill c-AGREE"><span>Verified</span><strong>${verified}</strong></div>`,
    `<div class="pill"><span>Docs</span><strong>${state.documents.length}</strong></div>`,
    `<div class="pill c-AGREE"><span>Voice quotable</span><strong>${quotable}</strong></div>`,
  ];
  for (const key of [
    'TRUE_CONFLICT',
    'OFFICIAL_RECORD_DISAGREEMENT',
    'UNIT_MISMATCH',
    'SUPERSEDED',
    'STALE_LISTING',
    'UNMATCHED',
    'AGREE',
  ]) {
    if (!counts[key]) continue;
    pills.push(`<div class="pill c-${key}">${badge(key)}<strong>${counts[key]}</strong></div>`);
  }
  $('summary').innerHTML = pills.join('');
}

function renderLegend() {
  const items = [
    'TRUE_CONFLICT',
    'SUPERSEDED',
    'UNIT_MISMATCH',
    'STALE_LISTING',
    'OFFICIAL_RECORD_DISAGREEMENT',
    'SCOPE_DIFFERENCE',
    'PLOT_OR_TYPE',
    'UNMATCHED',
    'AGREE',
  ];
  $('legend').innerHTML = items
    .map((k) => `<li>${badge(k)}<span>${esc(CLASS_META[k].plain)}</span></li>`)
    .join('');
}

function renderToolbar() {
  const sel = $('property');
  const props = properties();
  sel.innerHTML = props
    .map(
      (p) =>
        `<option value="${esc(p.id)}" ${p.id === state.propertyId ? 'selected' : ''}>${esc(p.name)}</option>`
    )
    .join('');
  document.querySelectorAll('.stage').forEach((btn) => {
    btn.setAttribute('aria-selected', btn.dataset.stage === state.stage ? 'true' : 'false');
  });
  const n = state.facts.length;
  const d = state.documents.length;
  const ex = state.isExample ? ' · EXAMPLE' : '';
  $('file-meta').textContent = state.inputLabel
    ? `${state.inputLabel} · ${n} fact${n === 1 ? '' : 's'} · ${d} document${d === 1 ? '' : 's'}${ex}`
    : '';
  $('reviewer').value = state.reviewer;
  $('example-banner').hidden = !state.isExample;
  const samples = $('samples');
  if (state.dataUrl) {
    const opt = [...samples.options].find((o) => o.value === state.dataUrl);
    samples.value = opt ? state.dataUrl : '';
    if (!opt) samples.selectedIndex = -1;
  }
}

function renderQueue() {
  const list = recordsForView();
  $('queue-sub').textContent = list.length
    ? `${list.length} field${list.length === 1 ? '' : 's'} in this stage`
    : 'Nothing in this stage';
  if (!list.length) {
    $('queue').innerHTML = `<p class="muted empty-hint" style="margin:12px">No fields here. Try another stage or ingest more sources.</p>`;
    return;
  }
  $('queue').innerHTML = list
    .map((rec) => {
      const selected = recordKey(rec) === state.selectedKey;
      const tone =
        rec.status === 'conflicting'
          ? 'is-conflict'
          : rec.status === 'pending'
            ? 'is-pending'
            : rec.status === 'verified'
              ? 'is-verified'
              : 'is-unknown';
      return `
        <button type="button" class="queue-item ${tone}" role="option" aria-selected="${selected}" data-key="${esc(recordKey(rec))}">
          <div class="qi-top">
            <span class="qi-field">${esc(fieldLabel(rec.field, state.rules))}</span>
            <span>${badge(rec.primary_classification)} ${statusBadge(rec.status)}</span>
          </div>
          <p class="qi-value">${esc(rec.winning_display || '—')}</p>
          <p class="qi-reason">${esc(primaryReason(rec))}</p>
        </button>`;
    })
    .join('');
}

function renderDocLibrary() {
  const group =
    state.groups.find((g) => g.property_id === state.propertyId) ||
    state.groups.find((g) => g.property_id == null) ||
    null;
  if (!group || !group.families.length) {
    $('doc-library').innerHTML = `<p class="muted empty-hint" style="margin:8px">No documents yet. Ingest PDF, ZIP or JSON.</p>`;
    return;
  }
  $('doc-library').innerHTML = group.families
    .map((fam) => {
      const rows = fam.documents
        .map((doc) => {
          const active = state.focusedDocId === doc.doc_id;
          return `
            <button type="button" class="doc-row ${active ? 'active' : ''}" data-doc="${esc(doc.doc_id)}" data-doc-name="${esc(doc.name)}">
              <span class="doc-kind ${esc(doc.kind)}">${esc(doc.kind)}</span>
              <span>
                <div class="doc-title">${esc(doc.title || doc.name)}</div>
                <div class="doc-meta">${esc(doc.published_date || 'undated')} · ${esc((doc.doc_type || '').replace(/_/g, ' '))} · ${esc(doc.doc_id)}</div>
              </span>
            </button>`;
        })
        .join('');
      return `<div class="family"><p class="family-label">${esc(fam.label)}</p>${rows}</div>`;
    })
    .join('');
}

function evidenceCandidates(rec) {
  if (!rec) return [];
  const ranked = [...rec.candidates].sort((a, b) => Number(b.is_winner) - Number(a.is_winner));
  // Prefer two differing values for side-by-side
  const left = ranked[0];
  const right =
    ranked.find(
      (c) =>
        c !== left &&
        String(c.value).toLowerCase() !== String(left?.value).toLowerCase()
    ) || ranked[1] || null;
  return [left, right].filter(Boolean);
}

function renderEvidencePane(side, candidate, rec) {
  const meta = $(`evidence-${side}-meta`);
  const body = $(`evidence-${side}-body`);
  if (!candidate) {
    meta.innerHTML = `<div class="em-title">No source</div>`;
    body.innerHTML = `<p class="muted empty-hint">Only one source available for this field.</p>`;
    return;
  }
  const src = candidate.source || {};
  const doc = findDocumentForCandidate(candidate);
  const page = candidate.page != null && candidate.page !== '' ? `page ${candidate.page}` : 'page n/a';
  const date = factDate(candidate) || 'undated';
  meta.innerHTML = `
    <div class="em-title">${esc(src.title || src.doc_id || 'Source')}</div>
    <div class="em-sub">${esc((src.doc_type || 'source').replace(/_/g, ' '))} · ${esc(date)} · ${esc(page)} · <span class="mono">${esc(src.doc_id || '')}</span></div>
    <div class="em-value">${esc(displayValue(candidate))} ${candidate.is_winner ? badge('WINNER') : badge(candidate.classification)}</div>
  `;

  const quoteHtml = `
    <div class="page-sheet">
      <p class="page-label">${esc(page)} · supporting quotation</p>
      ${highlightedQuote(candidate)}
      <p class="muted" style="margin:12px 0 0;font-size:12px">${esc(candidate.reason || '')}</p>
    </div>`;

  if (doc?.object_url && doc.kind === 'pdf') {
    body.innerHTML = `
      <div class="pdf-canvas-wrap" data-pdf-url="${esc(doc.object_url)}" data-pdf-page="${esc(candidate.page || 1)}" id="pdf-${side}"></div>
      ${quoteHtml}`;
    renderPdfInto(`pdf-${side}`, doc.object_url, Number(candidate.page) || 1);
  } else if (src.url && /\.pdf(\?|$)/i.test(src.url)) {
    body.innerHTML = `
      <p class="muted" style="margin:0 0 8px;font-size:12px">Remote PDF linked from extraction — quotation shown with highlight. Upload the file to render pages locally.</p>
      <p style="margin:0 0 10px"><a href="${esc(src.url)}" target="_blank" rel="noopener">Open source PDF</a></p>
      ${quoteHtml}`;
  } else {
    body.innerHTML = quoteHtml;
  }
}

async function renderPdfInto(elId, url, pageNum) {
  const host = document.getElementById(elId);
  if (!host) return;
  if (!window.pdfjsLib) {
    host.innerHTML = `<p class="muted" style="color:#fff;padding:16px">PDF.js not loaded — quotation is shown below.</p>`;
    return;
  }
  try {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await window.pdfjsLib.getDocument(url).promise;
    const page = await pdf.getPage(Math.min(Math.max(1, pageNum), pdf.numPages));
    const viewport = page.getViewport({ scale: 1.15 });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    host.innerHTML = '';
    host.appendChild(canvas);
    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch (err) {
    host.innerHTML = `<p class="muted" style="color:#fff;padding:16px">Could not render PDF: ${esc(err.message)}</p>`;
  }
}

function renderEvidence() {
  const rec = selectedRecord();
  const pair = evidenceCandidates(rec);
  const ordered =
    state.evidenceOrder[0] === 'a' ? [pair[0], pair[1]] : [pair[1], pair[0]];
  renderEvidencePane('a', ordered[0], rec);
  renderEvidencePane('b', ordered[1], rec);
}

function renderResolve() {
  const host = $('resolve-panel');
  const rec = selectedRecord();
  if (!rec) {
    host.innerHTML = `<p class="muted empty-hint">Pick a field from the queue.</p>`;
    return;
  }
  const engineClass = rec.primary_classification;
  const reviewClasses = REVIEW_CLASSIFICATIONS;
  const classHtml = reviewClasses
    .map((c) => {
      const pressed = state.selectedClassification === c.id;
      const recommended = engineClass === c.id;
      return `
        <button type="button" class="class-option rec-${c.id}" data-class="${c.id}" aria-pressed="${pressed}">
          <span class="co-icon" aria-hidden="true">${CLASS_ICONS[c.id] || '•'}</span>
          <span>
            <div class="co-label">${esc(c.label)}${recommended ? ' · engine suggestion' : ''}</div>
            <div class="co-sum">${esc(c.summary)}</div>
          </span>
        </button>`;
    })
    .join('');

  const picks = rec.candidates
    .map((c) => {
      const id = c.fact_id || c.source?.doc_id;
      const pressed = state.selectedCandidateId === id;
      return `
        <button type="button" class="winner-pick" data-cand="${esc(id)}" aria-pressed="${pressed}">
          <span class="wp-val">${esc(displayValue(c))}</span>
          <span class="wp-src">${esc(c.source?.title || c.source?.doc_id || 'Source')} · ${esc(factDate(c) || 'undated')}</span>
        </button>`;
    })
    .join('');

  const voice = rec.voice;
  const voiceCls = voice?.quotable ? 'ok' : 'no';
  const audit = (rec.audit || [])
    .slice(-4)
    .reverse()
    .map(
      (e) => `
      <li>
        <strong>${esc(e.accepted_by)}</strong> · ${esc(e.action.replace(/_/g, ' '))}
        <div class="when">${esc(formatWhen(e.accepted_at))}</div>
        ${e.note ? `<div>${esc(e.note)}</div>` : ''}
      </li>`
    )
    .join('');

  host.innerHTML = `
    <div class="resolve-hero">
      <h3>${esc(fieldLabel(rec.field, state.rules))}</h3>
      <p class="candidate">${esc(rec.winning_display)}</p>
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        ${badge(rec.primary_classification)} ${statusBadge(rec.status)}
        ${rec.check_this ? '<span class="badge status-needs">Check this</span>' : ''}
        ${rec.blocked ? '<span class="badge status-needs">Blocked</span>' : ''}
      </div>
      <p class="rule-chip">${esc(rec.rule_applied)} — ${esc(primaryReason(rec))}</p>
    </div>

    <section>
      <h4 style="margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">Classification</h4>
      <div class="class-grid">${classHtml}</div>
    </section>

    <section>
      <h4 style="margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">Winning source</h4>
      <div class="winner-picks">${picks}</div>
    </section>

    <section class="reason-box">
      <label>
        <span>Reason</span>
        <textarea id="reason-input" rows="3" placeholder="Explain the decision — required for approval and escalation">${esc(state.reason)}</textarea>
      </label>
    </section>

    <section class="resolve-actions">
      <button type="button" class="btn btn-accept" id="btn-approve">${rec.check_this ? 'Sign off after checking title' : 'Approve verified fact'}</button>
      <button type="button" class="btn" id="btn-edit-value">Enter corrected value…</button>
      <button type="button" class="btn btn-danger" id="btn-escalate">Escalate / keep blocked</button>
      <p class="muted" style="margin:0;font-size:12px">Acceptance records reviewer, server timestamp, classification, rule and evidence ids. Raw Person A extracts are never overwritten.</p>
    </section>

    <section class="voice-box ${voiceCls}">
      <strong>${voice?.quotable ? 'Voice agent — quotable after verification' : 'Voice agent — do not quote'}</strong>
      ${esc(voice?.speaker_note || '')}
    </section>

    <section>
      <h4 style="margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3)">Audit trail</h4>
      <ol class="audit-mini">${audit || '<li class="muted">No human decisions yet.</li>'}</ol>
    </section>
  `;

  host.querySelectorAll('[data-class]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedClassification = btn.dataset.class;
      renderResolve();
    });
  });
  host.querySelectorAll('[data-cand]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCandidateId = btn.dataset.cand;
      // Focus evidence on this candidate
      const cand = rec.candidates.find(
        (c) => c.fact_id === btn.dataset.cand || c.source?.doc_id === btn.dataset.cand
      );
      if (cand?.source?.doc_id) state.focusedDocId = cand.source.doc_id;
      renderResolve();
      renderEvidence();
      renderDocLibrary();
    });
  });
  const reason = host.querySelector('#reason-input');
  reason?.addEventListener('input', (e) => {
    state.reason = e.target.value;
  });
  host.querySelector('#btn-approve')?.addEventListener('click', onApprove);
  host.querySelector('#btn-escalate')?.addEventListener('click', onEscalate);
  host.querySelector('#btn-edit-value')?.addEventListener('click', openEdit);
}

function render() {
  renderToolbar();
  renderSummary();
  renderLegend();
  renderQueue();
  renderDocLibrary();
  renderEvidence();
  renderResolve();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function wire() {
  $('btn-ingest').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    try {
      await ingestUserFiles(files);
      flashError('');
    } catch (err) {
      flashError(`Ingest failed: ${err.message}`);
    }
    e.target.value = '';
  });
  $('btn-export').addEventListener('click', exportRecord);
  $('btn-export-blocked').addEventListener('click', exportBlocked);
  $('reviewer').addEventListener('input', (e) => {
    state.reviewer = e.target.value;
    persist();
  });
  $('property').addEventListener('change', (e) => {
    state.propertyId = e.target.value;
    state.selectedKey = null;
    ensureSelection();
    persist();
    render();
  });
  document.querySelectorAll('.stage').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.stage = btn.dataset.stage;
      ensureSelection();
      persist();
      render();
    });
  });
  $('samples').addEventListener('change', async (e) => {
    if (!e.target.value) return;
    try {
      await loadFromUrl(e.target.value, { example: true });
      flashError('');
    } catch (err) {
      flashError(err.message);
    }
  });
  $('legend-toggle').addEventListener('click', () => {
    const open = $('legend').hidden;
    $('legend').hidden = !open;
    $('legend-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  $('queue').addEventListener('click', (e) => {
    const item = e.target.closest('[data-key]');
    if (!item) return;
    const rec = state.records.find((r) => recordKey(r) === item.dataset.key);
    if (rec) selectRecord(rec);
  });
  $('doc-library').addEventListener('click', (e) => {
    const row = e.target.closest('[data-doc]');
    if (!row) return;
    state.focusedDocId = row.dataset.doc;
    const rec = selectedRecord();
    if (rec) {
      const cand = rec.candidates.find((c) => c.source?.doc_id === row.dataset.doc);
      if (cand) {
        state.selectedCandidateId = cand.fact_id || cand.source.doc_id;
      }
    }
    renderDocLibrary();
    renderEvidence();
    renderResolve();
  });
  $('btn-swap-evidence').addEventListener('click', () => {
    state.evidenceOrder = [...state.evidenceOrder].reverse();
    renderEvidence();
  });
  $('edit-form').addEventListener('submit', submitEdit);
  $('edit-cancel').addEventListener('click', () => $('edit-dialog').close());

  const overlay = $('drop-overlay');
  let dragDepth = 0;
  const isFile = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragenter', (e) => {
    if (!isFile(e)) return;
    e.preventDefault();
    dragDepth += 1;
    overlay.hidden = false;
  });
  document.addEventListener('dragover', (e) => {
    if (!isFile(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) overlay.hidden = true;
  });
  document.addEventListener('drop', async (e) => {
    if (!isFile(e)) return;
    e.preventDefault();
    dragDepth = 0;
    overlay.hidden = true;
    try {
      await ingestUserFiles(e.dataTransfer.files);
      flashError('');
    } catch (err) {
      flashError(`Ingest failed: ${err.message}`);
    }
  });
}

async function boot() {
  wire();
  renderLegend();
  const params = new URLSearchParams(location.search);
  const data = params.get('data') || DEFAULT_DATA;
  try {
    await loadFromUrl(data, { example: /example\.json$/.test(data) || params.get('data') == null });
    flashError('');
  } catch (err) {
    flashError(
      `Could not load ${data}: ${err.message}. Use Ingest files or drop PDF/JSON/ZIP. Serve via python3 -m http.server.`
    );
    render();
  }
}

boot();
