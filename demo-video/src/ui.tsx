import React from "react";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { C, FONT, SERIF } from "./theme";
import VOICE_JSON from "./voice.json";

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0→1 progress between two frames, eased and clamped. */
export const prog = (frame: number, from: number, to: number, e = ease) =>
  interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: e,
  });

/** Sound effects sit under the voice, so they play at about half their old level. */
export const Sfx: React.FC<{ at: number; src: string; volume?: number }> = ({ at, src, volume = 0.5 }) => (
  <Sequence from={at} durationInFrames={60} layout="none">
    <Audio src={src} volume={volume * 0.5} />
  </Sequence>
);

/* ---------- Voice: scene lengths and word cues come from src/voice.json ---------- */

type VSeg = { v: string; text: string; src: string | null; from: number; dur: number; words: { w: string; f: number }[] };
export const VOICE = VOICE_JSON as unknown as Record<string, { frames: number; segs: VSeg[] }>;
const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Cues for one scene. at("parking", 2) is the frame where the second "parking"
 * is spoken, so visuals stay locked to the narration when the voice changes.
 */
export const cues = (id: string) => {
  const s = VOICE[id];
  const all = s.segs.flatMap((g) => g.words);
  const at = (word: string, n = 1, off = 0) => {
    const hits = all.filter((w) => w.w === norm(word));
    if (hits.length < n) throw new Error(`cue "${word}" #${n} is not in the "${id}" narration`);
    return hits[n - 1].f + off;
  };
  return {
    frames: s.frames,
    at,
    seg: (i: number) => s.segs[i].from,
    end: (i: number) => s.segs[i].from + s.segs[i].dur,
    segs: s.segs,
  };
};

export const VoiceTrack: React.FC<{ id: string }> = ({ id }) => (
  <>
    {VOICE[id].segs.map((g, i) =>
      g.src ? (
        <Sequence key={i} from={g.from} durationInFrames={g.dur + 15} layout="none">
          <Audio src={staticFile(g.src)} volume={g.v === "narrator" ? 1 : 0.92} />
        </Sequence>
      ) : null,
    )}
  </>
);

/** Forest ground with a soft brass light, used behind every scene. */
export const Ground: React.FC<{ children?: React.ReactNode; light?: string }> = ({ children, light = "50% 0%" }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(120% 80% at ${light}, #1b3328 0%, ${C.bg} 55%, ${C.bgDeep} 100%)`,
      fontFamily: FONT,
      color: C.ink,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** The Ground Truth mark: shield, check, two voice waves. */
export const BrandMark: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 48 44" width={size} height={(size * 44) / 48}>
    <defs>
      <linearGradient id="ctg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f6e8c6" />
        <stop offset="1" stopColor="#c99a4b" />
      </linearGradient>
    </defs>
    <path
      d="M20 3.5 33 8.6c.9.4 1.5 1.2 1.5 2.2V21c0 9.6-6.1 16.7-13.6 19.3a2.7 2.7 0 0 1-1.8 0C11.6 37.7 5.5 30.6 5.5 21V10.8c0-1 .6-1.8 1.5-2.2Z"
      fill="url(#ctg)"
    />
    <path d="M13.2 21.6 18 26.4l9.4-9.8" fill="none" stroke="#17261f" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M38.6 12.2a8 8 0 0 1 0 9.6" fill="none" stroke={C.brass} strokeWidth="2.6" strokeLinecap="round" />
    <path d="M42.8 8.4a14 14 0 0 1 0 17.2" fill="none" stroke={C.brass} strokeWidth="2.6" strokeLinecap="round" opacity=".55" />
  </svg>
);

export const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <span style={{ fontSize: size, fontWeight: 500, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
    Ground{" "}
    <span style={{ fontFamily: SERIF, fontStyle: "italic", color: C.brass, fontSize: size * 1.12 }}>Truth</span>
  </span>
);

export type CamKey = { at: number; cx: number; cy: number; zoom: number };

/**
 * A real screenshot inside a browser window. The camera keys say which image
 * point sits at the centre of the viewport, and how far to zoom (1 = the image
 * width fills the viewport). Children are drawn in image pixels, so highlights
 * stay pinned to the UI as the camera moves.
 */
export const Shot: React.FC<{
  src: string;
  imgW: number;
  imgH: number;
  url: string;
  keys: CamKey[];
  children?: React.ReactNode;
  enter?: number;
}> = ({ src, imgW, imgH, url, keys, children, enter = 0 }) => {
  const frame = useCurrentFrame();
  const W = 1720;
  const H = 900;
  const bar = 46;
  const vh = H - bar;
  const frames = keys.map((k) => k.at);
  const opt = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: inOut };
  const pick = (f: (k: CamKey) => number) => (keys.length === 1 ? f(keys[0]) : interpolate(frame, frames, keys.map(f), opt));
  const s = (W / imgW) * pick((k) => k.zoom);
  let tx = W / 2 - pick((k) => k.cx) * s;
  let ty = vh / 2 - pick((k) => k.cy) * s;
  // keep the image covering the viewport
  tx = Math.min(0, Math.max(W - imgW * s, tx));
  ty = imgH * s < vh ? (vh - imgH * s) / 2 : Math.min(0, Math.max(vh - imgH * s, ty));
  const inP = prog(frame, enter, enter + 22);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 40 }}>
      <div
        style={{
          width: W,
          height: H,
          borderRadius: 18,
          overflow: "hidden",
          background: C.bg,
          border: `1px solid ${C.line}`,
          boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
          position: "relative",
          opacity: inP,
          translate: `0px ${interpolate(inP, [0, 1], [40, 0])}px`,
        }}
      >
        <div
          style={{
            height: bar,
            background: "#0f1d17",
            borderBottom: `1px solid ${C.line}`,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 18px",
          }}
        >
          {["#e46a5a", "#e8b65a", "#7fd6a0"].map((c) => (
            <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.8 }} />
          ))}
          <div
            style={{
              marginLeft: 18,
              flex: 1,
              maxWidth: 760,
              height: 28,
              borderRadius: 14,
              background: "rgba(255,255,255,0.06)",
              color: C.muted,
              fontSize: 16,
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
            }}
          >
            {url}
          </div>
        </div>
        <div style={{ position: "relative", width: W, height: vh, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: imgW,
              height: imgH,
              transformOrigin: "0 0",
              translate: `${tx}px ${ty}px`,
              scale: `${s}`,
            }}
          >
            <Img src={staticFile(src)} style={{ width: imgW, height: imgH, display: "block" }} />
            {children}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** A brass ring that draws around a UI region (image pixels). */
export const Ring: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  from: number;
  to?: number;
  color?: string;
  radius?: number;
  dim?: boolean;
}> = ({ x, y, w, h, from, to = 99999, color = C.brass, radius = 14, dim = true }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 14) * (1 - prog(frame, to, to + 10));
  return (
    <div
      style={{
        position: "absolute",
        left: x - 8,
        top: y - 8,
        width: w + 16,
        height: h + 16,
        borderRadius: radius,
        border: `4px solid ${color}`,
        boxShadow: `${dim ? `0 0 0 9999px rgba(5,10,8,${0.38 * p}), ` : ""}0 0 30px ${color}66`,
        opacity: p,
        scale: `${interpolate(p, [0, 1], [1.06, 1])}`,
      }}
    />
  );
};

/** A pointer that glides between points (image pixels) and clicks. */
export const Cursor: React.FC<{
  path: { at: number; x: number; y: number }[];
  clicks?: number[];
  size?: number;
}> = ({ path, clicks = [], size = 34 }) => {
  const frame = useCurrentFrame();
  const opt = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: inOut };
  const fr = path.map((p) => p.at);
  const x = path.length > 1 ? interpolate(frame, fr, path.map((p) => p.x), opt) : path[0].x;
  const y = path.length > 1 ? interpolate(frame, fr, path.map((p) => p.y), opt) : path[0].y;
  const vis = prog(frame, path[0].at - 8, path[0].at);
  const press = clicks.reduce((m, c) => Math.max(m, 1 - Math.abs(frame - c - 3) / 4), 0);
  const ripple = clicks.map((c) => {
    const t = (frame - c) / 18;
    if (t < 0 || t > 1) return null;
    return (
      <div
        key={c}
        style={{
          position: "absolute",
          left: x - 40 * t - 6,
          top: y - 40 * t - 6,
          width: 80 * t + 12,
          height: 80 * t + 12,
          borderRadius: "50%",
          border: `3px solid ${C.brass}`,
          opacity: 1 - t,
        }}
      />
    );
  });
  return (
    <>
      {ripple}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{ position: "absolute", left: x - 4, top: y - 2, opacity: vis, scale: `${1 - Math.max(0, press) * 0.15}`, filter: "drop-shadow(0 3px 6px rgba(0,0,0,.5))" }}
      >
        <path d="M4 2l15 9-6.5 1.6L16 20l-3 1.4-3.4-7.4L4 18z" fill="#fff" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </>
  );
};

/** Step caption pinned under the window: a numbered brass chip plus one line. */
export const Caption: React.FC<{ n?: string; text: React.ReactNode; from: number; to?: number }> = ({ n, text, from, to = 99999 }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 16) * (1 - prog(frame, to, to + 10));
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 34,
        display: "flex",
        justifyContent: "center",
        opacity: p,
        translate: `0px ${interpolate(p, [0, 1], [18, 0])}px`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "16px 30px 16px 16px",
          borderRadius: 999,
          background: "rgba(12,24,19,0.94)",
          border: `1px solid ${C.brass}55`,
          boxShadow: "0 18px 50px rgba(0,0,0,.5)",
          fontSize: 34,
          fontWeight: 500,
          letterSpacing: "-0.01em",
        }}
      >
        {n ? (
          <div
            style={{
              minWidth: 52,
              height: 52,
              borderRadius: 26,
              background: `linear-gradient(135deg, ${C.brassSoft}, ${C.brassDeep})`,
              color: C.paperInk,
              fontWeight: 700,
              fontSize: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 14px",
            }}
          >
            {n}
          </div>
        ) : null}
        <span>{text}</span>
      </div>
    </div>
  );
};

/** Small top-left label that names which side of the product we are in. */
export const SideTag: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, 4, 20);
  return (
    <div
      style={{
        position: "absolute",
        top: 34,
        left: 100,
        opacity: p,
        fontSize: 20,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: C.brass,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
};

export const Serif: React.FC<{ children: React.ReactNode; color?: string }> = ({ children, color = C.brass }) => (
  <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, color }}>{children}</span>
);
