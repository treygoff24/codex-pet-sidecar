import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  isOfficialUpdateChannel,
  UPDATE_CHECK_INTERVAL_MS,
  useOfficialUpdater,
} from "../useOfficialUpdater";
import type { UpdaterBridge } from "../../updaterBridge";

function bridge(overrides: Partial<UpdaterBridge> = {}): UpdaterBridge {
  return {
    getCurrentVersion: vi.fn().mockResolvedValue("0.1.0"),
    checkForUpdate: vi.fn().mockResolvedValue(null),
    relaunchApp: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useOfficialUpdater", () => {
  it("keeps the dev channel disabled and never checks official releases", async () => {
    const updateBridge = bridge();
    const { result } = renderHook(() =>
      useOfficialUpdater({ enabled: false, bridge: updateBridge }),
    );

    expect(result.current.state.status).toBe("disabled");
    await result.current.checkForUpdates();
    expect(updateBridge.checkForUpdate).not.toHaveBeenCalled();
  });

  it("detects official release builds only when production and explicitly marked official", () => {
    expect(
      isOfficialUpdateChannel({
        PROD: true,
        DEV: false,
        MODE: "production",
        BASE_URL: "/",
        SSR: false,
        VITE_CODEX_PET_RELEASE_CHANNEL: "official",
      }),
    ).toBe(true);
    expect(
      isOfficialUpdateChannel({
        PROD: true,
        DEV: false,
        MODE: "production",
        BASE_URL: "/",
        SSR: false,
      }),
    ).toBe(false);
  });

  it("surfaces an available update from the official channel", async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    const updateBridge = bridge({
      checkForUpdate: vi.fn().mockResolvedValue({
        version: "0.2.0",
        body: "Better pets",
        install,
      }),
    });

    const { result } = renderHook(() =>
      useOfficialUpdater({ enabled: true, bridge: updateBridge }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("available"));
    expect(result.current.state.currentVersion).toBe("0.1.0");
    expect(result.current.state.availableVersion).toBe("0.2.0");
    expect(result.current.state.notes).toBe("Better pets");
  });

  it("tracks install progress and relaunches after installation", async () => {
    const install = vi.fn(async (onEvent) => {
      onEvent({ event: "Started", data: { contentLength: 100 } });
      onEvent({ event: "Progress", data: { chunkLength: 40 } });
      onEvent({ event: "Progress", data: { chunkLength: 60 } });
      onEvent({ event: "Finished" });
    });
    const updateBridge = bridge({
      checkForUpdate: vi.fn().mockResolvedValue({ version: "0.2.0", install }),
    });

    const { result } = renderHook(() =>
      useOfficialUpdater({ enabled: true, bridge: updateBridge }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("available"));
    await act(async () => {
      await result.current.installUpdate();
    });

    await waitFor(() => expect(updateBridge.relaunchApp).toHaveBeenCalled());
    expect(result.current.state.downloadedBytes).toBe(100);
  });

  it("surfaces install errors without relaunching", async () => {
    const updateBridge = bridge({
      checkForUpdate: vi.fn().mockResolvedValue({
        version: "0.2.0",
        install: vi.fn().mockRejectedValue(new Error("signature mismatch")),
      }),
    });

    const { result } = renderHook(() =>
      useOfficialUpdater({ enabled: true, bridge: updateBridge }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("available"));
    await act(async () => {
      await result.current.installUpdate();
    });

    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(result.current.state.error).toBe("signature mismatch");
    expect(updateBridge.relaunchApp).not.toHaveBeenCalled();
  });

  it("re-checks for updates automatically every 6 hours when enabled", async () => {
    vi.useFakeTimers();
    const updateBridge = bridge();

    const { unmount } = renderHook(() =>
      useOfficialUpdater({ enabled: true, bridge: updateBridge }),
    );

    // Initial check fires on mount; wait for it to settle.
    await act(async () => {
      await Promise.resolve();
    });

    const callsAfterMount = (updateBridge.checkForUpdate as ReturnType<typeof vi.fn>).mock.calls
      .length;

    // Advance one full 6-hour interval.
    await act(async () => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
      await Promise.resolve();
    });

    // Advance a second full 6-hour interval.
    await act(async () => {
      vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(updateBridge.checkForUpdate as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(
      callsAfterMount + 2,
    );

    unmount();
    vi.useRealTimers();
  });
});
