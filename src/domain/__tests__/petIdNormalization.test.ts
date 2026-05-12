import fixture from "../__fixtures__/pet-id-normalization.json";
import { normalizeDisplayNameToPetId } from "../petIdNormalization";

describe("normalizeDisplayNameToPetId", () => {
  it("matches the Rust pet-id normalization fixture", () => {
    for (const { input, expected } of fixture) {
      expect(normalizeDisplayNameToPetId(input)).toBe(expected);
    }
  });
});
