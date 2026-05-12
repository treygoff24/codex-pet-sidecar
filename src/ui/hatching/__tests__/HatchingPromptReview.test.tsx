import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PromptDraft } from "../../../domain/hatching";
import { HatchingPromptReview } from "../HatchingPromptReview";

const drafts: PromptDraft[] = [
  {
    rowKey: "idle",
    label: "base · idle",
    prompt: "Wendell sitting still",
    derivedFrom: null,
    editable: true,
  },
  {
    rowKey: "running-right",
    label: "running-right",
    prompt: "Wendell waddles right",
    derivedFrom: null,
    editable: true,
  },
  {
    rowKey: "running-left",
    label: "running-left · derived",
    prompt: "auto-mirrored from running-right · no separate generation",
    derivedFrom: "running-right",
    editable: false,
  },
  {
    rowKey: "waving",
    label: "waving",
    prompt: "Wendell waves skeptically",
    derivedFrom: null,
    editable: true,
  },
];

describe("HatchingPromptReview", () => {
  it("renders editable prompts and the derived running-left row", () => {
    render(<HatchingPromptReview displayName="Wendell" drafts={drafts} onSave={vi.fn()} />);

    expect(screen.getByText(/Codex drafted your/)).toBeInTheDocument();
    expect(screen.getByText(/running-left · derived/)).toBeInTheDocument();
    expect(screen.getByLabelText(/running-left/i)).toBeDisabled();
    expect(screen.getByText("3 prompts to generate · 1 derived")).toBeInTheDocument();
  });

  it("persists prompt edits on save", async () => {
    const onSave = vi.fn();
    render(<HatchingPromptReview displayName="Wendell" drafts={drafts} onSave={onSave} />);

    await userEvent.type(screen.getByLabelText(/^waving$/i), " with extra disdain");
    await userEvent.click(screen.getByRole("button", { name: /make a prototype/i }));

    expect(onSave).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rowKey: "waving",
          prompt: expect.stringContaining("extra disdain"),
        }),
      ]),
    );
  });
});
