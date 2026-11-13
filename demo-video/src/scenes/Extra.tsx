import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { C, SFX } from "../theme";
import { BrandMark, Ground, Serif, SideTag, Sfx, cues, prog } from "../ui";

/* ---------- Classify: why the documents disagree ---------- */

const Kind: React.FC<{
  from: number;
  type: string;
  title: string;
  a: string;
  b: string;
  aNote: string;
  bNote: string;
  verdict: string;
  tone: string;
}> = ({ from, type, title, a, b, aNote, bNote, verdict, tone }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 18);
  const v = prog(frame, from + 22, from + 36);
  return (
    <div
      style={{
        opacity: interpolate(p, [0, 1], [0.18, 1]),
        translate: `0px ${(1 - p) * 26}px`,
        borderRadius: 22,
        background: C.surface,
        border: `1px solid ${p > 0.5 ? tone + "88" : C.line}`,
        boxShadow: p > 0.5 ? `0 0 40px ${tone}22` : "none",
        padding: "34px 38px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ fontSize: 18, letterSpacing: "0.18em", textTransform: "uppercase", color: tone, fontWeight: 700 }}>{type}</div>
      <div style={{ fontSize: 42, fontWeight: 600, letterSpacing: "-0.02em" }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 4 }}>
        {[
          [a, aNote],
          [b, bNote],
        ].map(([val, note], i) => (
          <React.Fragment key={i}>
            {i === 1 ? <div style={{ fontSize: 30, color: C.muted }}>vs</div> : null}
            <div style={{ flex: 1, padding: "16px 20px", borderRadius: 12, background: C.paper, color: C.paperInk }}>
              <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.02em" }}>{val}</div>
              <div style={{ fontSize: 20, color: "#5b6b62" }}>{note}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div style={{ opacity: v, fontSize: 26, color: C.ink, display: "flex", gap: 10, alignItems: "center" }}>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: tone }} />
        {verdict}
      </div>
    </div>
  );
};

export const Classify: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("classify");
  const t = prog(frame, 0, 18);
  const chips = ["Version supersession", "True conflict", "Unit or measurement mismatch", "Scope difference", "Plot or type variation", "Official record mismatch"];
  const tail = q.at("register") + 10;
  return (
    <Ground light="50% 0%">
      <SideTag text="For the agency · how it reasons" />
      <Sfx at={q.at("newer")} src={SFX.switch} volume={0.3} />
      <Sfx at={q.at("five")} src={SFX.switch} volume={0.3} />
      <Sfx at={q.at("contradicts")} src={SFX.switch} volume={0.3} />
      <Sfx at={q.at("energy")} src={SFX.switch} volume={0.3} />
      <div style={{ position: "absolute", top: 100, left: 130, right: 130, opacity: t }}>
        <div style={{ fontSize: 66, fontWeight: 600, letterSpacing: "-0.03em" }}>
          Not just <i style={{ fontStyle: "normal", color: C.muted }}>what</i> disagrees. <Serif>Why.</Serif>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 240,
          left: 130,
          right: 130,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 28,
        }}
      >
        <Kind
          from={q.at("newer")}
          tone={C.brass}
          type="Version supersession"
          title="Price"
          a="£700,000"
          aNote="April brochure · p2"
          b="£600,000"
          bNote="October brochure · p2"
          verdict="An update: the newer brochure is recommended"
        />
        <Kind
          from={q.at("five")}
          tone={C.warn}
          type="True conflict"
          title="Parking"
          a="6 spaces"
          aNote="Brochures · p2"
          b="5 spaces"
          bNote="Measured survey · p4"
          verdict="Held for a person. Not said on calls"
        />
        <Kind
          from={q.at("contradicts")}
          tone={C.red}
          type="Document error"
          title="Gross area, same page"
          a="185 sq m"
          aNote="= 1,991 sq ft"
          b="2,700 sq ft"
          bNote="April brochure · p2"
          verdict="Flagged as the brochure's own mistake"
        />
        <Kind
          from={q.at("energy")}
          tone={C.ok}
          type="Official record mismatch"
          title="Energy rating (EPC)"
          a="B"
          aNote="Marketing"
          b="C"
          bNote="Official EPC register"
          verdict="Checked against the official register"
        />
      </div>
      <div style={{ position: "absolute", bottom: 46, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 12 }}>
        {chips.map((c, i) => {
          const p = prog(frame, tail + i * 5, tail + i * 5 + 12);
          return (
            <div
              key={c}
              style={{
                opacity: p,
                padding: "10px 18px",
                borderRadius: 999,
                border: `1px solid ${C.brass}55`,
                fontSize: 20,
                color: C.muted,
                background: "rgba(220,188,120,0.06)",
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
    </Ground>
  );
};

/* ---------- Pipeline: one record, two products ---------- */

const Node: React.FC<{ x: number; y: number; w?: number; from: number; title: string; sub: string; hot?: boolean }> = ({
  x,
  y,
  w = 300,
  from,
  title,
  sub,
  hot = false,
}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 16);
  return (
    <div
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - 70,
        width: w,
        height: 140,
        borderRadius: 20,
        background: hot ? `linear-gradient(135deg, ${C.brassSoft}, ${C.brassDeep})` : C.surface,
        color: hot ? C.paperInk : C.ink,
        border: `1px solid ${hot ? "transparent" : C.brass + "55"}`,
        boxShadow: hot ? `0 0 60px ${C.brass}55` : "0 20px 50px rgba(0,0,0,.35)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        textAlign: "center",
        opacity: p,
        scale: `${interpolate(p, [0, 1], [0.9, 1])}`,
      }}
    >
      <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</div>
      <div style={{ fontSize: 19, marginTop: 6, color: hot ? "#3c4a42" : C.muted }}>{sub}</div>
    </div>
  );
};

const Wire: React.FC<{ d: string; from: number }> = ({ d, from }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 20);
  return <path d={d} fill="none" stroke={C.brass} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} opacity={0.8} />;
};

export const Pipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("pipeline");
  const rec = q.at("record");
  const site = q.at("website");
  const voice = q.at("voice");
  const same = q.at("same");
  const s = prog(frame, same, same + 18);
  return (
    <Ground light="50% 50%">
      <SideTag text="How it fits together" />
      <Sfx at={site} src={SFX.click} volume={0.3} />
      <Sfx at={voice} src={SFX.click} volume={0.3} />
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        <Wire d="M 330 470 L 520 470" from={6} />
        <Wire d="M 820 470 L 1000 470" from={14} />
        <Wire d="M 1300 470 C 1420 470, 1420 300, 1530 300" from={site - 10} />
        <Wire d="M 1300 470 C 1420 470, 1420 640, 1530 640" from={voice - 10} />
      </svg>
      <Node x={190} y={470} w={260} from={0} title="Documents" sub="brochures · surveys" />
      <Node x={670} y={470} from={8} title="Extract + review" sub="every fact, its receipt" />
      <Node x={1150} y={470} from={rec - 8} title="One record" sub="Supabase · versioned · audited" hot />
      <Node x={1680} y={300} from={site} title="Listing website" sub="contract 05 · verified facts" />
      <Node x={1680} y={640} from={voice} title="Haven, voice agent" sub="contract 04 · may say / do not say" />
      <AbsoluteFill style={{ top: 800, alignItems: "center" }}>
        <div style={{ opacity: s, translate: `0px ${(1 - s) * 18}px`, fontSize: 54, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Same record. <Serif>Same answer.</Serif>
        </div>
      </AbsoluteFill>
    </Ground>
  );
};

/* ---------- Results: measured on the running system ---------- */

const Stat: React.FC<{ from: number; big: string; label: string; sub: string; tone?: string }> = ({ from, big, label, sub, tone = C.brass }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 18);
  return (
    <div
      style={{
        opacity: p,
        translate: `0px ${(1 - p) * 30}px`,
        borderRadius: 24,
        background: C.surface,
        border: `1px solid ${C.line}`,
        padding: "60px 38px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: "-0.04em", color: tone }}>{big}</div>
      <div style={{ fontSize: 30, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, color: C.muted, lineHeight: 1.4 }}>{sub}</div>
    </div>
  );
};

export const Results: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("results");
  const t = prog(frame, 0, 18);
  return (
    <Ground light="50% 0%">
      <SideTag text="Measured · 12 November 2026" />
      <div style={{ position: "absolute", top: 110, left: 130, right: 130, opacity: t }}>
        <div style={{ fontSize: 66, fontWeight: 600, letterSpacing: "-0.03em" }}>
          Tested on the <Serif>running system.</Serif>
        </div>
      </div>
      <div style={{ position: "absolute", top: 320, left: 130, right: 130, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 26 }}>
        <Stat from={q.at("parking")} big="✓" tone={C.ok} label="Parking question" sub="Safe wording every time. No disputed number." />
        <Stat from={q.at("price")} big="p.2" label="Price, with its source" sub="£600,000 · Carter Jonas · 16 Oct 2026" />
        <Stat from={q.at("milliseconds")} big="2–6 ms" label="To rank every listing" sub="by distance to parks, shops, stations" />
        <Stat from={q.at("replies")} big="1.7–3.5 s" label="Reply time on a call" sub="end of speech to Haven's first word" />
      </div>
      <div style={{ position: "absolute", bottom: 90, left: 0, right: 0, textAlign: "center", fontSize: 26, color: C.muted, opacity: prog(frame, q.at("replies") + 30, q.at("replies") + 46) }}>
        Answer key: 11 contradictions across 6 of 7 disagreement types · 7 voice tools
      </div>
      <div style={{ position: "absolute", top: 40, right: 100, opacity: 0.6 }}>
        <BrandMark size={44} />
      </div>
    </Ground>
  );
};
