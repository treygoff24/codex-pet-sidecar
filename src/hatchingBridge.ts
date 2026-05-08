/**
 * Tauri command bridge for hatching wizard operations.
 *
 * This module provides type-safe wrappers around Tauri commands for the hatching wizard,
 * following the same pattern as runtimeBridge.ts.
 */

import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type {
  HatchingSession,
  OrphanSummary,
  PetBrief,
  ReferenceImage,
  PrototypeIteration,
  RowState,
} from "./domain/hatching";

/**
 * Helper to pick a single file for reference image upload.
 */
async function pickSingleImage(opts?: { defaultPath?: string; title?: string }): Promise<string | null> {
  const result = await openDialog({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp"],
      },
    ],
    ...opts,
  });
  return typeof result === "string" ? result : null;
}

/**
 * Hatching wizard command bridge.
 */
export const hatchingBridge = {
  /**
   * Start a new hatching run.
   * Creates a new session, runtime home, and workspace directory.
   */
  startHatchingRun: (): Promise<string> => invoke("start_hatching_run"),

  /**
   * Cancel an in-progress hatching run.
   * Tears down the runtime home and deletes the workspace directory.
   */
  cancelHatchingRun: (sessionId: string): Promise<void> =>
    invoke("cancel_hatching_run", { sessionId }),

  /**
   * Get the current state of a hatching session.
   */
  getHatchingState: (sessionId: string): Promise<HatchingSession> =>
    invoke("get_hatching_state", { sessionId }),

  /**
   * Submit the pet brief for a hatching session.
   * Validates that the brief has non-empty display_name, description, and a normalized/unique pet_id.
   * If the brief changes after prototype iterations have started, invalidates the prototype state.
   */
  submitBrief: (
    sessionId: string,
    brief: PetBrief,
    archetypeId: string | null,
    referenceImageId: string | null
  ): Promise<void> =>
    invoke("submit_brief", { sessionId, brief, archetypeId, referenceImageId }),

  /**
   * Upload and validate a reference image for a hatching session.
   */
  uploadReferenceImage: (sessionId: string, localPath: string): Promise<ReferenceImage> =>
    invoke("upload_reference_image", { sessionId, localPath }),

  /**
   * List orphan hatching sessions.
   * Returns sessions that were interrupted before completion for resume banner.
   */
  listOrphanHatchingSessions: (): Promise<OrphanSummary[]> =>
    invoke("list_orphan_hatching_sessions"),

  /**
   * Describe a reference image using vision AI.
   */
  describeReferenceImage: (sessionId: string, referenceImageId: string): Promise<string> =>
    invoke("describe_reference_image", { sessionId, referenceImageId }),

  /**
   * Generate a prototype iteration.
   */
  generatePrototype: (sessionId: string, feedback: string | null): Promise<PrototypeIteration> =>
    invoke("generate_prototype", { sessionId, feedback }),

  /**
   * Revert to a specific prototype iteration.
   */
  revertToIteration: (sessionId: string, iterationN: number): Promise<void> =>
    invoke("revert_to_iteration", { sessionId, iterationN }),

  /**
   * Accept the current prototype iteration.
   */
  acceptPrototype: (sessionId: string): Promise<void> =>
    invoke("accept_prototype", { sessionId }),

  /**
   * Regenerate a specific animation row.
   */
  regenerateRow: (sessionId: string, rowKey: string): Promise<RowState> =>
    invoke("regenerate_row", { sessionId, rowKey }),

  /**
   * Import the hatched pet into the library.
   */
  importHatchedPet: (sessionId: string, activate: boolean): Promise<string> =>
    invoke("import_hatched_pet", { sessionId, activate }),

  /**
   * Archive a hatching session.
   */
  archivePet: (sessionId: string): Promise<void> =>
    invoke("archive_pet", { sessionId }),

  /**
   * Pick a reference image file.
   */
  pickReferenceImage: (opts?: { defaultPath?: string }): Promise<string | null> =>
    pickSingleImage({
      title: "Choose a reference image",
      defaultPath: opts?.defaultPath,
    }),
};