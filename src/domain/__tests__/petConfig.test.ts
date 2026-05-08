import { describe, expect, it } from "vitest";
import { isTuckActive } from "../petConfig";

describe("isTuckActive", () => {
  it("treats expired timed tucks as visible", () => {
    expect(
      isTuckActive(
        { tucked: true, tuckedUntil: "2026-05-05T10:00:00.000Z" },
        new Date("2026-05-05T10:01:00.000Z"),
      ),
    ).toBe(false);
  });

  it("keeps future and untimed tucks active", () => {
    expect(
      isTuckActive(
        { tucked: true, tuckedUntil: "2026-05-05T10:02:00.000Z" },
        new Date("2026-05-05T10:01:00.000Z"),
      ),
    ).toBe(true);
    expect(isTuckActive({ tucked: true })).toBe(true);
  });

  it("treats unparseable timestamps as expired so the user can wake the pet", () => {
    expect(isTuckActive({ tucked: true, tuckedUntil: "not a date" })).toBe(false);
    expect(isTuckActive({ tucked: true, tuckedUntil: "" })).toBe(false);
  });
});
