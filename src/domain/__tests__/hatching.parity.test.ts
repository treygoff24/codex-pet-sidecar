import fixture from "../__fixtures__/hatching-session.json";
import {
  HATCHING_ROW_LABELS,
  getGeneratingProgress,
  getPhaseDisplayName,
  isPhaseDone,
  isPhaseGenerating,
  type HatchingPhase,
  type HatchingSession,
  type RowKey,
  type RowStatus,
} from "../hatching";

type HatchingFixture = {
  session: HatchingSession;
  phases: HatchingPhase[];
  rowKeys: RowKey[];
  rowStatuses: RowStatus[];
};

const typedFixture = fixture as HatchingFixture;

const expectedPhaseLabels = [
  "inspiration",
  "brief",
  "prompts",
  "prototype",
  "Generating",
  "review",
  "importing",
  "Done",
];

const expectedRowKeys = [
  "idle",
  "running-right",
  "running-left",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
] as const satisfies readonly RowKey[];

const expectedRowStatuses = [
  "pending",
  "generating",
  "ready",
  "failed",
] as const satisfies readonly RowStatus[];

describe("hatching Rust contract parity", () => {
  it("loads the fixture as a HatchingSession with direct generating progress", () => {
    const hatchingSession = typedFixture.session;

    expect(hatchingSession.id).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(isPhaseGenerating(hatchingSession.phase)).toBe(true);
    expect(getGeneratingProgress(hatchingSession.phase)?.estimatedRemaining).toBe(180000);
  });

  it("covers every HatchingPhase variant", () => {
    const phases = typedFixture.phases;
    const labels = phases.map(getPhaseDisplayName);

    expect(labels).toEqual(expectedPhaseLabels);
    expect(isPhaseDone(phases[phases.length - 1] as HatchingPhase)).toBe(true);
  });

  it("covers every RowKey and RowStatus discriminator", () => {
    const rowKeys = typedFixture.rowKeys;
    const rowStatuses = typedFixture.rowStatuses;

    expect(rowKeys).toEqual(expectedRowKeys);
    expect(rowStatuses).toEqual(expectedRowStatuses);
    expect(Object.keys(HATCHING_ROW_LABELS)).toEqual([...expectedRowKeys]);
  });
});
