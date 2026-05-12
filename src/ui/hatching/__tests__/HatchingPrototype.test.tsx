import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PrototypeState } from "../../../domain/hatching";
import { HatchingPrototype } from "../HatchingPrototype";

const runtimeBridgeMock = vi.hoisted(() => ({
  petAssetUrl: vi.fn((path: string) => `asset://${path}`),
}));

vi.mock("../../../runtimeBridge", () => ({
  runtimeBridge: runtimeBridgeMock,
}));

function prototype(): PrototypeState {
  return {
    current: 1,
    iterations: [1, 2].map((n) => ({
      n,
      revisedPrompt: `prompt ${n}`,
      summaryOfChanges: `changed ${n}`,
      userFeedback: n === 1 ? null : "more moss",
      generatedAt: "2026-05-10T00:00:00.000Z",
      image: {
        sourcePath: `/tmp/source-${n}.png`,
        outputPath: `/tmp/out-${n}.png`,
        sourceProvenance: "built-in-imagegen",
        sourceSha256: "abc",
        outputSha256: "def",
        metadata: { width: 192, height: 208, mode: "RGBA", format: "PNG" },
      },
    })),
  };
}

describe("HatchingPrototype", () => {
  it("renders current prototype, history, and prompt details", async () => {
    const onRevertToIteration = vi.fn();
    render(
      <HatchingPrototype
        prototype={prototype()}
        onGeneratePrototype={vi.fn()}
        onAcceptPrototype={vi.fn()}
        onRevertToIteration={onRevertToIteration}
      />,
    );

    expect(screen.getByAltText("Current prototype")).toHaveAttribute(
      "src",
      "asset:///tmp/out-2.png",
    );
    expect(screen.getByRole("button", { name: "Revert to iteration 1" })).toBeInTheDocument();
    const currentIteration = screen.getByRole("button", {
      name: "Current prototype iteration 2",
    });
    expect(currentIteration).toHaveAttribute("aria-current", "true");
    expect(currentIteration).toHaveTextContent("Current");
    await userEvent.click(currentIteration);
    expect(onRevertToIteration).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("See revised prompt"));
    expect(screen.getByLabelText("Revised prompt")).toHaveValue("prompt 2");
  });

  it("sends feedback as a revised prototype request", async () => {
    const onGeneratePrototype = vi.fn();
    render(
      <HatchingPrototype
        prototype={prototype()}
        onGeneratePrototype={onGeneratePrototype}
        onAcceptPrototype={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("Feedback for the next try"), "make it rounder");
    expect(screen.getByRole("button", { name: "Accept · generate the rest →" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Generate revised prototype →" }));
    expect(onGeneratePrototype).toHaveBeenCalledWith("make it rounder");
  });

  it("accepts the current prototype only when no feedback is pending", async () => {
    const onAcceptPrototype = vi.fn();
    render(
      <HatchingPrototype
        prototype={prototype()}
        onGeneratePrototype={vi.fn()}
        onAcceptPrototype={onAcceptPrototype}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Accept · generate the rest →" }));
    expect(onAcceptPrototype).toHaveBeenCalledTimes(1);
  });

  it("shows a waiting state while a revised prototype is generating", async () => {
    const onGeneratePrototype = vi.fn();
    const { rerender } = render(
      <HatchingPrototype
        prototype={prototype()}
        onGeneratePrototype={onGeneratePrototype}
        onAcceptPrototype={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("Feedback for the next try"), "make it rounder");
    await userEvent.click(screen.getByRole("button", { name: "Generate revised prototype →" }));
    rerender(
      <HatchingPrototype
        prototype={prototype()}
        onGeneratePrototype={onGeneratePrototype}
        onAcceptPrototype={vi.fn()}
        isLoading
      />,
    );

    expect(screen.getByText("Generating revised prototype #3...")).toBeInTheDocument();
    expect(screen.getByText(/Keeping you on this screen/)).toBeInTheDocument();
  });

  it("labels the first prototype action as generation before an iteration exists", async () => {
    const onGeneratePrototype = vi.fn();
    render(
      <HatchingPrototype
        prototype={null}
        onGeneratePrototype={onGeneratePrototype}
        onAcceptPrototype={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Generate prototype" }));

    expect(onGeneratePrototype).toHaveBeenCalledWith(null);
  });

  it("disables retry while reference description is pending", () => {
    render(
      <HatchingPrototype
        prototype={prototype()}
        referenceImage={{
          id: "ref-1",
          path: "/tmp/ref.png",
          sha256: "abc",
          description: null,
          descriptionStatus: "pending",
          describedAt: null,
        }}
        onGeneratePrototype={vi.fn()}
        onAcceptPrototype={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Try another version" })).toBeDisabled();
    expect(screen.getByText("Waiting for reference description...")).toBeInTheDocument();
  });
});
