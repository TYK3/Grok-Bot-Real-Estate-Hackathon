-- Fact record storage: document parser output + conflict-resolution decisions.
--
-- Two write paths, both called with the service-role key from the extractor
-- service (fact_record/extraction_service), never from the browser:
--   ingest_extraction(payload)    parser output: documents, extracted facts and the
--                                 contradictions the parser detected (status=open)
--   ingest_fact_handoff(payload)  workbench "database handoff" (schema 1.0) — see
--                                 conflict-resolution-ui/docs/database-handoff.md
--
-- Only property_fact_versions (via current_property_facts) holds canonical,
-- publishable single values. Everything else is evidence, context or work queue.

create table if not exists public.ingestion_batches (
  batch_id        uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('extraction', 'handoff')),
  input_label     text,
  client_batch_id text,
  generated_at    text,
  example_only    boolean not null default false,
  counts          jsonb,
  received_at     timestamptz not null default now()
);

create table if not exists public.properties (
  property_id   text primary key,
  property_name text,
  updated_at    timestamptz not null default now()
);

create table if not exists public.source_documents (
  document_id     text primary key,
  title           text,
  document_type   text,
  issuer          text,
  published_date  text,
  date_precision  text,
  synthetic       boolean not null default false,
  uri             text,
  sha256          text,
  page_count      integer,
  authority_tier  integer,
  property_ids    text[] not null default '{}',
  first_batch_id  uuid references public.ingestion_batches(batch_id),
  updated_at      timestamptz not null default now()
);

-- Raw parser output, append-only (one row per extracted claim).
create table if not exists public.extracted_facts (
  fact_id               text primary key,
  batch_id              uuid not null references public.ingestion_batches(batch_id),
  property_id           text references public.properties(property_id),
  field                 text not null,
  value                 jsonb,
  value_raw             text,
  unit                  text,
  area_basis            text,
  scope                 text,
  plot                  text,
  document_id           text references public.source_documents(document_id),
  page_number           integer,
  quote                 text,
  extraction_confidence numeric,
  qualifier             jsonb not null default '{}',
  doc_error             boolean not null default false,
  raw                   jsonb not null,
  created_at            timestamptz not null default now()
);
create index if not exists extracted_facts_property_field on public.extracted_facts (property_id, field);

-- Contradictions found by the parser (fact_record/extraction/contradictions.py).
-- Re-running extraction refreshes last_seen_*; status is owned by review.
create table if not exists public.extractor_contradictions (
  contradiction_id   text primary key,
  unit_id            text,
  field              text,
  qualifier_key      text,
  type               text not null,
  fact_ids           text[] not null default '{}',
  doc_ids            text[] not null default '{}',
  display_values     text[] not null default '{}',
  candidate_fact_id  text,
  rule_applied       text,
  requires_human     boolean not null default true,
  status             text not null default 'open',
  agent_script_state text,
  downstream_action  text,
  raw                jsonb not null,
  first_batch_id     uuid references public.ingestion_batches(batch_id),
  last_batch_id      uuid references public.ingestion_batches(batch_id),
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now()
);
create index if not exists extractor_contradictions_open on public.extractor_contradictions (status, field);

-- Workbench evidence (original claims as reviewed), append-only.
create table if not exists public.extracted_evidence (
  evidence_id           text primary key,
  case_key              text not null,
  property_id           text not null references public.properties(property_id),
  field                 text not null,
  source_document_id    text references public.source_documents(document_id),
  page_number           integer,
  quote                 text,
  quote_attribution     text,
  extraction_confidence numeric,
  effective_date        text,
  claim                 jsonb not null,
  batch_id              uuid not null references public.ingestion_batches(batch_id),
  created_at            timestamptz not null default now()
);
create index if not exists extracted_evidence_case on public.extracted_evidence (case_key);

-- Accepted facts: versioned, append-only. The only canonical-value source.
create table if not exists public.property_fact_versions (
  record_id             text primary key,
  case_key              text not null,
  property_id           text not null references public.properties(property_id),
  field                 text not null,
  value                 jsonb,
  unit                  text,
  area_basis            text,
  scope                 text,
  area_converted        jsonb,
  currency              text,
  classification        text not null,
  source_evidence_id    text references public.extracted_evidence(evidence_id),
  related_evidence_ids  text[] not null default '{}',
  source_document_id    text references public.source_documents(document_id),
  effective_date        text,
  source_published_date text,
  rule_applied          text,
  decision              jsonb not null,
  version               integer not null check (version >= 1),
  batch_id              uuid not null references public.ingestion_batches(batch_id),
  created_at            timestamptz not null default now(),
  unique (case_key, version)
);

create or replace view public.current_property_facts
with (security_invoker = true) as
select distinct on (case_key) *
from public.property_fact_versions
order by case_key, version desc;

-- Context-only claims (different scope / basis). Never collapse to one value.
create table if not exists public.scoped_claims (
  case_key       text not null,
  evidence_id    text not null,
  property_id    text not null references public.properties(property_id),
  field          text not null,
  classification text,
  value          jsonb,
  unit           text,
  area_basis     text,
  scope          text,
  rule_applied   text,
  batch_id       uuid not null references public.ingestion_batches(batch_id),
  created_at     timestamptz not null default now(),
  primary key (case_key, evidence_id)
);

-- Human-review queue. proposed_value is NEVER publishable.
create table if not exists public.reconciliation_exceptions (
  case_key             text primary key,
  property_id          text not null references public.properties(property_id),
  field                text not null,
  status               text not null check (status in ('pending', 'blocked', 'conflicting', 'unknown')),
  classification       text,
  document_error       boolean not null default false,
  proposed_value       jsonb,
  proposed_unit        text,
  proposed_evidence_id text,
  evidence_ids         text[] not null default '{}',
  reason               text,
  rule_applied         text,
  batch_id             uuid not null references public.ingestion_batches(batch_id),
  updated_at           timestamptz not null default now()
);

-- Review audit trail, append-only. actor / occurred_at are client-supplied (untrusted).
create table if not exists public.fact_review_events (
  event_id             text primary key,
  case_key             text not null,
  action               text,
  submitted_actor      text,
  submitted_at         text,
  classification       text,
  selected_evidence_id text,
  reason               text,
  rule_applied         text,
  decision_version     integer,
  batch_id             uuid not null references public.ingestion_batches(batch_id),
  received_at          timestamptz not null default now()
);

-- RLS: writes only via the service role (which bypasses RLS). Public read is
-- limited to publishable / context data; queues, raw facts and audit stay private.
alter table public.ingestion_batches         enable row level security;
alter table public.properties                enable row level security;
alter table public.source_documents          enable row level security;
alter table public.extracted_facts           enable row level security;
alter table public.extractor_contradictions  enable row level security;
alter table public.extracted_evidence        enable row level security;
alter table public.property_fact_versions    enable row level security;
alter table public.scoped_claims             enable row level security;
alter table public.reconciliation_exceptions enable row level security;
alter table public.fact_review_events        enable row level security;

drop policy if exists "public read" on public.properties;
create policy "public read" on public.properties for select to anon, authenticated using (true);
drop policy if exists "public read" on public.source_documents;
create policy "public read" on public.source_documents for select to anon, authenticated using (true);
drop policy if exists "public read" on public.property_fact_versions;
create policy "public read" on public.property_fact_versions for select to anon, authenticated using (true);
drop policy if exists "public read" on public.scoped_claims;
create policy "public read" on public.scoped_claims for select to anon, authenticated using (true);

-- Helper: jsonb array -> text[] without nulls.
create or replace function public._jtext_array(j jsonb)
returns text[] language sql immutable as $$
  select coalesce(array_agg(x), '{}')
  from jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end) x
  where x is not null and x <> ''
$$;

-- ---------------------------------------------------------------------------
-- Parser output: {label, generated_by, facts[], documents[], extractor_contradictions[]}
-- (fact_record/extraction_service/convert.py)
-- ---------------------------------------------------------------------------
create or replace function public.ingest_extraction(payload jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_batch uuid;
  n_props int; n_docs int; n_facts int; n_new_contra int; n_contra int;
  v_facts jsonb := payload->'facts';
  v_docs jsonb := coalesce(payload->'documents', '[]');
  v_contra jsonb := coalesce(payload->'extractor_contradictions', '[]');
begin
  if jsonb_typeof(v_facts) is distinct from 'array' then
    raise exception 'payload.facts must be an array';
  end if;

  insert into ingestion_batches (kind, input_label, generated_at)
  values ('extraction', payload->>'label', now()::text)
  returning batch_id into v_batch;

  insert into properties (property_id, property_name)
  select distinct on (f->>'property_id') f->>'property_id', coalesce(f->>'property_name', f->>'property_id')
  from jsonb_array_elements(v_facts) f
  where coalesce(f->>'property_id', '') <> ''
  order by f->>'property_id'
  on conflict (property_id) do update
    set property_name = coalesce(excluded.property_name, properties.property_name), updated_at = now();
  get diagnostics n_props = row_count;

  insert into source_documents (document_id, title, document_type, issuer, published_date, uri, sha256,
                                page_count, authority_tier, property_ids, first_batch_id)
  select d->>'doc_id', coalesce(d->>'title', d->>'name', d->>'doc_id'), d->>'doc_type', d->>'issuer',
         d->>'published_date', d->>'file_name', d->>'sha256', (d->>'page_count')::int,
         (d->>'authority_tier')::int, _jtext_array(d->'property_ids'), v_batch
  from jsonb_array_elements(v_docs) d
  where coalesce(d->>'doc_id', '') <> ''
  on conflict (document_id) do update set
    title          = coalesce(excluded.title, source_documents.title),
    document_type  = coalesce(excluded.document_type, source_documents.document_type),
    issuer         = coalesce(excluded.issuer, source_documents.issuer),
    published_date = coalesce(excluded.published_date, source_documents.published_date),
    uri            = coalesce(excluded.uri, source_documents.uri),
    sha256         = coalesce(excluded.sha256, source_documents.sha256),
    page_count     = coalesce(excluded.page_count, source_documents.page_count),
    authority_tier = coalesce(excluded.authority_tier, source_documents.authority_tier),
    property_ids   = array(select distinct unnest(source_documents.property_ids || excluded.property_ids)),
    updated_at     = now();
  get diagnostics n_docs = row_count;

  -- Documents referenced only from a fact's source block.
  insert into source_documents (document_id, title, document_type, issuer, published_date, synthetic, uri, first_batch_id)
  select distinct on (f->'source'->>'doc_id') f->'source'->>'doc_id',
         coalesce(f->'source'->>'title', f->'source'->>'doc_id'), f->'source'->>'doc_type',
         f->'source'->>'issuer', f->'source'->>'published_date',
         coalesce((f->'source'->>'synthetic')::boolean, false), f->'source'->>'file_name', v_batch
  from jsonb_array_elements(v_facts) f
  where coalesce(f->'source'->>'doc_id', '') <> ''
  order by f->'source'->>'doc_id'
  on conflict (document_id) do update
    set synthetic = source_documents.synthetic or excluded.synthetic;

  insert into extracted_facts (fact_id, batch_id, property_id, field, value, value_raw, unit, area_basis, scope,
                               plot, document_id, page_number, quote, extraction_confidence, qualifier, doc_error, raw)
  select f->>'fact_id', v_batch, nullif(f->>'property_id', ''), f->>'field', f->'value', f->>'value_raw',
         f->>'unit', f->>'area_basis', f->>'scope', f->>'plot', nullif(f->'source'->>'doc_id', ''),
         (f->>'page')::int, f->>'quote', (f->>'extraction_confidence')::numeric,
         coalesce(f->'qualifier', '{}'), coalesce((f->>'doc_error')::boolean, false), f
  from jsonb_array_elements(v_facts) f
  where coalesce(f->>'fact_id', '') <> '' and coalesce(f->>'field', '') <> ''
  on conflict (fact_id) do nothing;
  get diagnostics n_facts = row_count;

  select count(*) into n_new_contra
  from jsonb_array_elements(v_contra) c
  where not exists (select 1 from extractor_contradictions x where x.contradiction_id = c->>'contradiction_id');

  insert into extractor_contradictions (contradiction_id, unit_id, field, qualifier_key, type, fact_ids, doc_ids,
                                        display_values, candidate_fact_id, rule_applied, requires_human, status,
                                        agent_script_state, downstream_action, raw, first_batch_id, last_batch_id)
  select c->>'contradiction_id', c->>'unit_id', c->>'field', c->>'qualifier_key', c->>'type',
         _jtext_array(c->'fact_ids'), _jtext_array(c->'doc_ids'), _jtext_array(c->'values'),
         c->>'candidate_fact_id', c->>'rule_applied', coalesce((c->>'requires_human')::boolean, true),
         coalesce(c->>'status', 'open'), c->>'agent_script_state', c->>'downstream_action', c, v_batch, v_batch
  from jsonb_array_elements(v_contra) c
  where coalesce(c->>'contradiction_id', '') <> '' and coalesce(c->>'type', '') <> ''
  on conflict (contradiction_id) do update set
    raw = excluded.raw, last_batch_id = excluded.last_batch_id, last_seen_at = now();
  get diagnostics n_contra = row_count;

  update ingestion_batches set counts = jsonb_build_object(
    'properties', n_props, 'documents', n_docs, 'facts_inserted', n_facts,
    'contradictions_seen', n_contra, 'contradictions_new', n_new_contra)
  where batch_id = v_batch;

  return jsonb_build_object('batch_id', v_batch, 'counts', (select counts from ingestion_batches where batch_id = v_batch));
end;
$$;

-- ---------------------------------------------------------------------------
-- Workbench handoff (conflict-resolution-ui/schema/database_handoff.schema.json)
-- ---------------------------------------------------------------------------
create or replace function public.ingest_fact_handoff(payload jsonb, allow_example boolean default false)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_batch uuid;
  k text;
  e jsonb;
  c jsonb;
  ex property_fact_versions%rowtype;
  rejected jsonb := '[]';
  n_evidence int; n_events int; n_accepted int := 0; n_duplicate int := 0; n_claims int := 0; n_unresolved int;
  n_cleared int;
  accepted_keys text[] := '{}';
begin
  if payload->>'schema_version' is distinct from '1.0'
     or payload->>'payload_type' is distinct from 'property_fact_reconciliation' then
    raise exception 'unsupported payload: expected schema_version 1.0 / property_fact_reconciliation';
  end if;
  if coalesce((payload->>'example_only')::boolean, false) and not allow_example then
    raise exception 'example_only payload rejected (illustrative demo data must not be ingested)';
  end if;
  foreach k in array array['properties', 'source_documents', 'extracted_evidence', 'accepted_facts',
                           'context_facts', 'unresolved_cases', 'audit_events'] loop
    if jsonb_typeof(payload->k) is distinct from 'array' then
      raise exception 'payload.% must be an array', k;
    end if;
  end loop;

  insert into ingestion_batches (kind, input_label, client_batch_id, generated_at, example_only)
  values ('handoff', payload->>'input_label', payload->>'batch_id', payload->>'generated_at',
          coalesce((payload->>'example_only')::boolean, false))
  returning batch_id into v_batch;

  -- 1. properties, documents, immutable evidence
  insert into properties (property_id, property_name)
  select p->>'property_id', p->>'property_name' from jsonb_array_elements(payload->'properties') p
  where coalesce(p->>'property_id', '') <> ''
  on conflict (property_id) do update
    set property_name = coalesce(excluded.property_name, properties.property_name), updated_at = now();

  insert into source_documents (document_id, title, document_type, issuer, published_date, date_precision,
                                synthetic, uri, first_batch_id)
  select d->>'document_id', d->>'title', d->>'document_type', d->>'issuer', d->>'published_date',
         d->>'date_precision', coalesce((d->>'synthetic')::boolean, false), d->>'uri', v_batch
  from jsonb_array_elements(payload->'source_documents') d
  where coalesce(d->>'document_id', '') <> ''
  on conflict (document_id) do update set
    title          = coalesce(excluded.title, source_documents.title),
    document_type  = coalesce(excluded.document_type, source_documents.document_type),
    issuer         = coalesce(excluded.issuer, source_documents.issuer),
    published_date = coalesce(excluded.published_date, source_documents.published_date),
    date_precision = coalesce(excluded.date_precision, source_documents.date_precision),
    synthetic      = source_documents.synthetic or excluded.synthetic,
    uri            = coalesce(excluded.uri, source_documents.uri),
    updated_at     = now();

  insert into extracted_evidence (evidence_id, case_key, property_id, field, source_document_id, page_number, quote,
                                  quote_attribution, extraction_confidence, effective_date, claim, batch_id)
  select v->>'evidence_id', v->>'case_key', v->>'property_id', v->>'field',
         case when exists (select 1 from source_documents s where s.document_id = v->>'source_document_id')
              then v->>'source_document_id' end,
         (v->>'page_number')::int, v->>'quote', v->>'quote_attribution',
         (v->>'extraction_confidence')::numeric, v->>'effective_date', coalesce(v->'claim', '{}'), v_batch
  from jsonb_array_elements(payload->'extracted_evidence') v
  where coalesce(v->>'evidence_id', '') <> ''
  on conflict (evidence_id) do nothing;
  get diagnostics n_evidence = row_count;

  -- 2. audit trail (submitted actor/time kept as untrusted input)
  insert into fact_review_events (event_id, case_key, action, submitted_actor, submitted_at, classification,
                                  selected_evidence_id, reason, rule_applied, decision_version, batch_id)
  select a->>'event_id', a->>'case_key', a->>'action', a->>'actor', a->>'occurred_at', a->>'classification',
         a->>'selected_evidence_id', a->>'reason', a->>'rule_applied', (a->>'decision_version')::int, v_batch
  from jsonb_array_elements(payload->'audit_events') a
  where coalesce(a->>'event_id', '') <> ''
  on conflict (event_id) do nothing;
  get diagnostics n_events = row_count;

  -- 3. accepted facts: append-only, idempotent per record_id, evidence must exist
  for e in select * from jsonb_array_elements(payload->'accepted_facts') loop
    if e->>'source_evidence_id' is not null
       and not exists (select 1 from extracted_evidence where evidence_id = e->>'source_evidence_id') then
      rejected := rejected || jsonb_build_object('record_id', e->>'record_id', 'reason', 'source_evidence_id not found');
      continue;
    end if;
    select * into ex from property_fact_versions where record_id = e->>'record_id';
    if found then
      if ex.value is distinct from e->'value' or ex.unit is distinct from e->>'unit'
         or ex.source_evidence_id is distinct from e->>'source_evidence_id' then
        rejected := rejected || jsonb_build_object('record_id', e->>'record_id',
          'reason', 'record_id already stored with different content; a changed decision needs a new version');
      else
        n_duplicate := n_duplicate + 1;
        accepted_keys := accepted_keys || (e->>'case_key');
      end if;
      continue;
    end if;
    if exists (select 1 from property_fact_versions
               where case_key = e->>'case_key' and version >= (e->>'version')::int) then
      rejected := rejected || jsonb_build_object('record_id', e->>'record_id',
        'reason', 'a newer or equal version is already stored for this case');
      continue;
    end if;
    insert into property_fact_versions (record_id, case_key, property_id, field, value, unit, area_basis, scope,
      area_converted, currency, classification, source_evidence_id, related_evidence_ids, source_document_id,
      effective_date, source_published_date, rule_applied, decision, version, batch_id)
    values (e->>'record_id', e->>'case_key', e->>'property_id', e->>'field', e->'value', e->>'unit',
      e->>'area_basis', e->>'scope', nullif(e->'area_converted', 'null'::jsonb), e->>'currency',
      e->>'classification', e->>'source_evidence_id', _jtext_array(e->'related_evidence_ids'),
      case when exists (select 1 from source_documents s where s.document_id = e->>'source_document_id')
           then e->>'source_document_id' end,
      e->>'effective_date', e->>'source_published_date', e->>'rule_applied', e->'decision',
      (e->>'version')::int, v_batch);
    n_accepted := n_accepted + 1;
    accepted_keys := accepted_keys || (e->>'case_key');
  end loop;

  -- 4. context-only claims, kept separately
  for c in select * from jsonb_array_elements(payload->'context_facts') loop
    insert into scoped_claims (case_key, evidence_id, property_id, field, classification, value, unit, area_basis,
                               scope, rule_applied, batch_id)
    select c->>'case_key', cl->>'evidence_id', c->>'property_id', c->>'field', c->>'classification', cl->'value',
           cl->>'unit', cl->>'area_basis', cl->>'scope', c->>'rule_applied', v_batch
    from jsonb_array_elements(coalesce(c->'claims', '[]')) cl
    where coalesce(cl->>'evidence_id', '') <> ''
    on conflict (case_key, evidence_id) do nothing;
    get diagnostics n_cleared = row_count;
    n_claims := n_claims + n_cleared;
    accepted_keys := accepted_keys || (c->>'case_key');
  end loop;

  -- 5. review queue: resolved cases leave it, open cases are upserted
  delete from reconciliation_exceptions where case_key = any(accepted_keys);
  get diagnostics n_cleared = row_count;

  insert into reconciliation_exceptions (case_key, property_id, field, status, classification, document_error,
    proposed_value, proposed_unit, proposed_evidence_id, evidence_ids, reason, rule_applied, batch_id)
  select u->>'case_key', u->>'property_id', u->>'field', u->>'status', u->>'classification',
         coalesce((u->>'document_error')::boolean, false), u->'proposed_value', u->>'proposed_unit',
         u->>'proposed_evidence_id', _jtext_array(u->'evidence_ids'), u->>'reason', u->>'rule_applied', v_batch
  from jsonb_array_elements(payload->'unresolved_cases') u
  where coalesce(u->>'case_key', '') <> ''
  on conflict (case_key) do update set
    status = excluded.status, classification = excluded.classification, document_error = excluded.document_error,
    proposed_value = excluded.proposed_value, proposed_unit = excluded.proposed_unit,
    proposed_evidence_id = excluded.proposed_evidence_id, evidence_ids = excluded.evidence_ids,
    reason = excluded.reason, rule_applied = excluded.rule_applied, batch_id = excluded.batch_id, updated_at = now();
  get diagnostics n_unresolved = row_count;

  update ingestion_batches set counts = jsonb_build_object(
    'evidence_inserted', n_evidence, 'audit_events_inserted', n_events, 'accepted_inserted', n_accepted,
    'accepted_already_stored', n_duplicate, 'context_claims_inserted', n_claims,
    'unresolved_upserted', n_unresolved, 'exceptions_cleared', n_cleared, 'rejected', jsonb_array_length(rejected))
  where batch_id = v_batch;

  return jsonb_build_object('batch_id', v_batch,
                            'counts', (select counts from ingestion_batches where batch_id = v_batch),
                            'rejected', rejected);
end;
$$;

revoke execute on function public.ingest_extraction(jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_fact_handoff(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.ingest_extraction(jsonb) to service_role;
grant execute on function public.ingest_fact_handoff(jsonb, boolean) to service_role;
