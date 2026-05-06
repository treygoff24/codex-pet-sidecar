import { useEffect } from "react";
import { isTuckActive, type PetConfig } from "../domain/petConfig";
import type { RuntimeSession } from "../domain/runtimeEvents";

/**
 * Schedule a debounced runtime restart whenever `appliedConfig` changes in a
 * way that genuinely needs a fresh Codex thread.
 *
 * Restart-relevant fields: `petId`, `tuck.tucked`/`tuckedUntil`,
 * `runtime.safetyMode`, `runtime.sessionPersistence`, `workspaceCwd`.
 * Persona, displayName, observer toggles, ambient settings, and mute state
 * are intentionally excluded — they take effect on the next natural restart
 * and shouldn't kill an in-flight conversation.
 *
 * Pass `appliedConfig` (the post-save mirror), not `config` (the optimistic
 * UI state). The two-state split keeps restart sequencing strictly off save
 * resolution, independent of disk-write latency.
 */
export function useRuntimeRestart(
  appliedConfig: PetConfig | null,
  startPetRuntime: () => Promise<RuntimeSession>,
  onError: (caught: unknown) => void,
  debounceMs = 400,
) {
  useEffect(() => {
    if (!appliedConfig?.petId || isTuckActive(appliedConfig.tuck)) return;
    const handle = setTimeout(() => {
      startPetRuntime().catch(onError);
    }, debounceMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appliedConfig?.petId,
    appliedConfig?.tuck?.tucked,
    appliedConfig?.tuck?.tuckedUntil,
    appliedConfig?.runtime?.safetyMode,
    appliedConfig?.runtime?.sessionPersistence,
    appliedConfig?.workspaceCwd,
    debounceMs,
    startPetRuntime,
    onError,
  ]);
}
