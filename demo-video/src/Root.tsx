import { Composition, Folder } from "remotion";
import { DemoVideo, SCENES, TOTAL } from "./Video";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="GroundTruthDemo" component={DemoVideo} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    <Folder name="Scenes">
      {SCENES.map((s) => (
        <Composition
          key={s.name}
          id={s.name.replace(/\s/g, "")}
          component={() => <>{s.el}</>}
          durationInFrames={s.d}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}
    </Folder>
  </>
);
