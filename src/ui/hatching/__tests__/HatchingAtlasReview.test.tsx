import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { HatchingSession, RowKey, RowState } from "../../../domain/hatching";
import { HATCHING_ATLAS_REVIEW_ROW_KEYS } from "../../../domain/hatching";
import { HatchingAtlasReview } from "../HatchingAtlasReview";

const runtimeBridgeMock = vi.hoisted(() => ({
  petAssetUrl: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock("../../../runtimeBridge", () => ({
  runtimeBridge: runtimeBridgeMock,
}));

function row(status: RowState["status"]): RowState {
  return {
    prompt: "prompt",
    image: null,
    derivedFrom: null,
    mirrorDecision: null,
    attempts: 1,
    lastError: status === "failed" ? "bad row" : null,
    status,
  };
}

function rows(status: RowState["status"] = "ready"): Record<RowKey, RowState> {
  return Object.fromEntries(
    HATCHING_ATLAS_REVIEW_ROW_KEYS.map((key) => [key, row(status)]),
  ) as Record<RowKey, RowState>;
}

function session(nextRows = rows()): HatchingSession {
  return {
    id: "session-1",
    runtimeHome: "/tmp/runtime",
    workspace: "/tmp/work",
    codexThreadId: null,
    brief: null,
    archetype: null,
    referenceImage: null,
    prototype: null,
    rows: nextRows,
    promptDrafts: [],
    runtimeFeed: [],
    atlasReview: {
      atlasPath: "/tmp/work/atlas.png",
      validationPath: "/tmp/work/atlas-validation.json",
      checks: [
        { label: "1536×1872 dimensions", ok: true, detail: "1536×1872" },
        { label: "All 9 rows present", ok: true, detail: null },
      ],
      composedAt: "2026-05-10T00:00:00.000Z",
    },
    phase: "review",
    createdAt: "2026-05-10T00:00:00.000Z",
  };
}

describe("HatchingAtlasReview", () => {
  it("renders persisted atlas preview, validation checks, and all nine row chips", () => {
    render(
      <HatchingAtlasReview session={session()} onImport={vi.fn()} onRegenerateRow={vi.fn()} />,
    );

    expect(screen.getByAltText("Composed pet atlas")).toHaveAttribute(
      "src",
      "asset:///tmp/work/atlas.png",
    );
    expect(screen.getByText("1536×1872 dimensions")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").filter((button) => /ready/.test(button.textContent ?? "")),
    ).toHaveLength(9);
  });

  it("regenerates failed rows and routes running-left through running-right confirmation", async () => {
    const onRegenerateRow = vi.fn();
    const nextRows = rows("ready");
    nextRows["running-left"] = row("failed");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <HatchingAtlasReview
        session={session(nextRows)}
        onImport={vi.fn()}
        onRegenerateRow={onRegenerateRow}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Running Left/ }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onRegenerateRow).toHaveBeenCalledWith("running-right");
    vi.mocked(window.confirm).mockRestore();
  });

  it("imports and activates only after checks pass", async () => {
    const onImport = vi.fn();
    render(
      <HatchingAtlasReview session={session()} onImport={onImport} onRegenerateRow={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Looks good — name it →" }));
    expect(onImport).toHaveBeenCalledWith(true);
  });
});
