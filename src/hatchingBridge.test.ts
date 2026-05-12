import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PetBrief } from "./domain/hatching";

const dialogMock = vi.hoisted(() => ({
  open: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: dialogMock.open,
}));

import { invoke } from "@tauri-apps/api/core";
import { hatchingBridge } from "./hatchingBridge";

const invokeMock = vi.mocked(invoke);

const brief: PetBrief = {
  displayName: "Moss",
  petId: "moss",
  description: "A small mossy watcher",
  personality: ["quiet", "observant"],
  palette: null,
  backstory: null,
  speechStyle: null,
  behavioralQuirks: null,
  visualNotes: null,
};

describe("hatchingBridge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    dialogMock.open.mockReset();
  });

  it("archives pets using petId payload casing", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await hatchingBridge.archivePet("olive");
    expect(invokeMock).toHaveBeenCalledWith("archive_pet", { petId: "olive" });
  });

  it("wraps confirm_brief_change with session, brief, and archetype", async () => {
    invokeMock.mockResolvedValueOnce({
      invalidatesIterations: true,
      requiresConfirmation: false,
    });
    await hatchingBridge.confirmBriefChange("session-1", brief, "cozy-sleeper");
    expect(invokeMock).toHaveBeenCalledWith("confirm_brief_change", {
      sessionId: "session-1",
      brief,
      archetypeId: "cozy-sleeper",
    });
  });

  it("wraps prompt review commands with stable invoke names", async () => {
    const drafts = [
      {
        rowKey: "idle" as const,
        label: "base · idle",
        prompt: "base prompt",
        derivedFrom: null,
        editable: true,
      },
    ];
    invokeMock.mockResolvedValueOnce(drafts).mockResolvedValueOnce(undefined);

    await expect(hatchingBridge.draftPromptReview("session-1")).resolves.toBe(drafts);
    await hatchingBridge.savePromptDrafts("session-1", drafts);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "draft_prompt_review", {
      sessionId: "session-1",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_prompt_drafts", {
      sessionId: "session-1",
      drafts,
    });
  });

  it("wraps resume_hatching_run by session id", async () => {
    invokeMock.mockResolvedValueOnce({ id: "session-1" });
    await hatchingBridge.resumeHatchingRun("session-1");
    expect(invokeMock).toHaveBeenCalledWith("resume_hatching_run", {
      sessionId: "session-1",
    });
  });

  it("wraps preview_pet_id by display name", async () => {
    invokeMock.mockResolvedValueOnce({
      petId: "moss",
      available: true,
      suggestion: null,
    });
    await hatchingBridge.previewPetId("Moss");
    expect(invokeMock).toHaveBeenCalledWith("preview_pet_id", {
      displayName: "Moss",
    });
  });
});
