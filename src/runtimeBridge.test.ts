import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: vi.fn((path: string) => `asset://${path}`), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn(() => ({ startDragging: vi.fn() })) }));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { runtimeBridge } from "./runtimeBridge";

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

describe("runtimeBridge", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
  });

  it("is the only frontend adapter for Tauri commands", async () => {
    invokeMock.mockResolvedValueOnce([{ id: "olive", displayName: "Olive", spritesheetPath: "/tmp/spritesheet.webp", metadataPath: "/tmp/pet.json", diagnostics: [] }]);
    await expect(runtimeBridge.listInstalledPets()).resolves.toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith("list_installed_pets");
  });

  it("sends chat and approvals through explicit commands", async () => {
    invokeMock.mockResolvedValue(undefined);
    await runtimeBridge.sendUserMessage("hi");
    await runtimeBridge.respondToApproval("req-1", "deny");
    expect(invokeMock).toHaveBeenCalledWith("send_user_message", { text: "hi" });
    expect(invokeMock).toHaveBeenCalledWith("respond_to_approval", { requestId: "req-1", action: "deny" });
  });

  it("subscribes to pet events", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);
    const handler = vi.fn();
    await expect(runtimeBridge.onPetEvent(handler)).resolves.toBe(unlisten);
    expect(listenMock).toHaveBeenCalledWith("pet://event", expect.any(Function));
  });
});
