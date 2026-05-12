import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrphanSummary } from "../../../domain/hatching";

const hatchingBridgeMock = vi.hoisted(() => ({
  cancelHatchingRun: vi.fn(),
  listOrphanHatchingSessions: vi.fn(),
  resumeHatchingRun: vi.fn(),
}));

vi.mock("../../../hatchingBridge", () => ({
  hatchingBridge: hatchingBridgeMock,
}));

import { ResumeBanner } from "../ResumeBanner";

const orphan: OrphanSummary = {
  sessionId: "session-1",
  displayName: "Moss",
  phase: "prototype",
  createdAt: "2026-05-10T00:00:00.000Z",
};

describe("ResumeBanner", () => {
  beforeEach(() => {
    hatchingBridgeMock.cancelHatchingRun.mockReset();
    hatchingBridgeMock.listOrphanHatchingSessions.mockReset();
    hatchingBridgeMock.resumeHatchingRun.mockReset();
  });

  it("renders nothing when there are no orphan sessions", async () => {
    hatchingBridgeMock.listOrphanHatchingSessions.mockResolvedValue([]);
    const { container } = render(<ResumeBanner />);

    await waitFor(() => expect(hatchingBridgeMock.listOrphanHatchingSessions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("renders orphan sessions and resumes one", async () => {
    hatchingBridgeMock.listOrphanHatchingSessions.mockResolvedValue([orphan]);
    hatchingBridgeMock.resumeHatchingRun.mockResolvedValue({ id: "session-1" });

    render(<ResumeBanner />);

    await screen.findByText(/Moss/);
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));

    expect(hatchingBridgeMock.resumeHatchingRun).toHaveBeenCalledWith("session-1");
    await waitFor(() => expect(screen.queryByText(/Moss/)).not.toBeInTheDocument());
  });

  it("discards an orphan session", async () => {
    hatchingBridgeMock.listOrphanHatchingSessions.mockResolvedValue([orphan]);
    hatchingBridgeMock.cancelHatchingRun.mockResolvedValue(undefined);

    render(<ResumeBanner />);

    await screen.findByText(/Moss/);
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));

    expect(hatchingBridgeMock.cancelHatchingRun).toHaveBeenCalledWith("session-1");
    await waitFor(() => expect(screen.queryByText(/Moss/)).not.toBeInTheDocument());
  });
});
