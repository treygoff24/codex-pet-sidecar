/**
 * Tests for hatching domain types.
 */

import {
  type HatchingPhase,
  type HatchingSession,
  type PetBrief,
  type ReferenceImage,
  type RowState,
  isPhaseGenerating,
  isPhaseDone,
  getPhaseDisplayName,
} from "../hatching";

describe("hatching domain types", () => {
  describe("HatchingPhase type guards", () => {
    it("should identify generating phase", () => {
      const phase: HatchingPhase = {
        generating: {
          rowsCompleted: 5,
          rowsTotal: 8,
          estimatedRemaining: 30000,
          totalImagegenCalls: 5,
        },
      };
      expect(isPhaseGenerating(phase)).toBe(true);
      expect(isPhaseDone(phase)).toBe(false);
    });

    it("should identify done phase", () => {
      const phase: HatchingPhase = {
        done: { petId: "test-pet" },
      };
      expect(isPhaseGenerating(phase)).toBe(false);
      expect(isPhaseDone(phase)).toBe(true);
    });

    it("should identify simple string phases", () => {
      const phase: HatchingPhase = "inspiration";
      expect(isPhaseGenerating(phase)).toBe(false);
      expect(isPhaseDone(phase)).toBe(false);
    });
  });

  describe("getPhaseDisplayName", () => {
    it("should return display name for string phases", () => {
      expect(getPhaseDisplayName("inspiration")).toBe("inspiration");
      expect(getPhaseDisplayName("brief")).toBe("brief");
    });

    it("should return display name for generating phase", () => {
      const phase: HatchingPhase = {
        generating: {
          rowsCompleted: 5,
          rowsTotal: 8,
          estimatedRemaining: 30000,
          totalImagegenCalls: 5,
        },
      };
      expect(getPhaseDisplayName(phase)).toBe("Generating");
    });

    it("should return display name for done phase", () => {
      const phase: HatchingPhase = {
        done: { petId: "test-pet" },
      };
      expect(getPhaseDisplayName(phase)).toBe("Done");
    });
  });

  describe("HatchingSession structure", () => {
    it("should create valid session structure", () => {
      const session: HatchingSession = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        runtimeHome: "/path/to/runtime",
        workspace: "/path/to/workspace",
        codexThreadId: null,
        brief: null,
        archetype: null,
        referenceImage: null,
        prototype: null,
        rows: {} as Record<string, RowState>,
        promptDrafts: [],
        runtimeFeed: [],
        atlasReview: null,
        phase: "inspiration",
        createdAt: "2024-01-01T00:00:00Z",
      };

      expect(session.id).toBeDefined();
      expect(session.phase).toBe("inspiration");
      expect(session.brief).toBeNull();
    });

    it("should create session with brief", () => {
      const brief: PetBrief = {
        displayName: "Test Pet",
        petId: "test-pet",
        description: "A test pet",
        personality: ["friendly", "curious"],
        palette: null,
        backstory: null,
        speechStyle: null,
        behavioralQuirks: null,
        visualNotes: null,
      };

      const session: HatchingSession = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        runtimeHome: "/path/to/runtime",
        workspace: "/path/to/workspace",
        codexThreadId: null,
        brief,
        archetype: null,
        referenceImage: null,
        prototype: null,
        rows: {} as Record<string, RowState>,
        promptDrafts: [],
        runtimeFeed: [],
        atlasReview: null,
        phase: "brief",
        createdAt: "2024-01-01T00:00:00Z",
      };

      expect(session.brief?.displayName).toBe("Test Pet");
      expect(session.brief?.personality).toEqual(["friendly", "curious"]);
    });
  });

  describe("ReferenceImage structure", () => {
    it("should create valid reference image", () => {
      const image: ReferenceImage = {
        id: "123e4567-e89b-12d3-a456-426614174000",
        path: "/path/to/image.png",
        sha256: "abc123",
        description: null,
        descriptionStatus: "pending",
        describedAt: null,
      };

      expect(image.id).toBeDefined();
      expect(image.descriptionStatus).toBe("pending");
    });
  });

  describe("RowState structure", () => {
    it("should create valid row state", () => {
      const row: RowState = {
        prompt: "A test prompt",
        image: null,
        derivedFrom: null,
        mirrorDecision: null,
        attempts: 0,
        lastError: null,
        status: "pending",
      };

      expect(row.prompt).toBe("A test prompt");
      expect(row.status).toBe("pending");
    });
  });
});
