import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, FONT, SERIF, SFX } from "../theme";
import { BrandMark, Ground, Serif, Sfx, Wordmark, cues, ease, prog } from "../ui";

/* ---------- 1. Hook: one home, three documents that disagree ---------- */

const Paper: React.FC<{
  issuer: string;
  kind: string;
  date: string;
  rows: { label: string; value: string; note: string; flagAt?: number }[];
  rot: number;
  x: number;
  from: number;
  lit?: number;
}> = ({ issuer, kind, date, rows, rot, x, from, lit = 99999 }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 24);
  const on = prog(frame, lit, lit + 10) * (1 - prog(frame, lit + 75, lit + 90));
  return (
    <div
      style={{
        position: "absolute",
        left: 960 + x - 230,
        top: 330,
        width: 460,
        height: 560,
        background: C.paper,
        color: C.paperInk,
        borderRadius: 10,
        padding: "34px 34px",
        boxShadow: "0 30px 80px rgba(0,0,0,.55)",
        rotate: `${rot * p}deg`,
        translate: `0px ${interpolate(p, [0, 1], [500, 0])}px`,
        opacity: p,
        outline: `4px solid rgba(220,188,120,${on})`,
        outlineOffset: 6,
      }}
    >
      <div style={{ fontSize: 17, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8a6420", fontWeight: 600 }}>{kind}</div>
      <div style={{ fontSize: 30, fontWeight: 600, marginTop: 8 }}>{issuer}</div>
      <div style={{ fontSize: 20, color: "#5b6b62", marginTop: 4 }}>{date}</div>
      <div style={{ height: 1, background: "#d9d1bd", margin: "22px 0" }} />
      {[300, 360, 250].map((w, i) => (
        <div key={i} style={{ width: w, height: 10, borderRadius: 5, background: "#e2dac7", marginBottom: 12 }} />
      ))}
      {rows.map((r) => {
        const f = r.flagAt === undefined ? 0 : prog(frame, r.flagAt, r.flagAt + 12);
        return (
        <div
          key={r.label}
          style={{
            marginTop: 22,
            padding: "14px 16px",
            borderRadius: 10,
            background: f > 0 ? `rgba(232,163,90,${0.12 + 0.2 * f})` : "#efe8d8",
            outline: f > 0 ? `3px solid rgba(214,120,40,${f})` : "none",
            scale: `${1 + 0.04 * f * (1 - prog(frame, (r.flagAt ?? 0) + 12, (r.flagAt ?? 0) + 30))}`,
          }}
        >
          <div style={{ fontSize: 16, color: "#6b766f", textTransform: "uppercase", letterSpacing: "0.12em" }}>{r.label}</div>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.02em" }}>{r.value}</div>
          <div style={{ fontSize: 17, color: "#6b766f" }}>{r.note}</div>
        </div>
        );
      })}
    </div>
  );
};

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("hook");
  const docs = q.at("these");
  const l1 = prog(frame, 0, 18);
  const l2 = prog(frame, q.at("which"), q.at("which") + 16);
  return (
    <Ground>
      <Sfx at={docs} src={SFX.page} volume={0.4} />
      <Sfx at={docs + 16} src={SFX.page} volume={0.4} />
      <Sfx at={docs + 32} src={SFX.page} volume={0.4} />
      <Sfx at={q.at("which")} src={SFX.switch} volume={0.4} />
      <div
        style={{
          position: "absolute",
          top: 120,
          width: "100%",
          textAlign: "center",
          fontSize: 76,
          fontWeight: 600,
          letterSpacing: "-0.03em",
        }}
      >
        <span style={{ opacity: l1 }}>One home. Three documents.</span>{" "}
        <span style={{ opacity: l2, color: C.warn }}>
          <Serif color={C.warn}>None agree.</Serif>
        </span>
      </div>
      <div style={{ position: "absolute", top: 215, width: "100%", textAlign: "center", fontSize: 28, color: C.muted, opacity: l1 }}>
        Kelso Villa, East London · the real demo case
      </div>
      <Paper
        kind="Sales particulars"
        issuer="Carter Jonas"
        date="13 April 2026"
        rot={-7}
        x={-520}
        from={docs}
        lit={q.at("april")}
        rows={[
          { label: "Price", value: "£700,000", note: "offers in region · page 2", flagAt: q.at("seven") },
          { label: "Parking", value: "6 spaces", note: "page 2", flagAt: q.at("six") },
        ]}
      />
      <Paper
        kind="Sales particulars"
        issuer="Carter Jonas"
        date="16 October 2026"
        rot={2}
        x={0}
        from={docs + 16}
        lit={q.at("october")}
        rows={[
          { label: "Price", value: "£600,000", note: "guide · page 2", flagAt: q.at("six", 2) },
          { label: "Status", value: "For sale", note: "page 1" },
        ]}
      />
      <Paper
        kind="Measured survey"
        issuer="Holloway & Reid"
        date="18 September 2026"
        rot={6}
        x={520}
        from={docs + 32}
        lit={q.at("surveyor")}
        rows={[
          { label: "Net area", value: "1,912 sq ft", note: "NIA · page 1" },
          { label: "Parking", value: "5 spaces", note: "allocated · page 4", flagAt: q.at("five") },
        ]}
      />
    </Ground>
  );
};

/* ---------- 2. The problem: a generic bot repeats the first number ---------- */

const Bubble: React.FC<{ who: "user" | "bot"; from: number; children: React.ReactNode }> = ({ who, from, children }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 14);
  const user = who === "user";
  return (
    <div style={{ display: "flex", justifyContent: user ? "flex-end" : "flex-start", opacity: p, translate: `0px ${(1 - p) * 20}px` }}>
      <div
        style={{
          maxWidth: 820,
          padding: "22px 30px",
          borderRadius: 26,
          borderBottomRightRadius: user ? 6 : 26,
          borderBottomLeftRadius: user ? 26 : 6,
          background: user ? C.brass : "#1f2a26",
          color: user ? C.paperInk : C.ink,
          fontSize: 36,
          lineHeight: 1.35,
          fontWeight: 500,
        }}
      >
        {children}
      </div>
    </div>
  );
};

const Struck: React.FC<{ from: number; note: string; above?: boolean; children: React.ReactNode }> = ({ from, note, above = false, children }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 12);
  const n = prog(frame, from + 8, from + 22);
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      {children}
      <span style={{ position: "absolute", left: -4, top: "52%", height: 5, width: `${p * 104}%`, background: C.red, borderRadius: 3 }} />
      <span
        style={{
          position: "absolute",
          left: 0,
          ...(above ? { bottom: "100%", marginBottom: 10 } : { top: "100%", marginTop: 10 }),
          whiteSpace: "nowrap",
          fontSize: 22,
          fontWeight: 600,
          color: C.red,
          opacity: n,
          letterSpacing: "0.02em",
        }}
      >
        {note}
      </span>
    </span>
  );
};

export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("problem");
  const t = prog(frame, 0, 16);
  const src = prog(frame, q.at("tell"), q.at("tell") + 14);
  return (
    <Ground light="20% 10%">
      <Sfx at={q.at("repeats")} src={SFX.click} volume={0.3} />
      <Sfx at={q.at("wrong")} src={SFX.switch} volume={0.4} />
      <div style={{ position: "absolute", top: 110, left: 200, right: 200, opacity: t }}>
        <div style={{ fontSize: 22, letterSpacing: "0.2em", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}>
          Today, on a typical listing chatbot
        </div>
        <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", marginTop: 12 }}>
          It repeats whichever number it <Serif>saw first.</Serif>
        </div>
      </div>
      <div style={{ position: "absolute", top: 400, left: 260, right: 260, display: "flex", flexDirection: "column", gap: 34 }}>
        <Bubble who="user" from={q.at("ask")}>
          How much is Kelso Villa, and how much parking?
        </Bubble>
        <Bubble who="bot" from={q.at("repeats")}>
          It's{" "}
          <Struck from={q.at("wrong")} above note="Replaced by the 16 Oct brochure">
            £700,000
          </Struck>
          , with{" "}
          <Struck from={q.at("wrong", 2)} note="The survey says 5">
            6 parking spaces
          </Struck>
          .
        </Bubble>
        <div style={{ opacity: src, fontSize: 26, color: C.red, fontWeight: 600, letterSpacing: "0.04em", marginTop: 8 }}>
          Source: ? &nbsp;·&nbsp; no document, no page, no quote
        </div>
      </div>
    </Ground>
  );
};

/* ---------- 3. Reveal ---------- */

export const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("reveal");
  const m = prog(frame, 6, 30);
  const l = prog(frame, q.at("every"), q.at("every") + 20);
  const s = prog(frame, q.at("document"), q.at("document") + 20);
  const a = prog(frame, q.at("agency"), q.at("agency") + 16);
  const r = prog(frame, q.at("renter"), q.at("renter") + 16);
  const pill = (p: number, k: string, v: string) => (
    <div
      style={{
        opacity: p,
        translate: `0px ${(1 - p) * 18}px`,
        padding: "16px 30px",
        borderRadius: 999,
        border: `1px solid ${C.brass}66`,
        background: "rgba(220,188,120,0.08)",
        fontSize: 30,
      }}
    >
      <span style={{ color: C.brass, fontWeight: 600 }}>{k}</span> · {v}
    </div>
  );
  return (
    <AbsoluteFill style={{ background: C.bgDeep, fontFamily: FONT }}>
      <Sfx at={4} src={SFX.whoosh} volume={0.45} />
      <Img
        src={staticFile("shots/home.png")}
        style={{ width: 1920, height: 1080, scale: `${interpolate(frame, [0, q.frames], [1.12, 1.0])}`, opacity: 0.55 }}
      />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(8,17,13,.55), rgba(8,17,13,.85))" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", color: C.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: m, scale: `${interpolate(m, [0, 1], [0.9, 1])}` }}>
          <BrandMark size={130} />
          <Wordmark size={120} />
        </div>
        <div style={{ marginTop: 40, fontSize: 56, fontWeight: 500, letterSpacing: "-0.02em", opacity: l, translate: `0px ${(1 - l) * 20}px` }}>
          Every property fact, <Serif>with its receipt.</Serif>
        </div>
        <div style={{ marginTop: 26, fontSize: 30, color: C.muted, opacity: s }}>
          The document · the page · the exact words
        </div>
        <div style={{ display: "flex", gap: 22, marginTop: 60 }}>
          {pill(a, "The agency", "checks the facts")}
          {pill(r, "The renter", "gets a straight answer")}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---------- Chapter cards ---------- */

export const Chapter: React.FC<{ n: string; who: string; what: string }> = ({ n, who, what }) => {
  const frame = useCurrentFrame();
  const a = prog(frame, 0, 18);
  const b = prog(frame, 10, 28);
  return (
    <Ground light="50% 50%">
      <Sfx at={0} src={SFX.whoosh} volume={0.3} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ fontSize: 30, letterSpacing: "0.3em", color: C.brass, fontWeight: 600, opacity: a }}>PART {n}</div>
        <div style={{ fontSize: 120, fontWeight: 600, letterSpacing: "-0.04em", marginTop: 16, opacity: a, translate: `0px ${(1 - a) * 30}px` }}>
          {who} <span style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 400, color: C.brass, opacity: b }}>{what}</span>
        </div>
      </AbsoluteFill>
    </Ground>
  );
};

/* ---------- Claim and end card ---------- */

export const Claim: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("claim");
  const a = prog(frame, q.at("if"), q.at("if") + 16);
  const b = prog(frame, q.at("nobody"), q.at("nobody") + 18);
  const c = prog(frame, q.at("not"), q.at("not") + 16);
  return (
    <Ground light="50% 100%">
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", textAlign: "center" }}>
        <div style={{ fontSize: 104, fontWeight: 600, letterSpacing: "-0.04em", opacity: a }}>If the documents disagree,</div>
        <div style={{ fontSize: 104, letterSpacing: "-0.02em", opacity: b, translate: `0px ${(1 - b) * 24}px` }}>
          <Serif>nobody says it out loud.</Serif>
        </div>
        <div style={{ marginTop: 40, fontSize: 40, color: C.muted, opacity: c }}>Not until a person has checked.</div>
      </AbsoluteFill>
    </Ground>
  );
};

export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const m = prog(frame, 0, 26, ease);
  const w = prog(frame, 14, 36);
  const chips = ["Reads the documents", "Catches the contradictions", "Speaks only what is verified"];
  return (
    <Ground light="50% 40%">
      <Sfx at={2} src={SFX.ding} volume={0.35} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ scale: `${interpolate(m, [0, 1], [2.2, 1])}`, rotate: `${(1 - m) * -12}deg`, opacity: m }}>
          <BrandMark size={170} />
        </div>
        <div style={{ marginTop: 30, opacity: w, translate: `0px ${(1 - w) * 20}px` }}>
          <Wordmark size={110} />
        </div>
        <div style={{ marginTop: 22, fontSize: 44, opacity: prog(frame, cues("end").at("every"), cues("end").at("every") + 18) }}>
          Every property fact, <Serif>with its receipt.</Serif>
        </div>
        <div style={{ display: "flex", gap: 18, marginTop: 50 }}>
          {chips.map((c, i) => {
            const p = prog(frame, 70 + i * 8, 86 + i * 8);
            return (
              <div
                key={c}
                style={{
                  opacity: p,
                  translate: `0px ${(1 - p) * 16}px`,
                  padding: "14px 26px",
                  borderRadius: 999,
                  border: `1px solid ${C.brass}66`,
                  fontSize: 28,
                  color: C.ink,
                  background: "rgba(220,188,120,0.07)",
                }}
              >
                {c}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 56, fontSize: 24, color: C.muted, opacity: prog(frame, 100, 120), letterSpacing: "0.06em" }}>
          Grok Bot Real Estate Hackathon · London · xAI Grok · LiveKit · Supabase · OpenStreetMap
        </div>
      </AbsoluteFill>
    </Ground>
  );
};
