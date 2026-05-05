import { describe, expect, it } from "vitest";
import { formatMemoryForBaseInstructions } from "../memory";
import { canSendProactiveMessage, isMuted, muteUntilForChoice } from "../rateLimit";

describe("rate limiting and memory formatting", () => {
  const now = new Date("2026-05-05T15:00:00.000Z");

  it("honors active mute and ignores malformed mute timestamps", () => {
    expect(isMuted(now, "2026-05-05T15:01:00.000Z")).toBe(true);
    expect(isMuted(now, "2026-05-05T14:59:00.000Z")).toBe(false);
    expect(isMuted(now, "not-a-date")).toBe(false);
  });

  it("calculates the exact mute choices", () => {
    expect(muteUntilForChoice("30m", now)).toBe("2026-05-05T15:30:00.000Z");
    expect(muteUntilForChoice("2h", now)).toBe("2026-05-05T17:00:00.000Z");
    expect(muteUntilForChoice("tomorrow", now)).toBe("2026-05-06T14:00:00.000Z");
  });

  it("enforces the 10-minute proactive floor", () => {
    expect(canSendProactiveMessage({ now, minMinutes: 10 })).toBe(true);
    expect(
      canSendProactiveMessage({ now, minMinutes: 10, lastSentAt: "2026-05-05T14:51:00.000Z" }),
    ).toBe(false);
    expect(
      canSendProactiveMessage({ now, minMinutes: 10, lastSentAt: "2026-05-05T14:50:00.000Z" }),
    ).toBe(true);
    expect(canSendProactiveMessage({ now, minMinutes: 10, lastSentAt: "bad" })).toBe(true);
    expect(
      canSendProactiveMessage({ now, minMinutes: 10, muteUntil: "2026-05-05T16:00:00.000Z" }),
    ).toBe(false);
  });

  it("formats memory for base instructions", () => {
    expect(formatMemoryForBaseInstructions("\n# Memory\n- Trey likes tiny pets\n")).toContain(
      "# Memory",
    );
    expect(formatMemoryForBaseInstructions("   ")).toBe("Pet memory is currently empty.");
  });
});
