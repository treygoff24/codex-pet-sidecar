import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetLibrary } from "./domain/petLibrary";
import type { InstalledPet, PetConfig } from "./domain/petConfig";
import type { ApprovalRequest, PetAgentEvent } from "./domain/runtimeEvents";

const runtimeBridgeMock = vi.hoisted(() => ({
  importPet: vi.fn(),
  listInstalledPets: vi.fn(),
  loadPetConfig: vi.fn(),
  loadPetLibrary: vi.fn(),
  onPetEvent: vi.fn(),
  petAssetUrl: vi.fn((path: string) => path),
  pickPetFolder: vi.fn(),
  respondToApproval: vi.fn(),
  savePetConfig: vi.fn(),
  sendUserMessage: vi.fn(),
  setActivePet: vi.fn(),
  setMuteUntil: vi.fn(),
  startHatchingFlow: vi.fn(),
  startPersonalityFlow: vi.fn(),
  startPetRuntime: vi.fn(),
  startWindowDrag: vi.fn(),
  tuckPet: vi.fn(),
  wakePet: vi.fn(),
}));

vi.mock("./runtimeBridge", () => ({
  runtimeBridge: runtimeBridgeMock,
}));
vi.mock("./hooks/useOfficialUpdater", () => ({
  useOfficialUpdater: () => ({
    state: { enabled: false, status: "disabled", downloadedBytes: 0 },
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
  }),
}));

import App from "./App";

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

const deweyPet: InstalledPet = {
  id: "dewey",
  displayName: "Dewey",
  spritesheetPath: "/tmp/dewey.webp",
  metadataPath: "/tmp/dewey-pet.json",
  diagnostics: [],
};

const library: PetLibrary = {
  activePetId: "olive",
  pets: [
    {
      petId: "olive",
      displayName: "Olive",
      source: { type: "bundled", bundledId: "olive" },
      createdAt: "2026-05-05T00:00:00.000Z",
      updatedAt: "2026-05-05T00:00:00.000Z",
    },
    {
      petId: "dewey",
      displayName: "Dewey",
      source: { type: "imported", originalPath: "/tmp/dewey" },
      createdAt: "2026-05-05T00:00:00.000Z",
      updatedAt: "2026-05-05T00:00:00.000Z",
    },
  ],
};

const deweyLibrary: PetLibrary = { ...library, activePetId: "dewey" };
const deweyConfig: PetConfig = { ...baseConfig, petId: "dewey", displayName: "Dewey" };

const approval: ApprovalRequest = {
  requestId: "approval-1",
  toolName: "exec",
  detail: "run command",
  risk: "execute",
  allowForSession: true,
};

describe("App pet animation state wiring", () => {
  let petEventHandler: ((event: PetAgentEvent) => void) | undefined;

  beforeEach(() => {
    petEventHandler = undefined;
    runtimeBridgeMock.importPet.mockResolvedValue(library);
    runtimeBridgeMock.listInstalledPets.mockResolvedValue([olivePet, deweyPet]);
    runtimeBridgeMock.loadPetConfig.mockResolvedValue(baseConfig);
    runtimeBridgeMock.loadPetLibrary.mockResolvedValue(library);
    runtimeBridgeMock.onPetEvent.mockImplementation(
      async (handler: (event: PetAgentEvent) => void) => {
        petEventHandler = handler;
        return vi.fn();
      },
    );
    runtimeBridgeMock.pickPetFolder.mockResolvedValue(null);
    runtimeBridgeMock.respondToApproval.mockResolvedValue(undefined);
    runtimeBridgeMock.savePetConfig.mockResolvedValue(undefined);
    runtimeBridgeMock.sendUserMessage.mockResolvedValue(undefined);
    runtimeBridgeMock.setActivePet.mockResolvedValue(deweyLibrary);
    runtimeBridgeMock.setMuteUntil.mockResolvedValue(undefined);
    runtimeBridgeMock.startHatchingFlow.mockResolvedValue({
      skill: "pet-hatching",
      prompt: "hatch",
    });
    runtimeBridgeMock.startPersonalityFlow.mockResolvedValue({
      skill: "pet-personality",
      prompt: "personality",
    });
    runtimeBridgeMock.startPetRuntime.mockResolvedValue({ sessionId: "session-1" });
    runtimeBridgeMock.startWindowDrag.mockResolvedValue(undefined);
    runtimeBridgeMock.tuckPet.mockResolvedValue({ tucked: true, visible: false });
    runtimeBridgeMock.wakePet.mockResolvedValue({ tucked: false, visible: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("clears stale errors when a new user turn starts so the sprite returns to running", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "error", message: "previous runtime failure" });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 62.5%"));

    fireEvent.change(screen.getByLabelText("Message your pet"), {
      target: { value: "try again" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));
    expect(runtimeBridgeMock.sendUserMessage).toHaveBeenCalledWith("try again");
  });

  it("clears interrupted streaming text before the next turn", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "text_delta", text: "partial" });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));

    act(() => {
      petEventHandler?.({ type: "error", message: "stream failed" });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 62.5%"));

    fireEvent.change(screen.getByLabelText("Message your pet"), {
      target: { value: "try again" },
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    act(() => {
      petEventHandler?.({ type: "text_delta", text: "fresh" });
      petEventHandler?.({ type: "turn_completed" });
    });

    await screen.findByText("fresh");
    expect(screen.queryByText("partialfresh")).not.toBeInTheDocument();
  });

  it("clears stale approval prompts when a runtime error arrives", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    act(() => {
      petEventHandler?.({ type: "error", message: "runtime failed" });
    });

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 62.5%"));
    expect(screen.queryByText("Allow once")).not.toBeInTheDocument();
  });

  it("returns to running after an approval response resumes the turn", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    fireEvent.click(screen.getByText("Allow once"));

    await waitFor(() =>
      expect(runtimeBridgeMock.respondToApproval).toHaveBeenCalledWith("approval-1", "allow_once"),
    );
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));
  });

  it("clears stale approvals when a turn completes so review is visible", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    act(() => {
      petEventHandler?.({ type: "turn_completed", finalText: "done" });
    });

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 100%"));
    expect(screen.queryByText("Allow once")).not.toBeInTheDocument();
  });

  it("clears stale runtime state when an ambient message arrives so review is visible", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "text_delta", text: "partial" });
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    act(() => {
      petEventHandler?.({ type: "ambient_message", text: "ambient done" });
    });

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 100%"));
    await screen.findByText("ambient done");
    expect(screen.queryByText("partialambient done")).not.toBeInTheDocument();
    expect(screen.queryByText("Allow once")).not.toBeInTheDocument();
  });

  it("clears stale errors around approval requests and responses", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "error", message: "previous failure" });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 62.5%"));

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    fireEvent.click(screen.getByText("Allow once"));

    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 87.5%"));
  });

  it("clears in-flight animation state when switching pets", async () => {
    render(<App />);

    const sprite = await screen.findByLabelText("Olive pet sprite");
    await waitFor(() => expect(petEventHandler).toBeDefined());

    act(() => {
      petEventHandler?.({ type: "approval_request", request: approval });
    });
    await waitFor(() => expect(sprite.style.backgroundPosition).toBe("0% 75%"));

    runtimeBridgeMock.loadPetLibrary.mockResolvedValueOnce(deweyLibrary);
    runtimeBridgeMock.loadPetConfig.mockResolvedValueOnce(deweyConfig);
    runtimeBridgeMock.listInstalledPets.mockResolvedValueOnce([olivePet, deweyPet]);

    fireEvent.click(screen.getByText("Pets"));
    fireEvent.click(screen.getByText("Dewey"));

    await waitFor(() => expect(runtimeBridgeMock.setActivePet).toHaveBeenCalledWith("dewey"));
    const deweySprite = await screen.findByLabelText("Dewey pet sprite");
    await waitFor(() => expect(deweySprite.style.backgroundPosition).toBe("0% 0%"));
  });
});
