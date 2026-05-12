import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HatchingSession, RowKey, RowState } from "../../../domain/hatching";
import { HatchingGenerationProgress } from "../HatchingGenerationProgress";

vi.mock("../../../runtimeBridge", () => ({
  runtimeBridge: {
    petAssetUrl: (path: string) => `asset://${path}`,
  },
}));

function row(status: RowState["status"], attempts = 1): RowState {
  return {
    prompt: "prompt",
    image: null,
    derivedFrom: null,
    mirrorDecision: null,
    attempts,
    lastError: status === "failed" ? "bad row" : null,
    status,
  };
}

function session(): HatchingSession {
  return {
    id: "session-1",
    runtimeHome: "/tmp/runtime",
    workspace: "/tmp/workspace",
    codexThreadId: null,
    brief: {
      displayName: "Moose",
      petId: "moose",
      description: "A good dog",
      personality: ["loyal"],
      palette: null,
      backstory: null,
      speechStyle: null,
      behavioralQuirks: null,
      visualNotes: null,
    },
    archetype: null,
    referenceImage: null,
    prototype: { current: 0, iterations: [] },
    rows: {
      idle: row("ready", 2),
      "running-right": row("ready"),
      waving: row("generating"),
    } as Partial<Record<RowKey, RowState>> as Record<RowKey, RowState>,
    promptDrafts: [],
    runtimeFeed: [
      {
        id: "feed-1",
        at: "2026-05-10T00:00:00.000Z",
        tone: "ok",
        message: "canonical_identity_reference set",
      },
    ],
    atlasReview: null,
    phase: {
      generating: {
        rowsCompleted: 2,
        rowsTotal: 7,
        estimatedRemaining: 90000,
        totalImagegenCalls: 5,
      },
    },
    createdAt: "2026-05-10T00:00:00.000Z",
  };
}

describe("HatchingGenerationProgress", () => {
  it("renders pipeline rows, persisted feed, eta, and imagegen calls", () => {
    render(
      <HatchingGenerationProgress
        session={session()}
        progress={{
          rowsCompleted: 2,
          rowsTotal: 7,
          estimatedRemaining: 90000,
          totalImagegenCalls: 5,
        }}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/Building/)).toHaveTextContent("Moose");
    expect(screen.getByText(/base \/ idle/)).toBeInTheDocument();
    expect(screen.getAllByText(/canonical identity/).length).toBeGreaterThan(0);
    expect(screen.getByText(/total imagegen calls/)).toHaveTextContent("2 / 7 rows");
    expect(screen.getByText("canonical_identity_reference set")).toBeInTheDocument();
    expect(screen.queryByText(/fully available once/)).not.toBeInTheDocument();
  });
});
