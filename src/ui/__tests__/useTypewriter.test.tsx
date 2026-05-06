import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTypewriter } from "../../hooks/useTypewriter";
import { MuteControl } from "../MuteControl";
import { ChatDrawer } from "../ChatDrawer";
import { ChatInputBar } from "../ChatInputBar";

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

  it("keeps revealed text when the input grows (streaming append)", () => {
    vi.useFakeTimers();
    const tick = () => act(() => vi.advanceTimersByTime(25));
    const { rerender } = render(<TypewriterHarness text="Hello" />);
    tick();
    tick();
    tick();
    const partial = screen.getByTestId("typed").textContent ?? "";
    expect(partial.length).toBeGreaterThanOrEqual(3);
    rerender(<TypewriterHarness text="Hello, world!" />);
    expect(screen.getByTestId("typed").textContent).toBe(partial);
    for (let i = 0; i < 40; i++) tick();
    expect(screen.getByTestId("typed")).toHaveTextContent("Hello, world!");
  });

  it("restarts the typewriter when the input is replaced with a different prefix", () => {
    vi.useFakeTimers();
    const tick = () => act(() => vi.advanceTimersByTime(25));
    const { rerender } = render(<TypewriterHarness text="Hello" />);
    for (let i = 0; i < 8; i++) tick();
    expect(screen.getByTestId("typed")).toHaveTextContent("Hello");
    rerender(<TypewriterHarness text="Different" />);
    expect(screen.getByTestId("typed").textContent).toBe("");
    for (let i = 0; i < 14; i++) tick();
    expect(screen.getByTestId("typed")).toHaveTextContent("Different");
  });

  it("renders the transcript when the drawer is open", () => {
    const transcript = ["A long streamed note that should remain readable after the drawer opens."];
    render(<ChatDrawer open transcript={transcript} />);
    expect(screen.getByTestId("drawer-thread")).toHaveTextContent(transcript[0]);
  });

  it("shows an empty-state hint when the drawer opens with no transcript", () => {
    render(<ChatDrawer open transcript={[]} />);
    expect(screen.getByTestId("drawer-thread")).toHaveTextContent("Nothing yet");
  });

  it("sends typed messages through the always-visible input bar", async () => {
    const onSend = vi.fn();
    render(<ChatInputBar onSend={onSend} />);
    await userEvent.type(screen.getByLabelText("Message your pet"), "remember this");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenCalledWith("remember this");
  });

  it("keeps typed messages when sending fails", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("busy"));
    render(<ChatInputBar onSend={onSend} />);
    await userEvent.type(screen.getByLabelText("Message your pet"), "do not lose this");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByLabelText("Message your pet")).toHaveValue("do not lose this");
  });

  it("renders exact mute choices", () => {
    render(<MuteControl onMute={vi.fn()} />);
    expect(screen.getByRole("button", { name: "30 minutes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2 hours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Until tomorrow" })).toBeInTheDocument();
  });
});
