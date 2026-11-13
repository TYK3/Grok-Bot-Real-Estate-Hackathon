import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, SFX } from "../theme";
import { Caption, Cursor, Ground, Ring, Serif, Shot, SideTag, Sfx, cues, prog } from "../ui";

/* ---------- Explore: 58 homes on a live map ---------- */

export const Explore: React.FC = () => {
  const q = cues("explore");
  const map = q.at("map");
  return (
    <Ground>
      <SideTag text="For renters and buyers · the website" />
      <Shot
        src="shots/explore.png"
        imgW={1920}
        imgH={1080}
        url="localhost:3000/explore"
        keys={[
          { at: 0, cx: 960, cy: 540, zoom: 1 },
          { at: map - 40, cx: 960, cy: 540, zoom: 1 },
          { at: map + 30, cx: 1370, cy: 700, zoom: 1.5 },
          { at: q.frames, cx: 1370, cy: 700, zoom: 1.55 },
        ]}
      >
        <Ring x={184} y={120} w={490} h={64} from={q.at("filter")} to={map - 40} />
        <Ring x={1010} y={330} w={725} h={750} from={map + 20} radius={20} />
      </Shot>
      <Caption text="58 East London homes · filters · shortlist · live map" from={q.at("browse")} />
    </Ground>
  );
};

/* ---------- Property: only verified facts are shown ---------- */

const Popover: React.FC<{ from: number; to: number }> = ({ from, to }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 12) * (1 - prog(frame, to, to + 10));
  return (
    <div
      style={{
        position: "absolute",
        left: 780,
        top: 960,
        width: 520,
        padding: "18px 22px",
        borderRadius: 14,
        background: C.paper,
        color: C.paperInk,
        boxShadow: "0 20px 50px rgba(0,0,0,.45)",
        opacity: p,
        scale: `${interpolate(p, [0, 1], [0.92, 1])}`,
        transformOrigin: "0 50%",
        fontSize: 20,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontSize: 14, letterSpacing: "0.14em", color: "#8a6420", fontWeight: 700 }}>SOURCE</div>
      <div style={{ fontWeight: 700, fontSize: 24 }}>£600,000 · verified</div>
      <div>Sales particulars · Carter Jonas</div>
      <div style={{ color: "#5b6b62" }}>16 October 2026 · page 2</div>
    </div>
  );
};

export const Property: React.FC = () => {
  const q = cues("property");
  const tap = q.at("tap");
  const park = q.at("parkings");
  return (
    <Ground>
      <SideTag text="For renters and buyers · the website" />
      <Sfx at={tap} src={SFX.click} volume={0.35} />
      <Shot
        src="shots/kelso.png"
        imgW={1920}
        imgH={2600}
        url="localhost:3000/property/kelso-villa"
        keys={[
          { at: 0, cx: 960, cy: 500, zoom: 1 },
          { at: q.at("verified") - 30, cx: 960, cy: 500, zoom: 1 },
          { at: q.at("verified") + 30, cx: 780, cy: 1130, zoom: 1.6 },
          { at: q.frames, cx: 780, cy: 1180, zoom: 1.65 },
        ]}
      >
        <Ring x={1208} y={131} w={358} h={378} from={12} to={q.at("verified") - 30} />
        <Ring x={352} y={983} w={407} h={71} from={tap - 20} color={C.ok} dim={false} />
        <Ring x={352} y={1302} w={407} h={71} from={park} color={C.warn} dim={false} />
        <Cursor path={[{ at: tap - 30, x: 700, y: 1100 }, { at: tap - 4, x: 620, y: 1018 }]} clicks={[tap]} size={30} />
        <Popover from={tap + 4} to={park - 10} />
      </Shot>
      <Caption n="✓" text="Verified facts only, each with its document and page" from={q.at("verified")} to={park - 6} />
      <Caption n="…" text='Parking is disputed, so it says "Under review"' from={park} />
    </Ground>
  );
};

/* ---------- Call: Haven answers from the verified record, with receipts ---------- */

const Line: React.FC<{ who: "you" | "haven"; from: number; text: string; dur?: number; children?: React.ReactNode }> = ({
  who,
  from,
  text,
  dur,
  children,
}) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 12);
  const shown = dur ? text.slice(0, Math.max(0, Math.ceil(((frame - from) / dur) * text.length))) : text;
  const you = who === "you";
  return (
    <div style={{ opacity: p, translate: `0px ${(1 - p) * 16}px`, display: "flex", flexDirection: "column", alignItems: you ? "flex-end" : "flex-start" }}>
      <div style={{ fontSize: 18, letterSpacing: "0.14em", color: you ? C.muted : C.brass, fontWeight: 600, marginBottom: 8 }}>
        {you ? "YOU" : "HAVEN"}
      </div>
      <div
        style={{
          maxWidth: 860,
          padding: "20px 28px",
          borderRadius: 22,
          background: you ? "rgba(255,255,255,0.06)" : "rgba(220,188,120,0.12)",
          border: `1px solid ${you ? C.line : C.brass + "55"}`,
          fontSize: 34,
          lineHeight: 1.35,
          fontWeight: 500,
          minHeight: 46,
        }}
      >
        {shown}
      </div>
      {children}
    </div>
  );
};

const Receipt: React.FC<{ from: number }> = ({ from }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 14);
  return (
    <div
      style={{
        marginTop: 14,
        opacity: p,
        scale: `${interpolate(p, [0, 1], [0.9, 1])}`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 20px",
        borderRadius: 12,
        background: C.paper,
        color: C.paperInk,
        fontSize: 22,
        fontWeight: 600,
        boxShadow: "0 12px 30px rgba(0,0,0,.35)",
      }}
    >
      <span style={{ background: "#e46a5a", color: "#fff", fontSize: 13, padding: "4px 7px", borderRadius: 5 }}>PDF</span>
      Sales particulars · Carter Jonas · 16 Oct 2026 · page 2
    </div>
  );
};

export const Call: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("call");
  const enter = prog(frame, 0, 20);
  const talking = [2, 5].some((i) => frame >= q.seg(i) && frame <= q.end(i));
  const pulse = talking ? 0.5 + 0.5 * Math.sin(frame * 0.5) : 0;
  return (
    <Ground light="25% 50%">
      <SideTag text="For renters and buyers · the Grok voice agent" />
      <Sfx at={q.end(5) - 10} src={SFX.ding} volume={0.3} />
      {/* agent side */}
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 130,
          width: 560,
          height: 820,
          borderRadius: 28,
          background: C.surface,
          border: `1px solid ${C.line}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: enter,
        }}
      >
        <div
          style={{
            width: 300,
            height: 300,
            borderRadius: 150,
            border: `2px solid ${C.brass}${talking ? "cc" : "55"}`,
            boxShadow: `0 0 ${30 + pulse * 60}px ${C.brass}${talking ? "66" : "22"}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scale: `${1 + pulse * 0.03}`,
          }}
        >
          <div style={{ width: 230, height: 230, borderRadius: 115, overflow: "hidden", position: "relative" }}>
            <Img
              src={staticFile("shots/haven.png")}
              style={{ position: "absolute", width: 1920 * 1.8, height: 1080 * 1.8, left: -(542 * 1.8 - 115), top: -(665 * 1.8 - 115) }}
            />
          </div>
        </div>
        <div style={{ marginTop: 44, fontSize: 52, fontWeight: 600, letterSpacing: "-0.02em" }}>
          Haven<span style={{ color: C.brass }}>.</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 24, color: C.muted }}>AI agent · xAI Grok voice</div>
        <div style={{ display: "flex", gap: 7, marginTop: 40, height: 60, alignItems: "center" }}>
          {Array.from({ length: 18 }).map((_, i) => {
            const h = talking ? 10 + Math.abs(Math.sin(frame * 0.35 + i * 0.9)) * 46 : 8;
            return <div key={i} style={{ width: 7, height: h, borderRadius: 4, background: C.brass, opacity: 0.85 }} />;
          })}
        </div>
        <div style={{ marginTop: 40, fontSize: 22, color: C.muted, padding: "10px 20px", borderRadius: 999, border: `1px solid ${C.line}` }}>
          On a call about <b style={{ color: C.ink }}>Kelso Villa</b>
        </div>
      </div>
      {/* transcript */}
      <div style={{ position: "absolute", left: 740, right: 110, top: 150, display: "flex", flexDirection: "column", gap: 30 }}>
        <Line who="you" from={q.seg(1)} text="How many parking spaces are there?" />
        <Line who="haven" from={q.seg(2)} dur={q.end(2) - q.seg(2)} text="The parking allocation is being confirmed at the moment." />
        <Line who="you" from={q.seg(4)} text="What's the asking price, and where does that come from?" />
        <Line who="haven" from={q.seg(5)} dur={q.end(5) - q.seg(5)} text="£600,000, per the Carter Jonas particulars dated 16 October 2026, page 2.">
          <Receipt from={q.at("page")} />
        </Line>
      </div>
      <div style={{ position: "absolute", right: 110, top: 34, fontSize: 18, color: C.muted, letterSpacing: "0.08em", opacity: enter }}>
        DRAMATISED CALL · ANSWERS FROM THE AGENT'S RECORDED TESTS
      </div>
      <Caption text="xAI speech recognition · Grok · xAI voice, on LiveKit" from={q.at("runs")} to={q.seg(1) - 6} />
      <Caption text={<>No number it can't back up</>} from={q.at("number")} to={q.seg(4) - 6} />
      <Caption text={<>The receipt, <Serif>said out loud</Serif></>} from={q.seg(6)} />
    </Ground>
  );
};

/* ---------- Nearby: find homes by what is around them ---------- */

const Said: React.FC<{ from: number; to?: number; text: string }> = ({ from, to = 99999, text }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 14) * (1 - prog(frame, to, to + 12));
  return (
    <div style={{ position: "absolute", top: 6, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: p, zIndex: 5 }}>
      <div
        style={{
          padding: "18px 30px",
          borderRadius: 999,
          background: C.brass,
          color: C.paperInk,
          fontSize: 32,
          fontWeight: 600,
          boxShadow: "0 18px 40px rgba(0,0,0,.45)",
          translate: `0px ${(1 - p) * -16}px`,
        }}
      >
        🎙 “{text}”
      </div>
    </div>
  );
};

export const Nearby: React.FC = () => {
  const q = cues("nearby");
  const ranks = q.at("ranks");
  return (
    <Ground>
      <SideTag text="For renters and buyers · general search call" />
      <Sfx at={ranks} src={SFX.whoosh} volume={0.25} />
      <Shot
        src="shots/haven.png"
        imgW={1920}
        imgH={1080}
        url="localhost:3000/haven"
        keys={[
          { at: 0, cx: 960, cy: 560, zoom: 1 },
          { at: ranks - 30, cx: 960, cy: 560, zoom: 1 },
          { at: ranks + 30, cx: 1180, cy: 520, zoom: 1.75 },
          { at: q.frames, cx: 1180, cy: 520, zoom: 1.8 },
        ]}
      >
        <Ring x={753} y={93} w={812} h={42} from={q.seg(1)} to={ranks - 30} radius={24} />
        <Ring x={781} y={294} w={411} h={704} from={ranks + 20} color={C.brass} />
        <Ring x={1209} y={294} w={326} h={62} from={q.at("pins")} color={C.ok} dim={false} />
      </Shot>
      <Said from={q.seg(1)} to={q.end(1) + 30} text="Find me a 2-bed near a park, under £2,500 a month" />
      <Caption n="🗺" text="126 parks · 79 supermarkets · 63 stations, from OpenStreetMap" from={q.at("checks")} to={ranks - 6} />
      <Caption n="🗺" text="Ranked by walking time, pinned on the live map" from={ranks} />
    </Ground>
  );
};

/* ---------- Book: viewings and reservations by voice ---------- */

export const Book: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("book");
  const card = prog(frame, q.seg(2), q.seg(2) + 20);
  const ask = prog(frame, q.seg(1), q.seg(1) + 14) * (1 - prog(frame, q.end(2), q.end(2) + 12));
  const reply = prog(frame, q.seg(2), q.seg(2) + 14) * (1 - prog(frame, q.end(2), q.end(2) + 12));
  const bubble = (p: number, text: string, haven = false) => (
    <div
      style={{
        opacity: p,
        padding: "16px 28px",
        borderRadius: 999,
        background: haven ? C.surface2 : C.brass,
        color: haven ? C.ink : C.paperInk,
        border: haven ? `1px solid ${C.brass}88` : "none",
        fontSize: 30,
        fontWeight: 600,
        boxShadow: "0 18px 40px rgba(0,0,0,.45)",
      }}
    >
      {text}
    </div>
  );
  return (
    <Ground>
      <SideTag text="Booked by voice · market dashboard" />
      <Sfx at={q.seg(2) + 6} src={SFX.ding} volume={0.35} />
      <Shot
        src="shots/market.png"
        imgW={1920}
        imgH={1600}
        url="localhost:3000/market"
        keys={[
          { at: 0, cx: 960, cy: 420, zoom: 1 },
          { at: q.seg(1) - 20, cx: 960, cy: 420, zoom: 1 },
          { at: q.seg(2) - 6, cx: 960, cy: 1200, zoom: 1.35 },
          { at: q.frames, cx: 960, cy: 1200, zoom: 1.4 },
        ]}
      >
        <Ring x={352} y={225} w={1215} h={125} from={10} to={q.seg(1) - 20} />
        {/* the booking that the voice call just made lands in the empty slot */}
        <div
          style={{
            position: "absolute",
            left: 377,
            top: 1187,
            width: 1166,
            height: 83,
            borderRadius: 12,
            background: "#1d3328",
            border: `2px solid ${C.ok}`,
            display: "flex",
            alignItems: "center",
            gap: 22,
            padding: "0 24px",
            fontSize: 20,
            opacity: card,
            translate: `0px ${(1 - card) * 30}px`,
            color: C.ink,
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 20, background: C.ok, color: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>✓</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>Viewing booked · Flat in London</div>
            <div style={{ color: C.muted, fontSize: 16 }}>Booked by voice through Haven · example</div>
          </div>
          <div style={{ color: C.brass, fontWeight: 600 }}>Sat · 10:30</div>
        </div>
      </Shot>
      <div style={{ position: "absolute", top: 70, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        {bubble(ask, "🎙 “Can I view the first one on Saturday morning?”")}
        {bubble(reply, "Haven: “Of course. You're booked in for Saturday at 10:30.”", true)}
      </div>
      <Caption text="Market data at a glance: 58 homes, median £2,750 pcm" from={10} to={q.seg(1) - 10} />
      <Caption text="Viewings and holds by voice. No card details, ever" from={q.at("card")} to={q.at("dashboard") - 6} />
      <Caption text="Every booking lands on the market dashboard" from={q.at("dashboard")} />
    </Ground>
  );
};
