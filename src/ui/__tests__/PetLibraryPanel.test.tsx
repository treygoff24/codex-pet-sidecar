import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PetLibrary } from "../../domain/petLibrary";
import type { InstalledPet } from "../../domain/petConfig";
import { PetLibraryPanel } from "../PetLibraryPanel";

function library(count = 1): PetLibrary {
  return {
    activePetId: "olive",
    pets: Array.from({ length: count }, (_, index) => ({
      petId: index === 0 ? "olive" : `pet-${index}`,
      displayName: index === 0 ? "Olive" : `Pet ${index}`,
      source: { type: "imported" },
      createdAt: "now",
      updatedAt: "now",
    })),
  };
}

function pets(count = 1): InstalledPet[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? "olive" : `pet-${index}`,
    displayName: index === 0 ? "Olive" : `Pet ${index}`,
    spritesheetPath: "/tmp/spritesheet.webp",
    metadataPath: "/tmp/pet.json",
    diagnostics: [],
  }));
}

describe("PetLibraryPanel", () => {
  it("renders active bundled Olive and switches pets", async () => {
    const onSwitch = vi.fn();
    render(
      <PetLibraryPanel
        library={library(2)}
        pets={pets(2)}
        onSwitch={onSwitch}
        onHatch={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    expect(screen.getByText((_, element) => element?.textContent === "2 / 20")).toBeTruthy();
    await userEvent.click(screen.getByText("Pet 1"));
    expect(onSwitch).toHaveBeenCalledWith("pet-1");
  });

  it("disables hatch and import at twenty pets", () => {
    render(
      <PetLibraryPanel
        library={library(20)}
        pets={pets(20)}
        onSwitch={vi.fn()}
        onHatch={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Hatch pet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Import pet" })).toBeDisabled();
  });

  it("archives non-active pets after confirmation and blocks the active pet", async () => {
    const onArchive = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <PetLibraryPanel
        library={library(2)}
        pets={pets(2)}
        onSwitch={vi.fn()}
        onHatch={vi.fn()}
        onImport={vi.fn()}
        onArchive={onArchive}
      />,
    );

    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    expect(archiveButtons[0]).toBeDisabled();
    expect(screen.getByText("Switch pets first — Olive is currently active.")).toBeInTheDocument();

    await userEvent.click(archiveButtons[1]);

    expect(window.confirm).toHaveBeenCalledWith(
      "Archive Pet 1? This moves the package out of the library. You can hatch again.",
    );
    expect(onArchive).toHaveBeenCalledWith("pet-1");
    vi.mocked(window.confirm).mockRestore();
  });
});
