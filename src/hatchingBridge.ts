import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type {
  BriefSubmitOutcome,
  HatchingSession,
  OrphanSummary,
  PetBrief,
  PetIdPreview,
  PromptDraft,
  ReferenceImage,
  PrototypeIteration,
  RowKey,
  RowState,
} from "./domain/hatching";

async function pickSingleImage(opts?: {
  defaultPath?: string;
  title?: string;
}): Promise<string | null> {
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

export const hatchingBridge = {
  /** Creates a new session, runtime home, and workspace directory. */
  startHatchingRun: (): Promise<string> => invoke<string>("start_hatching_run"),

  /** Tears down the runtime home and deletes the workspace directory. */
  cancelHatchingRun: (sessionId: string): Promise<void> =>
    invoke<void>("cancel_hatching_run", { sessionId }),

  /** Get the current state of a hatching session. */
  getHatchingState: (sessionId: string): Promise<HatchingSession> =>
    invoke<HatchingSession>("get_hatching_state", { sessionId }),

  /**
   * Validates the brief and normalizes the pet_id; invalidates prototype state if the
   * brief changes after iterations have started.
   */
  submitBrief: (
    sessionId: string,
    brief: PetBrief,
    archetypeId: string | null,
    referenceImageId: string | null,
  ): Promise<BriefSubmitOutcome> =>
    invoke<BriefSubmitOutcome>("submit_brief", { sessionId, brief, archetypeId, referenceImageId }),

  /** Confirm a brief change that invalidates existing prototype iterations. */
  confirmBriefChange: (
    sessionId: string,
    brief: PetBrief,
    archetypeId: string | null,
  ): Promise<BriefSubmitOutcome> =>
    invoke<BriefSubmitOutcome>("confirm_brief_change", { sessionId, brief, archetypeId }),

  /** Draft/editable animation prompts before the prototype gate. */
  draftPromptReview: (sessionId: string): Promise<PromptDraft[]> =>
    invoke<PromptDraft[]>("draft_prompt_review", { sessionId }),

  /** Persist reviewed animation prompts and move to prototype generation. */
  savePromptDrafts: (sessionId: string, drafts: PromptDraft[]): Promise<void> =>
    invoke<void>("save_prompt_drafts", { sessionId, drafts }),

  /** Upload and validate a reference image for a hatching session. */
  uploadReferenceImage: (sessionId: string, localPath: string): Promise<ReferenceImage> =>
    invoke<ReferenceImage>("upload_reference_image", { sessionId, localPath }),

  /** Returns interrupted sessions eligible for the resume banner. */
  listOrphanHatchingSessions: (): Promise<OrphanSummary[]> =>
    invoke<OrphanSummary[]>("list_orphan_hatching_sessions"),

  /** Reattach to an interrupted hatching session and show the wizard window. */
  resumeHatchingRun: (sessionId: string): Promise<HatchingSession> =>
    invoke<HatchingSession>("resume_hatching_run", { sessionId }),

  /** Describe a reference image using vision AI. */
  describeReferenceImage: (sessionId: string, referenceImageId: string): Promise<string> =>
    invoke<string>("describe_reference_image", { sessionId, referenceImageId }),

  /** Generate a prototype iteration. */
  generatePrototype: (sessionId: string, feedback: string | null): Promise<PrototypeIteration> =>
    invoke<PrototypeIteration>("generate_prototype", { sessionId, feedback }),

  /** Revert to a specific prototype iteration. */
  revertToIteration: (sessionId: string, iterationN: number): Promise<void> =>
    invoke<void>("revert_to_iteration", { sessionId, iterationN }),

  /** Accept the current prototype iteration. */
  acceptPrototype: (sessionId: string): Promise<void> =>
    invoke<void>("accept_prototype", { sessionId }),

  /** Regenerate a specific animation row. */
  regenerateRow: (sessionId: string, rowKey: RowKey): Promise<RowState> =>
    invoke<RowState>("regenerate_row", { sessionId, rowKey }),

  /** Import the hatched pet into the library. */
  importHatchedPet: (sessionId: string, activate: boolean): Promise<string> =>
    invoke<string>("import_hatched_pet", { sessionId, activate }),

  /** Preview normalized pet ID availability for a display name. */
  previewPetId: (displayName: string): Promise<PetIdPreview> =>
    invoke<PetIdPreview>("preview_pet_id", { displayName }),

  /** Archive an installed pet package. */
  archivePet: (petId: string): Promise<void> => invoke<void>("archive_pet", { petId }),

  /** Pick a reference image file from disk. */
  pickReferenceImage: (opts?: { defaultPath?: string }): Promise<string | null> =>
    pickSingleImage({
      title: "Choose a reference image",
      defaultPath: opts?.defaultPath,
    }),
};
