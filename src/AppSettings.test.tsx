import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PetLibrary } from "./domain/petLibrary";
import type { InstalledPet, PetConfig } from "./domain/petConfig";
import type { OfficialUpdateState } from "./hooks/useOfficialUpdater";

const runtimeBridgeMock = vi.hoisted(() => ({
  importPet: vi.fn(),
  listInstalledPets: vi.fn(),
  loadPetConfig: vi.fn(),
  loadPetLibrary: vi.fn(),
  onPetEvent: vi.fn(),
  petAssetUrl: vi.fn((path: string) => path),
  pickDirectory: vi.fn(),
  pickPetFolder: vi.fn(),
  respondToApproval: vi.fn(),
  savePetConfig: vi.fn(),
  sendUserMessage: vi.fn(),
  setActivePet: vi.fn(),
  setMuteUntil: vi.fn(),
  startHatchingFlow: vi.fn(),
  startPetRuntime: vi.fn(),
  startWindowDrag: vi.fn(),
  tuckWindowToTab: vi.fn(),
  tuckPet: vi.fn(),
  restorePetWindowFromTab: vi.fn(),
  wakePet: vi.fn(),
}));

const updaterMock = vi.hoisted(() => ({
  state: { enabled: false, status: "disabled", downloadedBytes: 0 } as OfficialUpdateState,
  checkForUpdates: vi.fn(),
  installUpdate: vi.fn(),
}));

vi.mock("./runtimeBridge", () => ({
  runtimeBridge: runtimeBridgeMock,
}));

vi.mock("./hooks/useOfficialUpdater", () => ({
  useOfficialUpdater: () => ({
    state: updaterMock.state,
    checkForUpdates: updaterMock.checkForUpdates,
    installUpdate: updaterMock.installUpdate,
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
  workspaceCwd: "/repo",
  observers: { activeApp: true, windowTitle: true, workspace: true, idle: true },
  ambient: {
    enabled: true,
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
  ],
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

async function renderLoadedApp(config: PetConfig = baseConfig) {
  runtimeBridgeMock.loadPetConfig.mockResolvedValue(config);
  render(<App />);
  await screen.findByLabelText("Olive pet sprite");
}

async function openSettings() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Pet settings" }));
  return { user, dialog: await screen.findByRole("dialog", { name: "Pet settings" }) };
}

describe("App settings integration", () => {
  beforeEach(() => {
    updaterMock.state = { enabled: false, status: "disabled", downloadedBytes: 0 };
    updaterMock.checkForUpdates.mockResolvedValue(undefined);
    updaterMock.installUpdate.mockResolvedValue(undefined);
    runtimeBridgeMock.importPet.mockResolvedValue(library);
    runtimeBridgeMock.listInstalledPets.mockResolvedValue([olivePet]);
    runtimeBridgeMock.loadPetConfig.mockResolvedValue(baseConfig);
    runtimeBridgeMock.loadPetLibrary.mockResolvedValue(library);
    runtimeBridgeMock.onPetEvent.mockResolvedValue(vi.fn());
    runtimeBridgeMock.pickDirectory.mockResolvedValue(null);
    runtimeBridgeMock.pickPetFolder.mockResolvedValue(null);
    runtimeBridgeMock.respondToApproval.mockResolvedValue(undefined);
    runtimeBridgeMock.savePetConfig.mockResolvedValue(undefined);
    runtimeBridgeMock.sendUserMessage.mockResolvedValue(undefined);
    runtimeBridgeMock.setActivePet.mockResolvedValue(library);
    runtimeBridgeMock.setMuteUntil.mockResolvedValue(undefined);
    runtimeBridgeMock.startHatchingFlow.mockResolvedValue({
      skill: "pet-hatching",
      prompt: "hatch",
    });
    runtimeBridgeMock.startPetRuntime.mockResolvedValue({ sessionId: "session-1" });
    runtimeBridgeMock.startWindowDrag.mockResolvedValue(undefined);
    runtimeBridgeMock.tuckWindowToTab.mockResolvedValue(undefined);
    runtimeBridgeMock.tuckPet.mockResolvedValue({ tucked: true, visible: false });
    runtimeBridgeMock.restorePetWindowFromTab.mockResolvedValue(undefined);
    runtimeBridgeMock.wakePet.mockResolvedValue({ tucked: false, visible: true });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens settings from real app chrome and closes through header, backdrop, and Escape", async () => {
    await renderLoadedApp();
    let { user, dialog } = await openSettings();

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Pet settings" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(within(dialog).getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("dialog", { name: "Pet settings" })).toBeNull();

    ({ user, dialog } = await openSettings());
    await user.click(screen.getByRole("button", { name: "Dismiss settings" }));
    expect(screen.queryByRole("dialog", { name: "Pet settings" })).toBeNull();

    ({ user } = await openSettings());
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Pet settings" })).toBeNull();
  });

  it("saves workspace changes from the actual settings dialog", async () => {
    await renderLoadedApp({ ...baseConfig, workspaceCwd: "/old" });
    runtimeBridgeMock.pickDirectory.mockResolvedValue("/new");
    const { user, dialog } = await openSettings();

    await user.click(within(dialog).getByRole("button", { name: "Choose folder" }));

    await waitFor(() =>
      expect(runtimeBridgeMock.pickDirectory).toHaveBeenCalledWith({ defaultPath: "/old" }),
    );
    await waitFor(() =>
      expect(runtimeBridgeMock.savePetConfig).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceCwd: "/new" }),
      ),
    );
    expect(within(dialog).getByText("/new")).toBeInTheDocument();
  });

  it("persists runtime changes only after explicit power-mode confirmation", async () => {
    await renderLoadedApp();
    const { user, dialog } = await openSettings();

    await user.click(within(dialog).getByLabelText("Save pet sessions in Codex history"));
    await waitFor(() =>
      expect(runtimeBridgeMock.savePetConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({
          runtime: { sessionPersistence: "savedHistory", safetyMode: "safe" },
        }),
      ),
    );

    await user.click(
      within(dialog).getByLabelText(
        "Power mode: high-risk broad local access for trusted workspaces only",
      ),
    );
    expect(within(dialog).getByRole("alert")).toBeInTheDocument();
    expect(runtimeBridgeMock.savePetConfig).not.toHaveBeenCalledWith(
      expect.objectContaining({ runtime: expect.objectContaining({ safetyMode: "power" }) }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Enable Power mode" }));
    await waitFor(() =>
      expect(runtimeBridgeMock.savePetConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({
          runtime: { sessionPersistence: "savedHistory", safetyMode: "power" },
        }),
      ),
    );

    await user.click(within(dialog).getByLabelText("Safe mode (recommended)"));
    await waitFor(() =>
      expect(runtimeBridgeMock.savePetConfig).toHaveBeenLastCalledWith(
        expect.objectContaining({
          runtime: { sessionPersistence: "savedHistory", safetyMode: "safe" },
        }),
      ),
    );
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });

  it("surfaces settings save failures instead of silently lying about persistence", async () => {
    await renderLoadedApp();
    runtimeBridgeMock.savePetConfig.mockRejectedValueOnce(new Error("disk is full"));
    const { user, dialog } = await openSettings();

    await user.click(within(dialog).getByLabelText("Window title (may reveal document names)"));

    await screen.findByText(/disk is full · Open settings/);
    expect(within(dialog).getByLabelText("Window title (may reveal document names)")).toBeChecked();
  });

  it("does not let an older failed save roll back a newer successful settings edit", async () => {
    const firstSave = deferred<void>();
    runtimeBridgeMock.savePetConfig.mockImplementationOnce(() => firstSave.promise);
    runtimeBridgeMock.savePetConfig.mockResolvedValue(undefined);
    await renderLoadedApp();
    const { user, dialog } = await openSettings();

    await user.click(within(dialog).getByLabelText("Active app name"));
    await user.click(within(dialog).getByLabelText("Window title (may reveal document names)"));
    await waitFor(() => expect(runtimeBridgeMock.savePetConfig).toHaveBeenCalledTimes(2));

    firstSave.reject(new Error("late old failure"));

    await waitFor(() =>
      expect(
        within(dialog).getByLabelText("Window title (may reveal document names)"),
      ).not.toBeChecked(),
    );
    expect(within(dialog).getByLabelText("Active app name")).not.toBeChecked();
    expect(screen.queryByText(/late old failure · Open settings/)).toBeNull();
  });

  it("opens available-update prompt into settings and wires install/check actions", async () => {
    updaterMock.state = {
      enabled: true,
      status: "available",
      currentVersion: "0.1.0",
      availableVersion: "0.2.0",
      notes: "Better pets",
      downloadedBytes: 0,
    };
    await renderLoadedApp();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Update 0.2.0 available · Open settings" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Pet settings" });

    expect(within(dialog).getByText("Version 0.2.0 is available.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Install and relaunch" }));
    expect(updaterMock.installUpdate).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Check for updates" }));
    expect(updaterMock.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
