import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HATCHING_ARCHETYPES } from "../archetypes";
import { HatchingInspiration } from "../HatchingInspiration";

describe("HatchingInspiration", () => {
  it("renders the six spec archetypes", () => {
    render(<HatchingInspiration onSkip={vi.fn()} onSelectArchetype={vi.fn()} />);

    expect(HATCHING_ARCHETYPES).toHaveLength(6);
    for (const archetype of HATCHING_ARCHETYPES) {
      expect(screen.getByText(archetype.name)).toBeInTheDocument();
      expect(screen.getByText(archetype.descriptor)).toBeInTheDocument();
    }
  });

  it("selects and confirms an archetype", async () => {
    const onSelectArchetype = vi.fn();
    render(<HatchingInspiration onSkip={vi.fn()} onSelectArchetype={onSelectArchetype} />);

    await userEvent.click(screen.getByRole("button", { name: /The Grumpy Sage/ }));
    await userEvent.click(screen.getByRole("button", { name: "Continue with this →" }));

    expect(onSelectArchetype).toHaveBeenCalledWith("grumpy-sage");
  });

  it("starts from a blank brief from the visible secondary action", async () => {
    const onSkip = vi.fn();
    render(<HatchingInspiration onSkip={onSkip} onSelectArchetype={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Start from a blank brief" }));

    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
