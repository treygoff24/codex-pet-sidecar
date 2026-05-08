import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = styles.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]+)\\}`));
  return match?.groups?.body ?? "";
}

describe("settings sheet styles", () => {
  it("keeps the settings body scrollable inside the fixed pet window", () => {
    const sheet = cssRule(".settings-sheet");
    const panel = cssRule(".settings-panel");

    expect(sheet).toContain("min-height: 0");
    expect(panel).toContain("min-height: 0");
    expect(panel).toContain("min-width: 0");
    expect(panel).toContain("overflow-y: auto");
  });

  it("keeps fieldset choice controls inline with their labels", () => {
    const choiceInput = styles.match(
      /\.settings-panel input\[type="checkbox"\],\s*\.settings-panel input\[type="radio"\]\s*\{(?<body>[^}]+)\}/,
    )?.groups?.body;
    const choiceLabel = styles.match(
      /\.settings-panel fieldset label:has\(input\[type="checkbox"\]\),\s*\.settings-panel fieldset label:has\(input\[type="radio"\]\)\s*\{(?<body>[^}]+)\}/,
    )?.groups?.body;

    expect(choiceInput ?? "").toContain("width: auto");
    expect(choiceInput ?? "").toContain("flex: 0 0 auto");
    expect(choiceLabel ?? "").toContain("display: flex");
    expect(choiceLabel ?? "").toContain("align-items: center");
  });

  it("wraps long settings content and gives modal controls usable targets", () => {
    const paragraph = cssRule(".settings-panel p");
    const fieldset = cssRule(".settings-panel fieldset");
    const closeButton = cssRule(".sheet-header button");
    const disabledButton = cssRule("button:disabled");

    expect(paragraph).toContain("overflow-wrap: anywhere");
    expect(fieldset).toContain("min-width: 0");
    expect(closeButton).toContain("min-width: 32px");
    expect(closeButton).toContain("min-height: 32px");
    expect(disabledButton).toContain("cursor: not-allowed");
  });

  it("keeps long pet speech previews from pushing Olive behind the chat input", () => {
    const stage = cssRule(".pet-stage");
    const bubble = cssRule(".speech-bubble");
    const bubbleText = cssRule(".speech-bubble__text");

    expect(stage).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(stage).toContain("min-height: 0");
    expect(bubble).toContain("max-height: 112px");
    expect(bubble).toContain("overflow: hidden");
    expect(bubbleText).toContain("-webkit-line-clamp: 4");
    expect(bubbleText).toContain("overflow-wrap: anywhere");
  });
});
