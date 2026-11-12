// Map extractor output (extracted_fact schema + documents[]) onto the PDFs a
// reviewer just uploaded. Used for the live extractor response and for the
// precomputed fallback (data/extracted/sample_extraction.json).
//
// uploads: [{ name, doc_id, sha256? }] — doc_id is the id the workbench gave
// the uploaded PDF, so facts point at the real file and page previews work.

export function baseName(name = '') {
  return String(name).split(/[\\/]/).pop().trim().toLowerCase();
}

export function factsForUploads(payload, uploads = []) {
  const docs = Array.isArray(payload?.documents) ? payload.documents : [];
  const facts = Array.isArray(payload?.facts) ? payload.facts : [];
  const byName = new Map(), byHash = new Map();
  for (const d of docs) {
    if (d.file_name || d.name) byName.set(baseName(d.file_name || d.name), d);
    if (d.sha256) byHash.set(d.sha256, d);
  }
  const extractorToUpload = new Map();
  const matched = [];
  for (const u of uploads) {
    const d = (u.sha256 && byHash.get(u.sha256)) || byName.get(baseName(u.name));
    if (!d) continue;
    extractorToUpload.set(d.doc_id, u);
    matched.push(u.name);
  }
  const out = [];
  for (const f of facts) {
    const src = f.source || {};
    let u = extractorToUpload.get(src.doc_id);
    if (!u && src.file_name) {
      const d = byName.get(baseName(src.file_name));
      u = d && extractorToUpload.get(d.doc_id);
    }
    if (!u) continue;
    out.push({ ...f, source: { ...src, extractor_doc_id: src.doc_id, doc_id: u.doc_id || src.doc_id } });
  }
  return { facts: out, matched, unmatched: uploads.map((u) => u.name).filter((n) => !matched.includes(n)) };
}

export async function sha256Hex(bytes) {
  try {
    const c = globalThis.crypto?.subtle;
    if (!c || !bytes) return null;
    const h = await c.digest('SHA-256', bytes);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
