/**
 * Hatching domain types for the pet creation wizard.
 *
 * These types mirror the Rust backend structures in src-tauri/src/hatching/session.rs
 * and are used for type-safe communication between the frontend and backend.
 */

import type { PetAnimationState } from "./petAnimation";

export interface HatchingSession {
  id: string;
  runtimeHome: string;
  workspace: string;
  codexThreadId: string | null;
  brief: PetBrief | null;
  archetype: string | null;
  referenceImage: ReferenceImage | null;
  prototype: PrototypeState | null;
  rows: Record<RowKey, RowState>;
  promptDrafts: PromptDraft[];
  runtimeFeed: RuntimeFeedEvent[];
  atlasReview: AtlasReviewArtifact | null;
  phase: HatchingPhase;
  createdAt: string; // ISO 8601 timestamp
}

export type HatchingPhase =
  | "inspiration"
  | "brief"
  | "prompts"
  | "prototype"
  | { generating: GenerationProgress }
  | "review"
  | "importing"
  | { done: { petId: string } };

export interface PetBrief {
  displayName: string;
  petId: string;
  description: string;
  personality: string[];
  palette: PaletteSpec | null;
  backstory: string | null;
  speechStyle: string | null;
  behavioralQuirks: string | null;
  visualNotes: string | null;
}

export interface PaletteSpec {
  primary: string;
  secondary: string;
  accent: string;
}

export interface ReferenceImage {
  id: string;
  path: string;
  sha256: string;
  description: string | null;
  descriptionStatus: ReferenceDescriptionStatus;
  describedAt: string | null; // ISO 8601 timestamp
}

export type ReferenceDescriptionStatus = "pending" | "ready" | "failed";

export interface PrototypeState {
  iterations: PrototypeIteration[];
  current: number;
}

export interface PrototypeIteration {
  n: number;
  revisedPrompt: string;
  summaryOfChanges: string;
  userFeedback: string | null;
  image: ImageArtifact;
  generatedAt: string; // ISO 8601 timestamp
}

export type RowKey = PetAnimationState;

export interface RowState {
  prompt: string;
  image: ImageArtifact | null;
  derivedFrom: RowKey | null;
  mirrorDecision: MirrorDecision | null;
  attempts: number;
  lastError: string | null;
  status: RowStatus;
}

export type RowStatus = "pending" | "generating" | "ready" | "failed";

export interface ImageArtifact {
  sourcePath: string;
  outputPath: string;
  sourceProvenance: SourceProvenance;
  sourceSha256: string | null;
  outputSha256: string;
  metadata: ImageMetadata;
}

export type SourceProvenance = "built-in-imagegen" | "deterministic-mirror" | "synthetic-test";

export interface ImageMetadata {
  width: number;
  height: number;
  mode: string;
  format: string;
}

export interface MirrorDecision {
  approved: boolean;
  reason: string;
  decidedAt: string; // ISO 8601 timestamp
}

export interface GenerationProgress {
  rowsCompleted: number;
  rowsTotal: number;
  estimatedRemaining: number; // milliseconds
  totalImagegenCalls: number;
}

export interface PromptDraft {
  rowKey: RowKey;
  label: string;
  prompt: string;
  derivedFrom: RowKey | null;
  editable: boolean;
}

export interface RuntimeFeedEvent {
  id: string;
  at: string; // ISO 8601 timestamp
  tone: "ok" | "work" | "info" | "warn" | "error";
  message: string;
}

export interface AtlasReviewArtifact {
  atlasPath: string;
  validationPath: string | null;
  checks: AtlasReviewCheck[];
  composedAt: string; // ISO 8601 timestamp
}

export interface AtlasReviewCheck {
  label: string;
  ok: boolean;
  detail: string | null;
}

export interface OrphanSummary {
  sessionId: string;
  displayName: string | null;
  phase: HatchingPhase;
  createdAt: string; // ISO 8601 timestamp
}

export interface BriefSubmitOutcome {
  invalidatesIterations: boolean;
  requiresConfirmation: boolean;
}

export interface PetIdPreview {
  petId: string;
  available: boolean;
  suggestion: string | null;
}

export type HatchingAtlasReviewRow = {
  key: RowKey;
  label: string;
};

export const HATCHING_ROW_LABELS = {
  idle: { label: "Idle" },
  "running-right": { label: "Running Right" },
  "running-left": { label: "Running Left" },
  waving: { label: "Waving" },
  jumping: { label: "Jumping" },
  failed: { label: "Failed" },
  waiting: { label: "Waiting" },
  running: { label: "Running" },
  review: { label: "Review" },
} as const satisfies Record<RowKey, Omit<HatchingAtlasReviewRow, "key">>;

export const HATCHING_ATLAS_REVIEW_ROW_KEYS = [
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

export const HATCHING_ATLAS_REVIEW_ROWS = HATCHING_ATLAS_REVIEW_ROW_KEYS.map((key) => ({
  key,
  ...HATCHING_ROW_LABELS[key],
})) satisfies readonly HatchingAtlasReviewRow[];

export function isPhaseGenerating(
  phase: HatchingPhase,
): phase is { generating: GenerationProgress } {
  return typeof phase === "object" && "generating" in phase;
}

export function getGeneratingProgress(phase: HatchingPhase): GenerationProgress | null {
  return isPhaseGenerating(phase) ? phase.generating : null;
}

export function isPhaseDone(phase: HatchingPhase): phase is { done: { petId: string } } {
  return typeof phase === "object" && "done" in phase;
}

export function getPhaseDisplayName(phase: HatchingPhase): string {
  if (typeof phase === "string") {
    return phase;
  }
  if ("generating" in phase) {
    return "Generating";
  }
  if ("done" in phase) {
    return "Done";
  }
  return "Unknown";
}
