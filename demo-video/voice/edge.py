"""Builds the narration from voice/lines.json with Microsoft Edge neural voices.

    python voice/edge.py

Free, no account: needs `pip install edge-tts` and an internet connection
(the script text is sent to Microsoft's speech service). Writes
public/voice/<scene>_<n>.mp3 and src/voice.json with a start frame for every
spoken word, which the scenes use as animation cues. Unchanged lines are reused.
"""
import asyncio
import hashlib
import json
import re
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
FPS = 30
cfg = json.loads((ROOT / "voice/lines.json").read_text(encoding="utf8"))
voices = cfg["edge"]
out_json = ROOT / "src/voice.json"
(ROOT / "public/voice").mkdir(parents=True, exist_ok=True)
prev = json.loads(out_json.read_text(encoding="utf8")) if out_json.exists() else {}


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


async def speak(text: str, v: dict, path: Path):
    com = edge_tts.Communicate(text, v["voice"], rate=v.get("rate", "+0%"), pitch=v.get("pitch", "+0Hz"), boundary="WordBoundary")
    marks, audio = [], bytearray()
    async for chunk in com.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            marks.append((chunk["offset"] / 1e7, chunk["duration"] / 1e7, norm(chunk["text"])))
    path.write_bytes(bytes(audio))
    # map our own tokens onto the service's word marks (it may split or join words)
    tokens = [norm(t) for t in text.split() if norm(t)]
    words, k = [], 0
    for tok in tokens:
        if k >= len(marks):
            words.append({"w": tok, "t": marks[-1][0]})
            continue
        start, acc = marks[k][0], ""
        while k < len(marks) and len(acc) < len(tok):
            acc += marks[k][2]
            k += 1
        words.append({"w": tok, "t": start})
    dur = marks[-1][0] + marks[-1][1] + 0.12
    return dur, words


async def main():
    out, chars = {}, 0
    for scene in cfg["scenes"]:
        t = cfg["lead"]
        segs = []
        for i, seg in enumerate(scene["segs"]):
            v = voices[seg["v"]]
            file = f"voice/{scene['id']}_{i}.mp3"
            h = hashlib.sha1(json.dumps([seg["text"], v]).encode()).hexdigest()[:12]
            old = (prev.get(scene["id"], {}).get("segs") or [None] * 99)[i] if i < len(prev.get(scene["id"], {}).get("segs", [])) else None
            if old and old.get("hash") == h and (ROOT / "public" / file).exists():
                dur = old["dur"] / FPS
                words = [{"w": w["w"], "t": (w["f"] - old["from"]) / FPS} for w in old["words"]]
            else:
                dur, words = await speak(seg["text"], v, ROOT / "public" / file)
                chars += len(seg["text"])
                print(f"  {scene['id']}_{i}  {dur:5.2f}s  {seg['text'][:56]}")
            if i > 0:
                t += seg.get("gap", cfg["gap"])
            start = round(t * FPS)
            segs.append(
                {
                    "v": seg["v"],
                    "text": seg["text"],
                    "src": file,
                    "hash": h,
                    "from": start,
                    "dur": round(dur * FPS),
                    "words": [{"w": w["w"], "f": start + round(w["t"] * FPS)} for w in words],
                }
            )
            t += dur
        t += cfg["tail"]
        out[scene["id"]] = {"frames": round(max(t, scene.get("min", 0)) * FPS), "segs": segs}
    out_json.write_text(json.dumps(out, indent=1), encoding="utf8")
    total = sum(s["frames"] for s in out.values()) - 12 * (len(out) - 1)
    print(f"Voiced {len(out)} scenes · {total / FPS / 60:.2f} min · {chars} characters generated")


asyncio.run(main())
