import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Changelog, Compare, Decide, Upload } from "./scenes/Agency";
import { Classify, Pipeline, Results } from "./scenes/Extra";
import { Book, Call, Explore, Nearby, Property } from "./scenes/Renter";
import { Chapter, Claim, EndCard, Hook, Problem, Reveal } from "./scenes/Story";
import { VOICE, VoiceTrack } from "./ui";

export const XF = 12;

// Scene lengths come from the narration (src/voice.json, built by voice/tts.mjs).
const LIST: { id: string; name: string; el: React.ReactNode }[] = [
  { id: "hook", name: "Hook", el: <Hook /> },
  { id: "problem", name: "Problem", el: <Problem /> },
  { id: "reveal", name: "Reveal", el: <Reveal /> },
  { id: "part1", name: "Part 1", el: <Chapter n="01" who="The agency" what="checks the facts" /> },
  { id: "upload", name: "Upload", el: <Upload /> },
  { id: "compare", name: "Compare", el: <Compare /> },
  { id: "classify", name: "Classify", el: <Classify /> },
  { id: "decide", name: "Decide", el: <Decide /> },
  { id: "changelog", name: "Changelog", el: <Changelog /> },
  { id: "pipeline", name: "Pipeline", el: <Pipeline /> },
  { id: "part2", name: "Part 2", el: <Chapter n="02" who="The renter" what="gets straight answers" /> },
  { id: "explore", name: "Explore", el: <Explore /> },
  { id: "property", name: "Property", el: <Property /> },
  { id: "call", name: "Call", el: <Call /> },
  { id: "nearby", name: "Nearby", el: <Nearby /> },
  { id: "book", name: "Book", el: <Book /> },
  { id: "results", name: "Results", el: <Results /> },
  { id: "claim", name: "Claim", el: <Claim /> },
  { id: "end", name: "End", el: <EndCard /> },
];

export const SCENES = LIST.map((s) => ({
  ...s,
  d: VOICE[s.id].frames,
  el: (
    <>
      {s.el}
      <VoiceTrack id={s.id} />
    </>
  ),
}));

export const TOTAL = SCENES.reduce((a, s) => a + s.d, 0) - XF * (SCENES.length - 1);

export const DemoVideo: React.FC = () => (
  <TransitionSeries>
    {SCENES.flatMap((s, i) => [
      ...(i > 0
        ? [<TransitionSeries.Transition key={`t${i}`} presentation={fade()} timing={linearTiming({ durationInFrames: XF })} />]
        : []),
      <TransitionSeries.Sequence key={s.name} name={s.name} durationInFrames={s.d}>
        {s.el}
      </TransitionSeries.Sequence>,
    ])}
  </TransitionSeries>
);
