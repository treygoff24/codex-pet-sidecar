import { frameToPosition } from "../hooks/usePetAnimation";
import { runtimeBridge } from "../runtimeBridge";

export function PetSprite({
  spritesheetPath,
  frame,
  displayName,
}: {
  spritesheetPath?: string;
  frame: number;
  displayName: string;
}) {
  const { column, row } = frameToPosition(frame);
  const style = spritesheetPath
    ? {
        backgroundImage: `url(${runtimeBridge.petAssetUrl(spritesheetPath)})`,
        backgroundPosition: `${-column * 192}px ${-row * 208}px`,
      }
    : undefined;

  return (
    <div
      aria-label={`${displayName} pet sprite`}
      className="pet-sprite"
      style={style}
      data-frame={frame}
    >
      {!spritesheetPath ? "◕‿◕" : null}
    </div>
  );
}
