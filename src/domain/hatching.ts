/**
 * Hatching domain types for the pet creation wizard.
 *
 * These types mirror the Rust backend structures in src-tauri/src/hatching/session.rs
 * and are used for type-safe communication between the frontend and backend.
 */

/**
 * Hatching session — owned by Rust backend, mutable across wizard steps.
 */
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
  phase: HatchingPhase;
  createdAt: string; // ISO 8601 timestamp
}

/**
 * Current phase of the hatching wizard.
 */
export type HatchingPhase =
  | "inspiration"
  | "brief"
  | "prototype"
  | { generating: GenerationProgress }
  | "review"
  | "importing"
  | { done: { petId: string } };

/**
 * Pet brief containing user-provided metadata.
 */
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

/**
 * Color palette specification for the pet.
 */
export interface PaletteSpec {
  primary: string;
  secondary: string;
  accent: string;
}

/**
 * Reference image uploaded by the user.
 */
export interface ReferenceImage {
  id: string;
  path: string;
  sha256: string;
  description: string | null;
  descriptionStatus: ReferenceDescriptionStatus;
  describedAt: string | null; // ISO 8601 timestamp
}

/**
 * Status of reference image description generation.
 */
export type ReferenceDescriptionStatus = "pending" | "ready" | "failed";

/**
 * Prototype state with iteration history.
 */
export interface PrototypeState {
  iterations: PrototypeIteration[];
  current: number;
}

/**
 * Single prototype iteration.
 */
export interface PrototypeIteration {
  n: number;
  revisedPrompt: string;
  summaryOfChanges: string;
  userFeedback: string | null;
  image: ImageArtifact;
  generatedAt: string; // ISO 8601 timestamp
}

/**
 * Animation row keys for the pet spritesheet.
 */
export type RowKey =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

/**
 * State of a single animation row.
 */
export interface RowState {
  prompt: string;
  image: ImageArtifact | null;
  derivedFrom: RowKey | null;
  mirrorDecision: MirrorDecision | null;
  attempts: number;
  lastError: string | null;
  status: RowStatus;
}

/**
 * Status of row generation.
 */
export type RowStatus = "pending" | "generating" | "ready" | "failed";

/**
 * Image artifact with provenance tracking.
 */
export interface ImageArtifact {
  sourcePath: string;
  outputPath: string;
  sourceProvenance: SourceProvenance;
  sourceSha256: string;
  outputSha256: string;
  metadata: ImageMetadata;
}

/**
 * Provenance of the image source.
 */
export type SourceProvenance = "built-in-imagegen" | "deterministic-mirror" | "synthetic-test";

/**
 * Image metadata.
 */
export interface ImageMetadata {
  width: number;
  height: number;
  mode: string;
  format: string;
}

/**
 * Mirror decision for running-left derivation.
 */
export interface MirrorDecision {
  approved: boolean;
  reason: string;
  decidedAt: string; // ISO 8601 timestamp
}

/**
 * Progress of row generation.
 */
export interface GenerationProgress {
  rowsCompleted: number;
  rowsTotal: number;
  estimatedRemaining: number; // milliseconds
  totalImagegenCalls: number;
}

/**
 * Summary of an orphan (interrupted) hatching session.
 */
export interface OrphanSummary {
  sessionId: string;
  displayName: string | null;
  phase: HatchingPhase;
  createdAt: string; // ISO 8601 timestamp
}

/**
 * Helper to check if a phase is a specific type.
 */
export function isPhaseGenerating(
  phase: HatchingPhase,
): phase is { generating: GenerationProgress } {
  return typeof phase === "object" && "generating" in phase;
}

export function isPhaseDone(phase: HatchingPhase): phase is { done: { petId: string } } {
  return typeof phase === "object" && "done" in phase;
}

/**
 * Helper to get a display-friendly phase name.
 */
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
