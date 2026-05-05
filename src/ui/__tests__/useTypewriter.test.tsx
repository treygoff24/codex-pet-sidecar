import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTypewriter } from "../../hooks/useTypewriter";
import { defaultPersona, type PetConfig } from "../../domain/petConfig";
import { MuteControl } from "../MuteControl";
import { SettingsPanel } from "../SettingsPanel";
import { ChatDrawer } from "../ChatDrawer";

function TypewriterHarness({ text }: { text: string }) {
  return <p data-testid="typed">{useTypewriter(text, 50)}</p>;
}

describe("pet UI helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals text in order and handles empty text", () => {
    vi.useFakeTimers();
    render(<TypewriterHarness text="Hi." />);
    expect(screen.getByTestId("typed")).toHaveTextContent("");
    act(() => vi.advanceTimersByTime(20));
    expect(screen.getByTestId("typed")).toHaveTextContent("H");
    act(() => vi.advanceTimersByTime(40));
    expect(screen.getByTestId("typed")).toHaveTextContent("Hi");
  });

  it("keeps drawer overflow characters intact", async () => {
    const transcript = ["A long streamed note that should remain readable after the drawer opens."];
    const onSend = vi.fn();
    render(<ChatDrawer open transcript={transcript} onSend={onSend} />);
    expect(screen.getByTestId("drawer-thread")).toHaveTextContent(transcript[0]);
    await userEvent.type(screen.getByLabelText("Message your pet"), "remember this");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSend).toHaveBeenCalledWith("remember this");
  });

  it("renders exact mute choices", () => {
    render(<MuteControl onMute={vi.fn()} />);
    expect(screen.getByRole("button", { name: "30 minutes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 hours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Until tomorrow" })).toBeInTheDocument();
  });

  it("keeps workspace cwd editable through settings", async () => {
    const config: PetConfig = {
      petId: "olive",
      displayName: "Olive",
      spritesheetPath: "/tmp/spritesheet.webp",
      persona: defaultPersona,
      mute: {},
      workspaceCwd: "/old",
      observers: { activeApp: true, windowTitle: true, workspace: true, idle: true },
      proactive: { enabled: true, minMinutesBetweenMessages: 10 },
    };
    const onChange = vi.fn();
    function Harness() {
      const [current, setCurrent] = useState(config);
      return <SettingsPanel config={current} onChange={(next) => { onChange(next); setCurrent(next); }} />;
    }
    render(<Harness />);
    await userEvent.clear(screen.getByLabelText("Workspace folder"));
    await userEvent.type(screen.getByLabelText("Workspace folder"), "/new");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ workspaceCwd: "/new" }));
  });
});
