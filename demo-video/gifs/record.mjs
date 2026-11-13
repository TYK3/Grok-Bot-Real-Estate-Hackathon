// Records README GIFs by driving the running site in headless Chrome.
//
//   node gifs/record.mjs [name ...]        (site must be running on :3000)
//   node gifs/record.mjs --probe /explore  (list clickable text on a page)
//
// Each scene is a list of steps. Every step renders frames at a fixed rate,
// so scrolls and cursor moves come out smooth, then ffmpeg builds a GIF with
// its own palette into ../docs/gifs/<name>.gif.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const OUT = path.join(REPO, "docs/gifs");
const FFMPEG = path.resolve(HERE, "../node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe");
const BASE = process.env.SITE ?? "http://localhost:3000";
const W = 1280, H = 800, FPS = 12, GIF_W = 880;
// photo-heavy pages get a smaller GIF so the README stays light
const GIF_OPTS = { home: { w: 720, colors: 96 }, explore: { w: 800, colors: 128 } };

const chromeDir = path.join(os.homedir(), ".cache/hyperframes/chrome/chrome-headless-shell");
const CHROME = (function find(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isFile() && e.name === "chrome-headless-shell.exe") return p;
    if (e.isDirectory()) { const r = find(p); if (r) return r; }
  }
})(chromeDir);

/* ---------- minimal CDP client ---------- */
async function launch() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), "gt-gif-"));
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, "--hide-scrollbars", "--force-color-profile=srgb", "about:blank"], { stdio: "ignore" });
  let list;
  for (let i = 0; i < 50; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (d) => (d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "no-preference" }] });
  return { send, close: () => { try { ws.close(); proc.kill(); } catch {} } };
}

/* ---------- page helpers ---------- */
const CURSOR = `(() => { if (document.getElementById('__gt_cursor')) return;
  const c = document.createElement('div'); c.id='__gt_cursor';
  c.style.cssText='position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:none;';
  c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.5L16 20l-3 1.4-3.4-7.3L4 18z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const r = document.createElement('div'); r.id='__gt_ring';
  r.style.cssText='position:fixed;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #dcbc78;opacity:0;z-index:2147483646;pointer-events:none;';
  const st=document.createElement('style'); st.textContent='nextjs-portal,[data-nextjs-toast],#__next-build-watcher{display:none!important}';
  document.documentElement.append(st, r, c); })()`;

function sceneApi(cdp, frames) {
  let mx = W * 0.62, my = H * 0.55;
  const ev = async (expr) => (await cdp.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const shot = async () => {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    frames.push(Buffer.from(data, "base64"));
  };
  const place = (x, y, ring = 0) => ev(`(() => { ${CURSOR}; const c=document.getElementById('__gt_cursor'); c.style.translate='${x - 4}px ${y - 2}px';
    const r=document.getElementById('__gt_ring'); r.style.left='${x}px'; r.style.top='${y}px'; r.style.opacity='${ring}'; r.style.scale='${1.4 - ring * 0.6}'; })()`);
  // finds the visible element whose own text best matches, returns its centre
  const locate = (q, sel = "a,button,[role=button],[role=tab],label,summary,input,select,[onclick],li,tr,div,span") =>
    ev(`(() => { const q=${JSON.stringify(q)}; let best=null;
      for (const el of document.querySelectorAll(${JSON.stringify(sel)})) {
        const t=(el.innerText||el.value||el.getAttribute('aria-label')||el.placeholder||'').trim(); if(!t.toLowerCase().includes(q.toLowerCase())) continue;
        const b=el.getBoundingClientRect(); if(!b.width||!b.height) continue;
        if(!best||t.length<best.t.length) best={t,el}; }
      if(!best) return null; best.el.scrollIntoView({block:'nearest'}); const b=best.el.getBoundingClientRect();
      return {x:b.left+Math.min(b.width/2,140), y:b.top+b.height/2}; })()`);
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const api = {
    ev,
    async go(url, settle = 2500) {
      await cdp.send("Page.navigate", { url: BASE + url });
      await new Promise((r) => setTimeout(r, settle));
      await place(mx, my);
    },
    async hold(sec) { for (let i = 0; i < sec * FPS; i++) { await place(mx, my); await shot(); } },
    async move(x, y, sec = 0.7) {
      const sx = mx, sy = my, n = Math.max(2, Math.round(sec * FPS));
      for (let i = 1; i <= n; i++) { const t = ease(i / n); mx = sx + (x - sx) * t; my = sy + (y - sy) * t;
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx, y: my }); await place(mx, my); await shot(); }
    },
    async click(q, { sel, after = 1.2, sec = 0.7 } = {}) {
      const p = await locate(q, sel);
      if (!p) throw new Error(`no element for "${q}"`);
      await api.move(p.x, p.y, sec);
      for (const ring of [1, 0.7]) { await place(mx, my, ring); await shot(); }
      for (const type of ["mousePressed", "mouseReleased"]) await cdp.send("Input.dispatchMouseEvent", { type, x: mx, y: my, button: "left", clickCount: 1 });
      for (const ring of [0.45, 0.2]) { await place(mx, my, ring); await shot(); }
      await api.hold(after);
    },
    async hover(q, opts = {}) { const p = await locate(q, opts.sel); if (p) await api.move(p.x, p.y, opts.sec ?? 0.7); await api.hold(opts.after ?? 0.6); },
    async type(text, after = 0.8) {
      for (const ch of text) { await cdp.send("Input.insertText", { text: ch }); await place(mx, my); await shot(); }
      await api.hold(after);
    },
    async scroll(dy, sec = 1.6, target = "window") {
      const n = Math.round(sec * FPS);
      const start = await ev(target === "window" ? "scrollY" : `document.querySelector(${JSON.stringify(target)}).scrollTop`);
      for (let i = 1; i <= n; i++) {
        const y = start + dy * ease(i / n);
        await ev(target === "window" ? `scrollTo({top:${y},behavior:'instant'})` : `document.querySelector(${JSON.stringify(target)}).scrollTop=${y}`);
        await place(mx, my); await shot();
      }
    },
    async scrollTo(q, offset = 120, sec = 1.4) {
      const y = await ev(`(() => { for (const el of document.querySelectorAll('h1,h2,h3,h4,section,[id]')) { if ((el.innerText||'').trim().toLowerCase().startsWith(${JSON.stringify(q.toLowerCase())})) return el.getBoundingClientRect().top; } return null; })()`);
      if (y == null) throw new Error(`no heading "${q}"`);
      await api.scroll(y - offset, sec);
    },
  };
  return api;
}

/* ---------- the scenes ---------- */
const SCENES = {
  async home(s) {
    await s.go("/", 4000);
    await s.hold(1.2);
    await s.scroll(760, 1.6); await s.hold(0.8);
    await s.scroll(820, 1.6); await s.hold(0.8);
    await s.scroll(820, 1.6); await s.hold(1);
  },

  async explore(s) {
    await s.go("/explore", 4000);
    await s.hold(1);
    await s.click("2", { sel: "button", after: 1.6 });
    await s.scroll(380, 1.4); await s.hold(0.8);
    await s.scroll(-380, 1);
    await s.hover("Ask Haven", { sel: "a", after: 1.6 });
  },

  async property(s) {
    await s.go("/property/kelso-villa", 3500);
    await s.hold(1.2);
    await s.scrollTo("Tap any fact", 110, 1.4); await s.hold(0.6);
    await s.click("Price", { sel: "button", after: 2.4 });
    await s.click("Parking", { sel: "button", after: 2.6 });
  },
  async review(s) {
    await s.go("/review", 3500);
    await s.hold(1);
    await s.click("Or load a sample dataset", { sel: "summary", after: 0.6 });
    await s.ev(`(() => { const e=document.getElementById('samples'); e.value='../fact_record/contracts/01_extracted.json'; e.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await s.click("Load sample", { sel: "button", after: 2.2 });
    await s.click("C06", { sel: "button", after: 2.6 });
    await s.click("C01", { sel: "button", after: 1.8 });
    await s.click("Confirm", { sel: "button", after: 2.4 });
    await s.click("Board", { sel: "button", after: 2.4 });
  },
  async facts(s) {
    await s.go("/facts", 3500);
    await s.hold(1.4);
    await s.scroll(560, 2); await s.hold(1.2);
    await s.scroll(620, 2); await s.hold(1.4);
  },
  async haven(s) {
    await s.go("/haven", 6000);
    await s.hold(1.4);
    await s.click("Price check", { sel: "button", after: 2.4 });
    await s.click("Agreement Q&A", { sel: "button", after: 2.4 });
    await s.click("Book a viewing", { sel: "button", after: 2.4 });
    await s.click("Near what matters", { sel: "button", after: 2 });
  },

  async market(s) {
    await s.go("/market", 4000);
    await s.hold(1.4);
    await s.scroll(560, 2); await s.hold(1.2);
    await s.scroll(560, 2); await s.hold(1.4);
  },
};

/* ---------- run ---------- */
async function record(name) {
  const cdp = await launch();
  const frames = [];
  try {
    await SCENES[name](sceneApi(cdp, frames));
  } finally { cdp.close(); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `gt-${name}-`));
  frames.forEach((f, i) => fs.writeFileSync(path.join(tmp, `f${String(i).padStart(4, "0")}.png`), f));
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, `${name}.gif`);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "f%04d.png"),
    "-vf", `scale=${GIF_OPTS[name]?.w ?? GIF_W}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${GIF_OPTS[name]?.colors ?? 160}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    "-loop", "0", out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${name}.gif  ${frames.length} frames · ${(frames.length / FPS).toFixed(1)} s · ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
}

async function probe(url) {
  const cdp = await launch();
  const s = sceneApi(cdp, []);
  await s.go(url, 4000);
  console.log(await s.ev(`[...document.querySelectorAll('a,button,[role=tab],h1,h2,h3')].map(e=>e.tagName+': '+(e.innerText||e.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,60)).filter(Boolean).join('\\n')`));
  cdp.close();
}

const args = process.argv.slice(2);
if (args[0] === "--probe") await probe(args[1]);
else for (const n of args.length ? args : Object.keys(SCENES)) await record(n);
process.exit(0);
