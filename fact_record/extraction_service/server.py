"""Local extractor service for the conflict-resolution workbench.

    python fact_record/extraction_service/server.py      # listens on :8765

GET  /health   -> {"ok": true}
POST /extract  -> multipart PDFs (field name "files") -> extracted_fact JSON
                  ({"facts": [...], "documents": [...]}), CORS enabled.

Needs the extractor deps (pip install -r fact_record/requirements.txt) and the
tesseract binary for scanned brochures. The workbench falls back to the
precomputed sample extraction when this service is not running.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import traceback
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # fact_record/ -> import extraction
sys.path.insert(0, HERE)

from convert import convert_dir  # noqa: E402

PORT = int(os.environ.get("EXTRACTOR_PORT", "8765"))


def parse_multipart(content_type: str, body: bytes):
    msg = BytesParser(policy=default).parsebytes(
        b"Content-Type: " + content_type.encode() + b"\r\nMIME-Version: 1.0\r\n\r\n" + body)
    files = []
    for part in msg.iter_parts():
        name = part.get_filename()
        if name:
            files.append((os.path.basename(name), part.get_payload(decode=True)))
    return files


def run_extractor(files):
    from extraction import pipeline
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "upload")
        os.makedirs(src)
        for name, data in files:
            with open(os.path.join(src, name), "wb") as f:
                f.write(data)
        out = os.path.join(tmp, "out")
        pipeline.run(src, out, extractor=os.environ.get("EXTRACTOR_MODE", "auto"),
                     cache_dir=os.environ.get("EXTRACTOR_CACHE", os.path.join(HERE, ".cache")))
        return convert_dir(out, label="Live extraction: " + ", ".join(n for n, _ in files))


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if not self.path.startswith("/extract"):
            return self._send(404, {"error": "not found"})
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            files = [f for f in parse_multipart(self.headers.get("Content-Type", ""), body)
                     if f[0].lower().endswith(".pdf")]
            if not files:
                return self._send(400, {"error": "upload PDFs as multipart field 'files'"})
            self._send(200, run_extractor(files))
        except Exception as e:  # keep the demo alive; UI falls back
            traceback.print_exc()
            self._send(500, {"error": str(e)})


if __name__ == "__main__":
    print(f"Extractor service on http://localhost:{PORT} (POST /extract, GET /health)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
