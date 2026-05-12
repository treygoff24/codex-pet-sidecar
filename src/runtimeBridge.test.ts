import { beforeEach, describe, expect, it, vi } from "vitest";

const dialogMock = vi.hoisted(() => ({
  open: vi.fn(),
}));

const dpiMock = vi.hoisted(() => ({
  LogicalPosition: vi.fn((x: number, y: number) => ({ x, y })),
  LogicalSize: vi.fn((width: number, height: number) => ({ width, height })),
}));

const windowMock = vi.hoisted(() => ({
  currentMonitor: vi.fn(),
  getCurrentWindow: vi.fn(),
  primaryMonitor: vi.fn(),
  window: {
    outerPosition: vi.fn(),
    scaleFactor: vi.fn(),
    setFocus: vi.fn(),
    setPosition: vi.fn(),
    setSize: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    startDragging: vi.fn(),
  },
}));

const webviewWindowMock = vi.hoisted(() => ({
  getByLabel: vi.fn(),
  window: {
    show: vi.fn(),
    setFocus: vi.fn(),
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path: string) => `asset://${path}`),
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/dpi", () => dpiMock);
vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: windowMock.currentMonitor,
  getCurrentWindow: windowMock.getCurrentWindow,
  primaryMonitor: windowMock.primaryMonitor,
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: webviewWindowMock.getByLabel,
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: dialogMock.open }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { runtimeBridge } from "./runtimeBridge";

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

describe("runtimeBridge", () => {
  beforeEach(() => {
    dialogMock.open.mockReset();
    dpiMock.LogicalPosition.mockClear();
    dpiMock.LogicalSize.mockClear();
    invokeMock.mockReset();
    listenMock.mockReset();
    windowMock.currentMonitor.mockReset();
    windowMock.getCurrentWindow.mockReturnValue(windowMock.window);
    windowMock.primaryMonitor.mockReset();
    windowMock.window.outerPosition.mockReset();
    windowMock.window.scaleFactor.mockReset();
    windowMock.window.setFocus.mockReset();
    windowMock.window.setPosition.mockReset();
    windowMock.window.setSize.mockReset();
    windowMock.window.show.mockReset();
    windowMock.window.hide.mockReset();
    windowMock.window.startDragging.mockReset();
    webviewWindowMock.getByLabel.mockReset();
    webviewWindowMock.window.show.mockReset();
    webviewWindowMock.window.setFocus.mockReset();
  });

  it("is the only frontend adapter for Tauri commands", async () => {
    invokeMock.mockResolvedValueOnce([
      {
        id: "olive",
        displayName: "Olive",
        spritesheetPath: "/tmp/spritesheet.webp",
        metadataPath: "/tmp/pet.json",
        diagnostics: [],
      },
    ]);
    await expect(runtimeBridge.listInstalledPets()).resolves.toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith("list_installed_pets");
  });

  it("sends chat and approvals through explicit commands", async () => {
    invokeMock.mockResolvedValue(undefined);
    await runtimeBridge.sendUserMessage("hi");
    await runtimeBridge.respondToApproval("req-1", "deny");
    expect(invokeMock).toHaveBeenCalledWith("send_user_message", { text: "hi" });
    expect(invokeMock).toHaveBeenCalledWith("respond_to_approval", {
      requestId: "req-1",
      action: "deny",
    });
  });

  it("exposes pet library and skill workflow commands", async () => {
    invokeMock.mockResolvedValue(undefined);
    await runtimeBridge.setActivePet("olive");
    await runtimeBridge.importPet("/tmp/staged-pet");
    await runtimeBridge.startPersonalityFlow();
    await runtimeBridge.tuckPet(null);
    await runtimeBridge.wakePet();
    await runtimeBridge.getPetVisibilityState();

    expect(invokeMock).toHaveBeenCalledWith("set_active_pet", { petId: "olive" });
    expect(invokeMock).toHaveBeenCalledWith("import_pet", { sourceDir: "/tmp/staged-pet" });
    expect(invokeMock).toHaveBeenCalledWith("start_personality_flow");
    expect(invokeMock).toHaveBeenCalledWith("tuck_pet", { until: null });
    expect(invokeMock).toHaveBeenCalledWith("wake_pet");
    expect(invokeMock).toHaveBeenCalledWith("get_pet_visibility_state");
  });

  it("subscribes to pet events", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);
    const handler = vi.fn();
    await expect(runtimeBridge.onPetEvent(handler)).resolves.toBe(unlisten);
    expect(listenMock).toHaveBeenCalledWith("pet://event", expect.any(Function));
  });

  it("hides the current hatching wizard webview window", async () => {
    await runtimeBridge.hideHatchingWizardWindow();
    expect(windowMock.window.hide).toHaveBeenCalledTimes(1);
  });

  it("shows and focuses the hatching wizard webview window by label", async () => {
    webviewWindowMock.getByLabel.mockResolvedValue(webviewWindowMock.window);

    await runtimeBridge.showHatchingWizardWindow();

    expect(webviewWindowMock.getByLabel).toHaveBeenCalledWith("hatching-wizard");
    expect(webviewWindowMock.window.show).toHaveBeenCalledTimes(1);
    expect(webviewWindowMock.window.setFocus).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when the hatching wizard window is unavailable", async () => {
    webviewWindowMock.getByLabel.mockResolvedValue(null);

    await expect(runtimeBridge.showHatchingWizardWindow()).rejects.toThrow(
      "Hatching wizard window is unavailable",
    );
  });

  it("uses the native directory dialog for workspace and pet imports", async () => {
    dialogMock.open.mockResolvedValueOnce("/workspace").mockResolvedValueOnce(["bad"]);

    await expect(runtimeBridge.pickDirectory({ defaultPath: "/old" })).resolves.toBe("/workspace");
    await expect(runtimeBridge.pickPetFolder()).resolves.toBeNull();

    expect(dialogMock.open).toHaveBeenNthCalledWith(1, {
      directory: true,
      multiple: false,
      defaultPath: "/old",
    });
    expect(dialogMock.open).toHaveBeenNthCalledWith(2, {
      directory: true,
      multiple: false,
      title: "Choose a staged pet folder",
    });
  });

  it("tucks the native window into a right-edge tab and clamps vertical position", async () => {
    windowMock.window.scaleFactor.mockResolvedValue(2);
    windowMock.currentMonitor.mockResolvedValue({
      workArea: {
        position: { x: 0, y: 0 },
        size: { width: 2000, height: 1200 },
      },
    });
    windowMock.window.outerPosition.mockResolvedValue({ x: 0, y: 2000 });

    await runtimeBridge.tuckWindowToTab();

    expect(windowMock.window.show).toHaveBeenCalledTimes(1);
    expect(dpiMock.LogicalSize).toHaveBeenCalledWith(88, 64);
    expect(windowMock.window.setSize).toHaveBeenCalledWith({ width: 88, height: 64 });
    expect(dpiMock.LogicalPosition).toHaveBeenCalledWith(920, 520);
    expect(windowMock.window.setPosition).toHaveBeenCalledWith({ x: 920, y: 520 });
  });

  it("restores the native pet window near the right edge and focuses it", async () => {
    windowMock.window.scaleFactor.mockResolvedValue(1);
    windowMock.currentMonitor.mockResolvedValue(null);
    windowMock.primaryMonitor.mockResolvedValue({
      workArea: {
        position: { x: 100, y: 50 },
        size: { width: 900, height: 700 },
      },
    });
    windowMock.window.outerPosition.mockResolvedValue({ x: 0, y: 0 });

    await runtimeBridge.restorePetWindowFromTab();

    expect(windowMock.window.show).toHaveBeenCalledTimes(1);
    expect(dpiMock.LogicalSize).toHaveBeenCalledWith(288, 368);
    expect(windowMock.window.setSize).toHaveBeenCalledWith({ width: 288, height: 368 });
    expect(dpiMock.LogicalPosition).toHaveBeenCalledWith(696, 66);
    expect(windowMock.window.setPosition).toHaveBeenCalledWith({ x: 696, y: 66 });
    expect(windowMock.window.setFocus).toHaveBeenCalledTimes(1);
  });

  it("still resizes/focuses when monitor data is unavailable", async () => {
    windowMock.window.scaleFactor.mockResolvedValue(1);
    windowMock.currentMonitor.mockResolvedValue(null);
    windowMock.primaryMonitor.mockResolvedValue(null);

    await runtimeBridge.tuckWindowToTab();
    await runtimeBridge.restorePetWindowFromTab();

    expect(windowMock.window.show).toHaveBeenCalledTimes(2);
    expect(windowMock.window.setSize).toHaveBeenNthCalledWith(1, { width: 88, height: 64 });
    expect(windowMock.window.setSize).toHaveBeenNthCalledWith(2, { width: 288, height: 368 });
    expect(windowMock.window.setPosition).not.toHaveBeenCalled();
    expect(windowMock.window.setFocus).toHaveBeenCalledTimes(1);
  });
});
