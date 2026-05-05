import { forwardRef } from "react";
import { runtimeBridge } from "../runtimeBridge";

export const PetSprite = forwardRef<
  HTMLDivElement,
  { spritesheetPath?: string; displayName: string }
>(function PetSprite({ spritesheetPath, displayName }, ref) {
  const style = spritesheetPath
    ? { backgroundImage: `url(${runtimeBridge.petAssetUrl(spritesheetPath)})` }
    : undefined;

  return (
    <>
      <div ref={ref} aria-label={`${displayName} pet sprite`} className="pet-sprite" style={style}>
        {!spritesheetPath ? "◕‿◕" : null}
      </div>
      <div className="pet-shadow" aria-hidden />
    </>
  );
});
