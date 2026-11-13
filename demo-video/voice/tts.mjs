// Builds the narration from voice/lines.json.
//
//   node voice/tts.mjs            ElevenLabs voices + word timings (needs ELEVENLABS_API_KEY)
//   node voice/tts.mjs --estimate timings guessed from word counts, no audio (for layout)
//
// Writes public/voice/<scene>_<n>.mp3 and src/voice.json. Clips whose text and
// voice have not changed are reused, so re-running only spends credits on edits.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FPS = 30;
const estimate = process.argv.includes("--estimate");
const cfg = JSON.parse(fs.readFileSync(path.join(root, "voice/lines.json"), "utf8"));
const outJson = path.join(root, "src/voice.json");
const audioDir = path.join(root, "public/voice");
fs.mkdirSync(audioDir, { recursive: true });

// key from the environment or demo-video/.env (gitignored)
let KEY = process.env.ELEVENLABS_API_KEY;
const envFile = path.join(root, ".env");
if (!KEY && fs.existsSync(envFile)) {
  const m = fs.readFileSync(envFile, "utf8").match(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
  if (m) KEY = m[1].trim();
}
if (!estimate && !KEY) {
  console.error("No ELEVENLABS_API_KEY in the environment or demo-video/.env");
  process.exit(1);
}

const prev = fs.existsSync(outJson) ? JSON.parse(fs.readFileSync(outJson, "utf8")) : {};
const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const api = async (p, init = {}) => {
  const r = await fetch(`https://api.elevenlabs.io${p}`, {
    ...init,
    headers: { "xi-api-key": KEY, "content-type": "application/json", ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`${p} → ${r.status} ${await r.text()}`);
  return r.json();
};

// resolve voice names to ids from the account's voice list
const voiceIds = {};
if (!estimate) {
  const { voices } = await api("/v1/voices");
  for (const [role, v] of Object.entries(cfg.voices)) {
    const hit = voices.find((x) => x.voice_id === v.id) || voices.find((x) => x.name.toLowerCase().startsWith(v.name.toLowerCase()));
    if (!hit) throw new Error(`Voice "${v.name}" not found. Available: ${voices.map((x) => x.name).join(", ")}`);
    voiceIds[role] = hit.voice_id;
    console.log(`${role}: ${hit.name} (${hit.voice_id})`);
  }
}

/** words with start times (s) from ElevenLabs character alignment */
const wordsFromAlignment = (al) => {
  const words = [];
  let cur = "";
  let start = 0;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push({ w: norm(cur), t: start });
      cur = "";
    } else {
      if (!cur) start = al.character_start_times_seconds[i];
      cur += ch;
    }
  });
  if (cur) words.push({ w: norm(cur), t: start });
  return words.filter((w) => w.w);
};

const out = {};
const flat = cfg.scenes.flatMap((s) => s.segs.map((g) => ({ ...g, scene: s.id })));
let chars = 0;

for (const scene of cfg.scenes) {
  let t = cfg.lead;
  const segs = [];
  for (const [i, seg] of scene.segs.entries()) {
    const file = `voice/${scene.id}_${i}.mp3`;
    const vs = cfg.voices[seg.v];
    const h = hash(JSON.stringify([seg.text, seg.v, vs, cfg.model]));
    const old = prev[scene.id]?.segs?.[i];
    let dur;
    let words;
    let src = null;
    if (!estimate && old?.hash === h && old.src && fs.existsSync(path.join(root, "public", file))) {
      dur = old.dur / FPS;
      words = old.words.map((w) => ({ w: w.w, t: w.f / FPS - old.from / FPS }));
      src = file;
    } else if (estimate) {
      const ws = seg.text.split(/\s+/).map(norm).filter(Boolean);
      const rate = 2.75; // words per second
      words = ws.map((w, k) => ({ w, t: k / rate }));
      dur = ws.length / rate + 0.25;
    } else {
      // keep the narrator's delivery continuous across clips
      const idx = flat.findIndex((f) => f.scene === scene.id && f.text === seg.text);
      const before = flat.slice(0, idx).filter((f) => f.v === seg.v).slice(-1)[0];
      const after = flat.slice(idx + 1).find((f) => f.v === seg.v);
      const body = {
        text: seg.text,
        model_id: cfg.model,
        voice_settings: vs.settings,
        ...(before ? { previous_text: before.text } : {}),
        ...(after ? { next_text: after.text } : {}),
      };
      const res = await api(`/v1/text-to-speech/${voiceIds[seg.v]}/with-timestamps?output_format=mp3_44100_128`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      fs.writeFileSync(path.join(root, "public", file), Buffer.from(res.audio_base64, "base64"));
      const al = res.alignment;
      dur = al.character_end_times_seconds[al.character_end_times_seconds.length - 1] + 0.05;
      words = wordsFromAlignment(al);
      src = file;
      chars += seg.text.length;
      console.log(`  ${scene.id}_${i}  ${dur.toFixed(2)}s  ${seg.text.slice(0, 50)}`);
    }
    if (i > 0) t += seg.gap ?? cfg.gap;
    const from = Math.round(t * FPS);
    segs.push({
      v: seg.v,
      text: seg.text,
      src,
      hash: estimate ? null : h,
      from,
      dur: Math.round(dur * FPS),
      words: words.map((w) => ({ w: w.w, f: from + Math.round(w.t * FPS) })),
    });
    t += dur;
  }
  t += cfg.tail;
  out[scene.id] = { frames: Math.round(Math.max(t, scene.min ?? 0) * FPS), segs };
}

fs.writeFileSync(outJson, JSON.stringify(out, null, 1));
const total = Object.values(out).reduce((a, s) => a + s.frames, 0) - 12 * (cfg.scenes.length - 1);
console.log(`${estimate ? "Estimated" : "Voiced"} ${cfg.scenes.length} scenes · ${(total / FPS / 60).toFixed(2)} min${chars ? ` · ${chars} characters sent` : ""}`);
