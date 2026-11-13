import { loadFont as loadSans } from "@remotion/google-fonts/InstrumentSans";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";

const sans = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const serif = loadSerif("italic", { weights: ["400"], subsets: ["latin"] });

export const FONT = sans.fontFamily;
export const SERIF = serif.fontFamily;

// Ground Truth dark "forest and brass" tokens, from client/src/app/realestate.css
export const C = {
  bg: "#0c1813",
  bgDeep: "#08110d",
  surface: "#12221b",
  surface2: "#1a2e25",
  line: "rgba(239,238,230,0.12)",
  ink: "#efeee6",
  muted: "#9fb0a6",
  brass: "#dcbc78",
  brassDeep: "#c99a4b",
  brassSoft: "#f6e8c6",
  warn: "#e8a35a",
  ok: "#7fd6a0",
  red: "#e46a5a",
  paper: "#f6f2e9",
  paperInk: "#17261f",
};

export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);

export const SFX = {
  whoosh: "https://remotion.media/whoosh.wav",
  click: "https://remotion.media/mouse-click.wav",
  ding: "https://remotion.media/ding.wav",
  page: "https://remotion.media/page-turn.wav",
  switch: "https://remotion.media/switch.wav",
  shutter: "https://remotion.media/shutter-modern.wav",
};
