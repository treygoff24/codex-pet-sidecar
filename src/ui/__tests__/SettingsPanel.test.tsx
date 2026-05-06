import { render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { genericDefaultPersona, type PetConfig } from "../../domain/petConfig";
import { SettingsPanel } from "../SettingsPanel";

function petConfig(overrides: Partial<PetConfig> = {}): PetConfig {
  return {
    petId: "olive",
    displayName: "Olive",
    spritesheetPath: "/tmp/spritesheet.webp",
    persona: genericDefaultPersona,
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
    proactive: { enabled: true, minMinutesBetweenMessages: 10 },
    runtime: { sessionPersistence: "ephemeral", safetyMode: "safe" },
    ...overrides,
  };
}

describe("SettingsPanel", () => {
  it("keeps workspace cwd editable", async () => {
    const config = petConfig({ workspaceCwd: "/old" });
    const onChange = vi.fn();
    function Harness() {
      const [current, setCurrent] = useState(config);
      return (
        <SettingsPanel
          config={current}
          onChange={(next) => {
            onChange(next);
            setCurrent(next);
          }}
        />
      );
    }
    render(<Harness />);
    await userEvent.clear(screen.getByLabelText("Workspace folder"));
    await userEvent.type(screen.getByLabelText("Workspace folder"), "/new");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceCwd: "/new" }));
  });

  it("updates ambient awareness settings", async () => {
    const onChange = vi.fn();
    render(<SettingsPanel config={petConfig()} onChange={onChange} />);
    await userEvent.click(
      screen.getByLabelText("Include an opt-in screenshot with ambient checks"),
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        ambient: expect.objectContaining({ includeScreenshot: true }),
      }),
    );
  });

  it("clamps ambient interval to the minimum when cleared", async () => {
    const onChange = vi.fn();
    render(<SettingsPanel config={petConfig()} onChange={onChange} />);
    await userEvent.clear(screen.getByLabelText("Check interval, minutes"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ambient: expect.objectContaining({ intervalMinutes: 10 }),
      }),
    );
  });

  it("keeps ambient settings independent across multiple changes", async () => {
    const onChange = vi.fn();
    function Harness() {
      const [current, setCurrent] = useState(petConfig());
      return (
        <SettingsPanel
          config={current}
          onChange={(next) => {
            onChange(next);
            setCurrent(next);
          }}
        />
      );
    }

    render(<Harness />);
    await userEvent.click(
      screen.getByLabelText("Let the pet quietly check context every few minutes"),
    );
    await userEvent.click(screen.getByLabelText("Keep ambient screenshots on disk after checks"));

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ambient: {
          enabled: false,
          intervalMinutes: 15,
          includeScreenshot: false,
          retainScreenshots: true,
        },
      }),
    );
  });

  it("updates explicit safe runtime controls", async () => {
    const onChange = vi.fn();
    render(<SettingsPanel config={petConfig()} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText("Save pet sessions in Codex history"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({ sessionPersistence: "savedHistory" }),
      }),
    );

    await userEvent.click(
      screen.getByLabelText("Power mode: high-risk broad local access for trusted workspaces only"),
    );
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ runtime: expect.objectContaining({ safetyMode: "power" }) }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Enable Power mode" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ runtime: expect.objectContaining({ safetyMode: "power" }) }),
    );
  });

  it("does not render Olive reset without a reset handler", () => {
    render(<SettingsPanel config={petConfig()} onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Reset to bundled Olive" })).toBeNull();
  });

  it("calls the Olive reset handler when provided", async () => {
    const onReset = vi.fn();
    render(<SettingsPanel config={petConfig()} onChange={vi.fn()} onResetPersonality={onReset} />);
    await userEvent.click(screen.getByRole("button", { name: "Reset to bundled Olive" }));
    expect(onReset).toHaveBeenCalled();
  });
});
