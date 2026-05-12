import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HatchingSession, RowKey, RowState } from "../../../domain/hatching";
import { HatchingWelcome } from "../HatchingWelcome";

vi.mock("../../../runtimeBridge", () => ({
  runtimeBridge: {
    petAssetUrl: (path: string) => `asset://${path}`,
  },
}));

function row(status: RowState["status"], derivedFrom: RowKey | null = null): RowState {
  return {
    prompt: "prompt",
    image: null,
    derivedFrom,
    mirrorDecision: null,
    attempts: 1,
    lastError: null,
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
      displayName: "Moss",
      petId: "moss",
      description: "A little watcher",
      personality: ["quiet"],
      palette: null,
      backstory: null,
      speechStyle: null,
      behavioralQuirks: null,
      visualNotes: null,
    },
    archetype: null,
    referenceImage: null,
    prototype: { current: 0, iterations: [] },
    rows: { idle: row("ready"), "running-left": row("ready", "running-right") } as Partial<
      Record<RowKey, RowState>
    > as Record<RowKey, RowState>,
    promptDrafts: [],
    runtimeFeed: [],
    atlasReview: null,
    phase: { done: { petId: "moss" } },
    createdAt: new Date().toISOString(),
  };
}

describe("HatchingWelcome", () => {
  it("shows pet summary and stats", () => {
    render(
      <HatchingWelcome
        session={session()}
        petId="moss"
        onSaveAndStay={vi.fn()}
        onStartWith={vi.fn()}
      />,
    );

    expect(screen.getByText(/Meet/)).toHaveTextContent("Moss");
    expect(screen.getByText("A little watcher")).toBeInTheDocument();
    expect(screen.getByText(/1 accepted, 1 derived/)).toBeInTheDocument();
  });

  it("calls save and start actions", async () => {
    const onSaveAndStay = vi.fn();
    const onStartWith = vi.fn();
    render(
      <HatchingWelcome
        session={session()}
        petId="moss"
        onSaveAndStay={onSaveAndStay}
        onStartWith={onStartWith}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save and stay here" }));
    expect(onSaveAndStay).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Start with Moss →" }));
    expect(onStartWith).toHaveBeenCalledWith(true);
  });
});
