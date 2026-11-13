import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { C, SFX } from "../theme";
import { Caption, Cursor, Ground, Ring, Shot, SideTag, Sfx, cues, prog } from "../ui";

/* ---------- Upload: drop the brochures into the review workbench ---------- */

const FileChip: React.FC<{ name: string; from: number; y: number }> = ({ name, from, y }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 26);
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - 190,
        top: interpolate(p, [0, 1], [-120, y]),
        width: 380,
        padding: "14px 18px",
        borderRadius: 12,
        background: "#fff",
        color: C.paperInk,
        fontSize: 17,
        fontWeight: 600,
        boxShadow: "0 16px 40px rgba(0,0,0,.25)",
        opacity: p * (1 - prog(frame, from + 50, from + 62)),
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div style={{ background: "#e46a5a", color: "#fff", fontSize: 13, padding: "4px 7px", borderRadius: 5 }}>PDF</div>
      {name}
    </div>
  );
};

const Badge: React.FC<{ from: number; children: React.ReactNode }> = ({ from, children }) => {
  const frame = useCurrentFrame();
  const p = prog(frame, from, from + 14);
  return (
    <div
      style={{
        position: "absolute",
        left: 960 - 230,
        top: 276,
        width: 460,
        textAlign: "center",
        padding: "10px 0",
        borderRadius: 999,
        background: C.brass,
        color: C.paperInk,
        fontSize: 19,
        fontWeight: 700,
        opacity: p,
        scale: `${interpolate(p, [0, 1], [0.85, 1])}`,
      }}
    >
      {children}
    </div>
  );
};

export const Upload: React.FC = () => {
  const q = cues("upload");
  const drop = q.at("drops");
  return (
    <Ground>
      <SideTag text="For the agency · review workbench" />
      <Sfx at={drop} src={SFX.click} />
      <Shot
        src="shots/review.png"
        imgW={1920}
        imgH={1200}
        url="localhost:3000/review"
        keys={[
          { at: 0, cx: 960, cy: 400, zoom: 1 },
          { at: q.at("workbench"), cx: 960, cy: 400, zoom: 1 },
          { at: q.at("workbench") + 50, cx: 960, cy: 470, zoom: 1.45 },
          { at: q.frames, cx: 960, cy: 470, zoom: 1.5 },
        ]}
      >
        <Ring x={615} y={325} w={690} h={278} from={q.at("workbench")} />
        <FileChip name="Kelso Villa · To Let · Apr 2026" from={q.at("brochures")} y={372} />
        <FileChip name="Measured survey · Sept 2026" from={q.at("surveys")} y={424} />
        <FileChip name="Kelso Villa · For Sale · Oct 2026" from={q.at("price")} y={476} />
        <Badge from={q.at("ocr")}>Scanned pages → OCR in the browser</Badge>
        <Cursor path={[{ at: drop - 34, x: 1200, y: 760 }, { at: drop - 4, x: 960, y: 542 }]} clicks={[drop]} />
      </Shot>
      <Caption n="1" text="Drop in brochures, surveys and price instructions" from={14} to={q.at("even") - 6} />
      <Caption n="1" text="Scanned PDFs too: PDF, JSON, ZIP, CSV or text" from={q.at("even")} />
    </Ground>
  );
};

/* ---------- Compare: every fact keeps its receipt ---------- */

export const Compare: React.FC = () => {
  const q = cues("compare");
  const zoom = q.at("every");
  return (
    <Ground>
      <SideTag text="For the agency · review workbench" />
      <Sfx at={zoom} src={SFX.whoosh} volume={0.25} />
      <Shot
        src="shots/review_case.png"
        imgW={1920}
        imgH={1500}
        url="localhost:3000/review · Kelso Villa"
        keys={[
          { at: 0, cx: 960, cy: 300, zoom: 1 },
          { at: zoom - 10, cx: 960, cy: 300, zoom: 1 },
          { at: zoom + 60, cx: 940, cy: 620, zoom: 1.55 },
          { at: q.at("heres"), cx: 940, cy: 620, zoom: 1.55 },
          { at: q.at("heres") + 45, cx: 940, cy: 820, zoom: 1.8 },
          { at: q.frames, cx: 940, cy: 820, zoom: 1.85 },
        ]}
      >
        <Ring x={113} y={247} w={1693} h={86} from={q.at("seventyeight")} to={zoom - 12} />
        <Ring x={558} y={573} w={769} h={91} from={zoom + 40} to={q.at("heres")} />
        <Ring x={558} y={680} w={379} h={364} from={q.at("april", 1)} color={C.ok} />
        <Ring x={949} y={680} w={378} h={364} from={q.at("october")} color={C.warn} dim={false} />
      </Shot>
      <Caption n="2" text="78 facts · 10 differences · 6 need a person" from={q.at("seventyeight")} to={zoom - 8} />
      <Caption n="3" text="Every fact keeps its issuer, date, page and exact quote" from={zoom} to={q.at("heres") - 6} />
      <Caption n="4" text="Price: April's £700,000 against October's £600,000" from={q.at("heres")} />
    </Ground>
  );
};

/* ---------- Decide: a person confirms; nothing material auto-publishes ---------- */

export const Decide: React.FC = () => {
  const frame = useCurrentFrame();
  const q = cues("decide");
  const click = q.at("confirms");
  const stamp = prog(frame, click + 6, click + 20);
  return (
    <Ground>
      <SideTag text="For the agency · review workbench" />
      <Sfx at={click} src={SFX.click} />
      <Sfx at={click + 8} src={SFX.ding} volume={0.4} />
      <Shot
        src="shots/review_case.png"
        imgW={1920}
        imgH={1500}
        url="localhost:3000/review · Kelso Villa"
        keys={[
          { at: 0, cx: 1580, cy: 870, zoom: 2.2 },
          { at: q.at("never") - 20, cx: 1580, cy: 870, zoom: 2.2 },
          { at: q.at("never") + 40, cx: 1580, cy: 1130, zoom: 2.2 },
          { at: q.frames, cx: 1580, cy: 1130, zoom: 2.25 },
        ]}
      >
        <Ring x={1377} y={787} w={411} h={131} from={q.at("recommendation")} to={q.at("newer") - 4} />
        <Ring x={1377} y={1019} w={411} h={52} from={q.at("newer")} to={q.at("never") - 10} color={C.ok} />
        <Cursor path={[{ at: click - 50, x: 1700, y: 1220 }, { at: click - 8, x: 1600, y: 1284 }]} clicks={[click]} size={26} />
        <div
          style={{
            position: "absolute",
            left: 1377,
            top: 1250,
            width: 411,
            padding: "8px 0",
            textAlign: "center",
            borderRadius: 12,
            border: `4px solid #2f8a55`,
            color: "#1f6b40",
            background: "rgba(232,246,236,.96)",
            fontSize: 22,
            fontWeight: 700,
            rotate: "-3deg",
            opacity: stamp,
            scale: `${interpolate(stamp, [0, 1], [1.6, 1])}`,
          }}
        >
          ✓ Confirmed by a person
        </div>
      </Shot>
      <Caption n="5" text="The engine recommends the newer brochure, and says why" from={q.at("recommendation")} to={q.at("never") - 6} />
      <Caption n="6" text="A person confirms, picks another source, or holds it" from={q.at("never")} />
    </Ground>
  );
};

/* ---------- Changelog: what changed, and why ---------- */

export const Changelog: React.FC = () => {
  const q = cues("changelog");
  const still = q.at("still");
  const changed = q.at("changed");
  return (
    <Ground>
      <SideTag text="Published · public fact checks" />
      <Sfx at={still} src={SFX.whoosh} volume={0.25} />
      <Shot
        src="shots/facts.png"
        imgW={1920}
        imgH={2000}
        url="localhost:3000/facts"
        keys={[
          { at: 0, cx: 960, cy: 420, zoom: 1.05 },
          { at: still - 40, cx: 960, cy: 420, zoom: 1.05 },
          { at: still + 10, cx: 800, cy: 640, zoom: 1.45 },
          { at: changed - 20, cx: 800, cy: 640, zoom: 1.45 },
          { at: changed + 30, cx: 800, cy: 1500, zoom: 1.45 },
          { at: q.frames, cx: 800, cy: 1500, zoom: 1.5 },
        ]}
      >
        <Ring x={1204} y={398} w={299} h={553} from={q.at("versioned")} to={still - 40} />
        <Ring x={416} y={466} w={755} h={347} from={still + 10} to={changed - 20} color={C.warn} />
        <Ring x={416} y={1316} w={755} h={367} from={changed + 30} color={C.ok} />
      </Shot>
      <Caption n="7" text="One versioned record per home, saved to Supabase" from={q.at("versioned")} to={still - 30} />
      <Caption text="Still disputed? Parking stays off the listing" from={still} to={changed - 10} />
      <Caption text="Corrected facts show before, after, and who checked" from={changed} />
    </Ground>
  );
};
