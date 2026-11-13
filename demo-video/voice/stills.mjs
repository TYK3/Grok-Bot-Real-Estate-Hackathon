// node voice/stills.mjs <outDir> [fractions]  — one still per scene at given fractions
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";
const out = process.argv[2];
const fr = (process.argv[3] || "0.3,0.75").split(",").map(Number);
const only = process.argv[4] ? process.argv[4].split(",") : null;
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const voice = JSON.parse(fs.readFileSync("src/voice.json", "utf8"));
const ids = ["Hook","Problem","Reveal","Part1","Upload","Compare","Classify","Decide","Changelog","Pipeline","Part2","Explore","Property","Call","Nearby","Book","Results","Claim","End"];
for (const id of ids) {
  if (only && !only.includes(id)) continue;
  const comp = await selectComposition({ serveUrl, id });
  for (const f of fr) {
    const frame = Math.min(comp.durationInFrames - 1, Math.round(comp.durationInFrames * f));
    await renderStill({ composition: comp, serveUrl, frame, output: path.join(out, `${id}_${f}.jpg`), imageFormat: "jpeg", scale: 0.5 });
  }
  console.log(id, comp.durationInFrames);
}
