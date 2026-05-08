import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InstalledPet, PetConfig } from "../../domain/petConfig";
import type { ApprovalRequest } from "../../domain/runtimeEvents";
import { PetWindow } from "../PetWindow";

vi.mock("../../runtimeBridge", () => ({
  runtimeBridge: {
    petAssetUrl: (path: string) => path,
  },
}));

const baseConfig: PetConfig = {
  petId: "olive",
  displayName: "Olive",
  spritesheetPath: "/tmp/olive.webp",
  persona: "friendly",
  mute: {},
  tuck: { tucked: false },
  observers: { activeApp: true, windowTitle: true, workspace: true, idle: true },
  ambient: {
    enabled: false,
    intervalMinutes: 15,
    includeScreenshot: false,
    retainScreenshots: false,
  },
  runtime: { sessionPersistence: "ephemeral", safetyMode: "safe" },
};

const olivePet: InstalledPet = {
  id: "olive",
  displayName: "Olive",
  spritesheetPath: "/tmp/olive.webp",
  metadataPath: "/tmp/pet.json",
  diagnostics: [],
};

const approval: ApprovalRequest = {
  requestId: "approval-1",
  toolName: "exec",
  detail: "run command",
  risk: "execute",
  allowForSession: true,
};

function renderPetWindow(overrides: Partial<ComponentProps<typeof PetWindow>> = {}) {
  return render(
    <PetWindow
      config={baseConfig}
      tucked={false}
      pet={olivePet}
      streamingText=""
      lastReply=""
      awaitingReply={false}
      transcript={[]}
      completedOutputCount={0}
      onSend={vi.fn()}
      onMute={vi.fn()}
      onTuck={vi.fn()}
      onWake={vi.fn()}
      onConfigChange={vi.fn()}
      onApproval={vi.fn()}
      onStartDrag={vi.fn()}
      {...overrides}
    />,
  );
}

async function expectSpritePosition(backgroundPosition: string) {
  const sprite = screen.getByLabelText("Olive pet sprite") as HTMLDivElement;
  await waitFor(() => expect(sprite.style.backgroundPosition).toBe(backgroundPosition));
}

function firePointerEvent(element: Element, type: "pointerDown" | "pointerMove", clientX: number) {
  const event = createEvent[type](element);
  Object.defineProperty(event, "button", { value: 0 });
  Object.defineProperty(event, "clientX", { value: clientX });
  Object.defineProperty(event, "screenX", { value: clientX });
  Object.defineProperty(event, "clientY", { value: 0 });
  Object.defineProperty(event, "screenY", { value: 0 });
  fireEvent(element, event);
}

function firePointerEventWithCoordinates(
  element: Element,
  type: "pointerDown" | "pointerMove",
  coordinates: {
    button?: number;
    clientX: number;
    clientY?: number;
    screenX: number;
    screenY?: number;
  },
) {
  const event = createEvent[type](element);
  Object.defineProperty(event, "button", { value: coordinates.button ?? 0 });
  Object.defineProperty(event, "clientX", { value: coordinates.clientX });
  Object.defineProperty(event, "clientY", { value: coordinates.clientY ?? 0 });
  Object.defineProperty(event, "screenX", { value: coordinates.screenX });
  Object.defineProperty(event, "screenY", { value: coordinates.screenY ?? 0 });
  fireEvent(element, event);
}

describe("PetWindow animation activation", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a wake tab instead of the full pet surface while tucked", () => {
    const onWake = vi.fn();
    renderPetWindow({ tucked: true, onWake });

    expect(screen.queryByLabelText("Olive pet sprite")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Message your pet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wake pet" }));
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("exposes a tuck action in the hover toolbar", () => {
    const onTuck = vi.fn();
    renderPetWindow({ onTuck });

    fireEvent.click(screen.getByRole("button", { name: "Tuck pet away" }));
    expect(onTuck).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["awaiting runtime reply", { awaitingReply: true }, "0% 87.5%"],
    ["streaming text", { streamingText: "Hello" }, "0% 87.5%"],
    ["approval request", { approval }, "0% 75%"],
    ["approval request over runtime error", { approval, error: "Codex is unavailable" }, "0% 75%"],
    ["visible runtime error", { error: "Codex is unavailable" }, "0% 62.5%"],
    ["completed visible reply", { lastReply: "Done." }, "0% 100%"],
  ])("selects the Codex %s row", async (_label, props, backgroundPosition) => {
    renderPetWindow(props);

    await expectSpritePosition(backgroundPosition);
  });

  it("keeps review active for unread completed output even when no reply bubble is visible", async () => {
    const { rerender } = renderPetWindow();
    await expectSpritePosition("0% 0%");

    rerender(
      <PetWindow
        config={baseConfig}
        tucked={false}
        pet={olivePet}
        streamingText=""
        lastReply=""
        awaitingReply={false}
        transcript={["Done."]}
        completedOutputCount={1}
        onSend={vi.fn()}
        onMute={vi.fn()}
        onTuck={vi.fn()}
        onWake={vi.fn()}
        onConfigChange={vi.fn()}
        onApproval={vi.fn()}
        onStartDrag={vi.fn()}
      />,
    );

    await expectSpritePosition("0% 100%");
  });

  it("does not use review for unread transcript entries that are not completed output", async () => {
    renderPetWindow({
      transcript: ["Workspace: repo has 1 modified file."],
      completedOutputCount: 0,
    });

    await expectSpritePosition("0% 0%");
  });

  it("caps long speech output to a transcript preview instead of expanding the pet layout", async () => {
    renderPetWindow({
      streamingText:
        "Olive has completed an unusually long imperial proclamation about the state of the desktop court, the pending tribute of clean tests, the alarming border dispute in the stylesheet, and the many procedural questions that must be preserved in the transcript drawer rather than shoving Olive into the chat input bar.",
    });

    const previewText = await screen.findByText(/Olive has completed/);
    expect(previewText).toHaveClass("speech-bubble__text");
    expect(previewText.closest("button")).toHaveClass("speech-bubble");
    await expectSpritePosition("0% 87.5%");
  });

  it("prioritizes unread completed output over running status like the Codex tray", async () => {
    const { rerender } = renderPetWindow({
      awaitingReply: true,
    });
    await expectSpritePosition("0% 87.5%");

    rerender(
      <PetWindow
        config={baseConfig}
        tucked={false}
        pet={olivePet}
        streamingText=""
        lastReply=""
        awaitingReply={true}
        transcript={["Previous turn done."]}
        completedOutputCount={1}
        onSend={vi.fn()}
        onMute={vi.fn()}
        onTuck={vi.fn()}
        onWake={vi.fn()}
        onConfigChange={vi.fn()}
        onApproval={vi.fn()}
        onStartDrag={vi.fn()}
      />,
    );

    await expectSpritePosition("0% 100%");
  });

  it("uses jumping on hover and directional running while dragging", async () => {
    renderPetWindow();

    const handle = screen.getByRole("button", { name: "Drag pet window" });
    fireEvent.pointerEnter(handle);
    await expectSpritePosition("0% 50%");

    firePointerEvent(handle, "pointerDown", 0);
    firePointerEvent(handle, "pointerMove", 10);
    await expectSpritePosition("0% 12.5%");

    for (const x of [6, 2, -2, -6, -10]) {
      firePointerEvent(handle, "pointerMove", x);
      await expectSpritePosition("0% 12.5%");
    }

    firePointerEvent(handle, "pointerMove", -14);
    await expectSpritePosition("0% 25%");
  });

  it("waits for Codex's 4px drag threshold before directional running", async () => {
    renderPetWindow();

    const handle = screen.getByRole("button", { name: "Drag pet window" });
    firePointerEvent(handle, "pointerDown", 0);
    firePointerEvent(handle, "pointerMove", 3);
    await expectSpritePosition("0% 0%");

    firePointerEvent(handle, "pointerMove", 4);
    await expectSpritePosition("0% 12.5%");
  });

  it("updates the drag baseline on vertical movement without falsely accumulating horizontal direction", async () => {
    renderPetWindow();

    const handle = screen.getByRole("button", { name: "Drag pet window" });
    firePointerEventWithCoordinates(handle, "pointerDown", {
      clientX: 0,
      clientY: 0,
      screenX: 0,
      screenY: 0,
    });
    firePointerEventWithCoordinates(handle, "pointerMove", {
      clientX: 3,
      clientY: 4,
      screenX: 3,
      screenY: 4,
    });
    await expectSpritePosition("0% 0%");

    firePointerEventWithCoordinates(handle, "pointerMove", {
      clientX: 6,
      clientY: 4,
      screenX: 6,
      screenY: 4,
    });
    await expectSpritePosition("0% 0%");

    firePointerEventWithCoordinates(handle, "pointerMove", {
      clientX: 7,
      clientY: 4,
      screenX: 7,
      screenY: 4,
    });
    await expectSpritePosition("0% 12.5%");
  });

  it("ignores non-primary pointer starts like the Codex overlay", async () => {
    const onStartDrag = vi.fn();
    renderPetWindow({ onStartDrag });

    const handle = screen.getByRole("button", { name: "Drag pet window" });
    firePointerEventWithCoordinates(handle, "pointerDown", {
      button: 1,
      clientX: 0,
      screenX: 0,
    });
    firePointerEvent(handle, "pointerMove", 10);

    await expectSpritePosition("0% 0%");
    expect(onStartDrag).not.toHaveBeenCalled();
  });

  it("keeps drag direction active when the pointer leaves during a drag", async () => {
    renderPetWindow();

    const handle = screen.getByRole("button", { name: "Drag pet window" });
    fireEvent.pointerEnter(handle);
    firePointerEvent(handle, "pointerDown", 0);
    firePointerEvent(handle, "pointerMove", 10);
    await expectSpritePosition("0% 12.5%");

    fireEvent.pointerLeave(handle);
    await expectSpritePosition("0% 12.5%");

    fireEvent.pointerUp(handle);
    await expectSpritePosition("0% 0%");
  });

  it("clears drag direction on window-level pointer end", async () => {
    renderPetWindow();

    const handle = screen.getByRole("button", { name: "Drag pet window" });
    firePointerEvent(handle, "pointerDown", 0);
    firePointerEvent(handle, "pointerMove", 10);
    await expectSpritePosition("0% 12.5%");

    fireEvent.pointerUp(window);
    await expectSpritePosition("0% 0%");
  });

  it("uses screen coordinates, including zero, for drag direction", async () => {
    renderPetWindow();

    const handle = screen.getByRole("button", { name: "Drag pet window" });
    firePointerEventWithCoordinates(handle, "pointerDown", { clientX: 100, screenX: 0 });
    firePointerEventWithCoordinates(handle, "pointerMove", { clientX: 90, screenX: 10 });

    await expectSpritePosition("0% 12.5%");
  });
});
