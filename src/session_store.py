import contextvars
import json
import os
import threading
from datetime import UTC, datetime
from typing import Any

DATA_DIR = os.getenv("DATA_DIR", "data")
SESSIONS_DIR = os.path.join(DATA_DIR, "sessions")
SESSION_FILENAME = "session.json"
BOOKING_FILENAME = "booking.json"
CUSTOMER_FILENAME = "customer.json"
SUMMARY_FILENAME = "call_summary.txt"
TRANSCRIPT_FILENAME = "transcript.txt"

_lock = threading.Lock()

_current_session_dir: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_session_dir", default=None
)

def _now() -> str:
    return datetime.now(UTC).isoformat()

def _session_dir() -> str:
    session_dir = _current_session_dir.get()
    if session_dir is None:
        raise RuntimeError("No active session; call start_session() first.")
    return session_dir

def start_session(session_id: str, property_id: str | None = None) -> str:
    session_dir = os.path.join(SESSIONS_DIR, session_id)
    with _lock:
        os.makedirs(session_dir, exist_ok=True)
        _write_json(
            os.path.join(session_dir, SESSION_FILENAME),
            {
                "session_id": session_id,
                "property_id": property_id,
                "started_at": _now(),
            },
        )
    _current_session_dir.set(session_dir)
    return session_dir

def _write_json(path: str, data: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)

def _read_json(path: str) -> dict[str, Any]:
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
            return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}

def save_booking_details(booking_data: dict[str, Any]) -> None:
    path = os.path.join(_session_dir(), BOOKING_FILENAME)
    payload = {**booking_data, "recorded_at": _now()}
    with _lock:
        _write_json(path, payload)

def save_customer_details(customer_data: dict[str, Any]) -> None:
    """Merge captured customer details (name/email/phone) into customer.json."""
    path = os.path.join(_session_dir(), CUSTOMER_FILENAME)
    with _lock:
        current = _read_json(path)
        current.update({k: v for k, v in customer_data.items() if v})
        current["updated_at"] = _now()
        _write_json(path, current)

def save_call_summary(summary_text: str) -> None:
    path = os.path.join(_session_dir(), SUMMARY_FILENAME)
    with _lock, open(path, "w", encoding="utf-8") as f:
        f.write(summary_text)

def save_transcript(transcript_text: str) -> None:
    path = os.path.join(_session_dir(), TRANSCRIPT_FILENAME)
    with _lock, open(path, "w", encoding="utf-8") as f:
        f.write(transcript_text)

def get_session_dir() -> str:
    return _session_dir()


SEARCH_FILENAME = "search.json"


def save_search(shortlist: list[dict[str, Any]] | None = None, focus_id: str | None = None) -> None:
    """Shortlist and focused property for the general-search call screen.

    The UI polls this (via /api/sessions/<room>) to pin results on the map and
    open the property the agent is talking about."""
    path = os.path.join(_session_dir(), SEARCH_FILENAME)
    with _lock:
        current = _read_json(path)
        if shortlist is not None:
            current["shortlist"] = shortlist
        if focus_id is not None:
            current["focus_id"] = focus_id
        current["updated_at"] = _now()
        _write_json(path, current)


STAGE_FILENAME = "stage.json"


def save_stage(kind: str, data: dict[str, Any]) -> None:
    """What Haven is showing right now: map, price, agreement, viewing or
    reservation. The Haven page polls it to switch its live stage panel."""
    path = os.path.join(_session_dir(), STAGE_FILENAME)
    with _lock:
        _write_json(path, {"kind": kind, "data": data, "updated_at": _now()})
