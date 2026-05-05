import { render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { defaultPersona, type PetConfig } from "../../domain/petConfig";
import { SettingsPanel } from "../SettingsPanel";

function petConfig(overrides: Partial<PetConfig> = {}): PetConfig {
  return {
    petId: "olive",
    displayName: "Olive",
    spritesheetPath: "/tmp/spritesheet.webp",
    persona: defaultPersona,
    mute: {},
    workspaceCwd: "/repo",
    observers: { activeApp: true, windowTitle: true, workspace: true, idle: true },
    ambient: {
      enabled: true,
      intervalMinutes: 15,
      includeScreenshot: false,
      retainScreenshots: false,
    },
    proactive: { enabled: true, minMinutesBetweenMessages: 10 },
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
});
