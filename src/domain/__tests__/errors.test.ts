import { formatError } from "../errors";

describe("formatError", () => {
  it("returns the message from Error instances", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });

  it("returns string errors verbatim", () => {
    expect(formatError("just a string")).toBe("just a string");
  });

  it("duck-types objects with a string message", () => {
    expect(formatError({ message: "wire error", code: 42 })).toBe("wire error");
  });

  it("ignores message fields that are not strings", () => {
    expect(formatError({ message: 42 })).toBe('{"message":42}');
  });

  it("JSON-stringifies plain objects", () => {
    expect(formatError({ kind: "thing", count: 3 })).toBe('{"kind":"thing","count":3}');
  });

  it("falls back when JSON.stringify throws (cycles)", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(formatError(cyclic)).toBe("Unknown error");
  });

  it("honors a custom fallback for unrepresentable inputs", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(formatError(cyclic, "specific fallback")).toBe("specific fallback");
  });
});
