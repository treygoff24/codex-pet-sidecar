import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { genericDefaultPersona, type PetConfig } from "../../domain/petConfig";
import { useRuntimeRestart } from "../useRuntimeRestart";

const baseConfig = (overrides: Partial<PetConfig> = {}): PetConfig => ({
  petId: "olive",
  displayName: "Olive",
  spritesheetPath: "/tmp/spritesheet.webp",
  persona: genericDefaultPersona,
  mute: {},
  tuck: { tucked: false },
  workspaceCwd: "/repo",
  observers: { activeApp: false, windowTitle: false, workspace: false, idle: false },
  ambient: {
    enabled: false,
    intervalMinutes: 15,
    includeScreenshot: false,
    retainScreenshots: false,
  },
  runtime: { sessionPersistence: "ephemeral", safetyMode: "safe" },
  ...overrides,
});

describe("useRuntimeRestart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a restart 400ms after the first restart-relevant value lands", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ cfg }: { cfg: PetConfig | null }) => useRuntimeRestart(cfg, start, onError),
      { initialProps: { cfg: null as PetConfig | null } },
    );

    expect(start).not.toHaveBeenCalled();

    rerender({ cfg: baseConfig() });
    vi.advanceTimersByTime(399);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("ignores changes to non-restart fields like persona", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ cfg }: { cfg: PetConfig | null }) => useRuntimeRestart(cfg, start, onError),
      { initialProps: { cfg: baseConfig() } },
    );

    vi.advanceTimersByTime(450);
    expect(start).toHaveBeenCalledTimes(1);

    // Persona-only change must not retrigger.
    rerender({ cfg: baseConfig({ persona: "a different voice" }) });
    vi.advanceTimersByTime(800);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("ignores observer flips, ambient settings, and mute changes", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ cfg }: { cfg: PetConfig | null }) => useRuntimeRestart(cfg, start, onError),
      { initialProps: { cfg: baseConfig() } },
    );
    vi.advanceTimersByTime(450);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({
      cfg: baseConfig({
        observers: { activeApp: true, windowTitle: true, workspace: true, idle: true },
        ambient: {
          enabled: true,
          intervalMinutes: 30,
          includeScreenshot: true,
          retainScreenshots: true,
        },
        mute: { until: "2099-01-01T00:00:00Z" },
      }),
    });
    vi.advanceTimersByTime(800);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("restarts when safetyMode flips", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ cfg }: { cfg: PetConfig | null }) => useRuntimeRestart(cfg, start, onError),
      { initialProps: { cfg: baseConfig() } },
    );
    vi.advanceTimersByTime(450);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({
      cfg: baseConfig({ runtime: { sessionPersistence: "ephemeral", safetyMode: "power" } }),
    });
    vi.advanceTimersByTime(450);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("restarts when workspaceCwd changes", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ cfg }: { cfg: PetConfig | null }) => useRuntimeRestart(cfg, start, onError),
      { initialProps: { cfg: baseConfig({ workspaceCwd: "/a" }) } },
    );
    vi.advanceTimersByTime(450);
    expect(start).toHaveBeenCalledTimes(1);

    rerender({ cfg: baseConfig({ workspaceCwd: "/b" }) });
    vi.advanceTimersByTime(450);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("coalesces rapid restart-relevant changes into a single call", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const { rerender } = renderHook(
      ({ cfg }: { cfg: PetConfig | null }) => useRuntimeRestart(cfg, start, onError),
      { initialProps: { cfg: baseConfig() } },
    );

    // Initial mount fires once.
    vi.advanceTimersByTime(450);
    expect(start).toHaveBeenCalledTimes(1);

    // Three rapid safetyMode toggles within ~150ms.
    rerender({
      cfg: baseConfig({ runtime: { sessionPersistence: "ephemeral", safetyMode: "power" } }),
    });
    vi.advanceTimersByTime(50);
    rerender({
      cfg: baseConfig({ runtime: { sessionPersistence: "ephemeral", safetyMode: "safe" } }),
    });
    vi.advanceTimersByTime(50);
    rerender({
      cfg: baseConfig({ runtime: { sessionPersistence: "ephemeral", safetyMode: "power" } }),
    });
    // Not enough time elapsed for any of the cancelled timers to fire.
    expect(start).toHaveBeenCalledTimes(1);
    // After the last change settles, exactly one additional restart fires.
    vi.advanceTimersByTime(450);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("does not restart while the pet is tucked", () => {
    const start = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useRuntimeRestart(
        baseConfig({ tuck: { tucked: true, tuckedUntil: "2099-01-01T00:00:00Z" } }),
        start,
        vi.fn(),
      ),
    );
    vi.advanceTimersByTime(800);
    expect(start).not.toHaveBeenCalled();
  });

  it("surfaces errors from startPetRuntime via onError", async () => {
    const start = vi.fn().mockRejectedValue(new Error("nope"));
    const onError = vi.fn();
    renderHook(() => useRuntimeRestart(baseConfig(), start, onError));
    vi.advanceTimersByTime(450);
    // Let the rejected promise's microtask run.
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});
