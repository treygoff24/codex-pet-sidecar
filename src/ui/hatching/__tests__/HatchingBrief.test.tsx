import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HATCHING_ARCHETYPES } from "../archetypes";
import { HatchingBrief } from "../HatchingBrief";

const hatchingBridgeMock = vi.hoisted(() => ({
  previewPetId: vi.fn(),
}));

vi.mock("../../../hatchingBridge", () => ({
  hatchingBridge: hatchingBridgeMock,
}));

describe("HatchingBrief", () => {
  beforeEach(() => {
    vi.useRealTimers();
    hatchingBridgeMock.previewPetId.mockReset();
    hatchingBridgeMock.previewPetId.mockResolvedValue({
      petId: "moss",
      available: true,
      suggestion: null,
    });
  });

  it("prefills description, personality chips, and palette from an archetype", () => {
    render(<HatchingBrief archetype={HATCHING_ARCHETYPES[0]} onSubmit={vi.fn()} />);

    expect(screen.getByDisplayValue(HATCHING_ARCHETYPES[0].defaultBrief)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /warm/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("normalizes pet id and submits the brief", async () => {
    const onSubmit = vi.fn();
    render(<HatchingBrief onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText("Display name"), "My Pet");
    await userEvent.type(screen.getByLabelText("Description"), "A useful little friend");
    await userEvent.type(screen.getByLabelText("Add a custom personality trait"), "curious{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Looks good →" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "My Pet",
        petId: "my-pet",
        description: "A useful little friend",
        personality: ["curious"],
      }),
    );
  });

  it("adds a custom personality chip with Enter and keeps the input ready", async () => {
    render(<HatchingBrief onSubmit={vi.fn()} />);

    const input = screen.getByLabelText("Add a custom personality trait");
    await userEvent.type(input, "wry{Enter}");

    expect(screen.getByRole("button", { name: /wry/ })).toHaveAttribute("aria-pressed", "true");
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("allows up to ten personality traits before disabling new additions", async () => {
    render(<HatchingBrief onSubmit={vi.fn()} />);

    for (const trait of [
      "cozy",
      "curious",
      "sleepy",
      "mischievous",
      "earnest",
      "grumpy",
      "wise",
      "stoic",
      "playful",
      "quiet",
    ]) {
      await userEvent.click(screen.getByRole("button", { name: new RegExp(trait) }));
    }

    expect(screen.getByText("10 / 10 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "focused" })).toBeDisabled();
    expect(screen.getByLabelText("Add a custom personality trait")).toBeDisabled();
  });

  it("offers a Step 2 visual reference upload action", async () => {
    const onChooseReference = vi.fn();
    render(<HatchingBrief onSubmit={vi.fn()} onChooseReference={onChooseReference} />);

    await userEvent.click(screen.getByRole("button", { name: "Upload visual reference image" }));

    expect(onChooseReference).toHaveBeenCalledTimes(1);
  });

  it("shows an attached visual reference in the brief step", () => {
    render(
      <HatchingBrief
        onSubmit={vi.fn()}
        referenceImage={{
          id: "ref-1",
          path: "/Users/trey/Desktop/moose.png",
          sha256: "abc",
          description: "A dog named Moose",
          descriptionStatus: "ready",
          describedAt: "2026-05-10T00:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText(/moose.png · description ready/)).toBeInTheDocument();
  });

  it("debounces preview_pet_id and shows suggestions", async () => {
    hatchingBridgeMock.previewPetId.mockResolvedValue({
      petId: "moss",
      available: false,
      suggestion: "moss-2",
    });
    render(<HatchingBrief onSubmit={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Display name"), "Moss");

    await waitFor(() => expect(hatchingBridgeMock.previewPetId).toHaveBeenCalledWith("Moss"));
    expect(await screen.findByText(/moss is taken/i)).toBeInTheDocument();
  });
});
