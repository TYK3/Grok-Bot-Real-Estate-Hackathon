-- Read side for the listings site (client/) and the voice agent (src/).
--
-- published_fact_state() returns only what may be shown or spoken:
--   facts    current accepted version per case, with its source citation
--   pending  open review cases: status only, NEVER the proposed value
--   context  scoped claims that must be stated with their scope, never merged
-- It runs as the owner so anon callers get this projection without direct
-- access to the review queue, raw extraction or audit tables.

create or replace function public.published_fact_state()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'properties', coalesce((
      select jsonb_agg(jsonb_build_object('property_id', p.property_id, 'property_name', p.property_name)
                       order by p.property_id)
      from properties p), '[]'::jsonb),
    'facts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'case_key', f.case_key, 'property_id', f.property_id, 'field', f.field, 'value', f.value,
        'unit', f.unit, 'area_basis', f.area_basis, 'scope', f.scope, 'area_converted', f.area_converted,
        'currency', f.currency, 'classification', f.classification, 'version', f.version,
        'record_id', f.record_id, 'accepted_at', f.decision->>'accepted_at',
        'citation', jsonb_build_object(
          'evidence_id', f.source_evidence_id, 'doc_id', d.document_id, 'title', d.title,
          'doc_type', d.document_type, 'issuer', d.issuer,
          'doc_date', coalesce(f.source_published_date, d.published_date),
          'page', e.page_number, 'quote', e.quote, 'synthetic', coalesce(d.synthetic, false)))
        order by f.case_key)
      from current_property_facts f
      left join extracted_evidence e on e.evidence_id = f.source_evidence_id
      left join source_documents d on d.document_id = coalesce(f.source_document_id, e.source_document_id)
      where not exists (select 1 from reconciliation_exceptions x where x.case_key = f.case_key)), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'case_key', x.case_key, 'property_id', x.property_id, 'field', x.field, 'status', x.status,
        'classification', x.classification, 'document_error', x.document_error)
        order by x.case_key)
      from reconciliation_exceptions x), '[]'::jsonb),
    'context', coalesce((
      select jsonb_agg(c order by c->>'case_key') from (
        select jsonb_build_object(
          'case_key', s.case_key, 'property_id', min(s.property_id), 'field', min(s.field),
          'classification', min(s.classification),
          'claims', jsonb_agg(jsonb_build_object(
            'value', s.value, 'unit', s.unit, 'area_basis', s.area_basis, 'scope', s.scope,
            'citation', jsonb_build_object('doc_id', d.document_id, 'doc_type', d.document_type,
              'issuer', d.issuer, 'doc_date', d.published_date, 'page', e.page_number, 'quote', e.quote))
            order by s.evidence_id)) c
        from scoped_claims s
        left join extracted_evidence e on e.evidence_id = s.evidence_id
        left join source_documents d on d.document_id = e.source_document_id
        where not exists (select 1 from reconciliation_exceptions x where x.case_key = s.case_key)
        group by s.case_key) q), '[]'::jsonb)
  )
$$;

revoke execute on function public.published_fact_state() from public;
grant execute on function public.published_fact_state() to anon, authenticated, service_role;
