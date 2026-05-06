import { describe, expect, it } from "vitest";
import { formatMemoryForBaseInstructions } from "../memory";
import { canSendProactiveMessage, isMuted, muteUntilForChoice } from "../rateLimit";

describe("rate limiting and memory formatting", () => {
  const now = new Date(2026, 4, 5, 11, 0, 0, 0);

  it("honors active mute and ignores malformed mute timestamps", () => {
    expect(isMuted(now, new Date(now.getTime() + 60_000).toISOString())).toBe(true);
    expect(isMuted(now, new Date(now.getTime() - 60_000).toISOString())).toBe(false);
    expect(isMuted(now, "not-a-date")).toBe(false);
  });

  it("calculates the exact mute choices", () => {
    expect(muteUntilForChoice("30m", now)).toBe(new Date(2026, 4, 5, 11, 30, 0, 0).toISOString());
    expect(muteUntilForChoice("2h", now)).toBe(new Date(2026, 4, 5, 13, 0, 0, 0).toISOString());
    expect(muteUntilForChoice("tomorrow", now)).toBe(
      new Date(2026, 4, 6, 9, 0, 0, 0).toISOString(),
    );
  });

  it("enforces the 10-minute proactive floor", () => {
    expect(canSendProactiveMessage({ now, minMinutes: 10 })).toBe(true);
    expect(
      canSendProactiveMessage({
        now,
        minMinutes: 10,
        lastSentAt: new Date(now.getTime() - 9 * 60_000).toISOString(),
      }),
    ).toBe(false);
    expect(
      canSendProactiveMessage({
        now,
        minMinutes: 10,
        lastSentAt: new Date(now.getTime() - 10 * 60_000).toISOString(),
      }),
    ).toBe(true);
    expect(canSendProactiveMessage({ now, minMinutes: 10, lastSentAt: "bad" })).toBe(true);
    expect(
      canSendProactiveMessage({
        now,
        minMinutes: 10,
        muteUntil: new Date(now.getTime() + 60 * 60_000).toISOString(),
      }),
    ).toBe(false);
  });

  it("formats memory for base instructions", () => {
    expect(formatMemoryForBaseInstructions("\n# Memory\n- Riley likes tiny pets\n")).toContain(
      "# Memory",
    );
    expect(formatMemoryForBaseInstructions("   ")).toBe("Pet memory is currently empty.");
  });
});
