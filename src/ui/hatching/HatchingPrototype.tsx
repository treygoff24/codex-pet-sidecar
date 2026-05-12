import { useEffect, useMemo, useState } from "react";
import type { PrototypeState, ReferenceImage } from "../../domain/hatching";
import { runtimeBridge } from "../../runtimeBridge";

// Nudge user to settle (pick closest version) on iter 4, 7, 10, ...
const FATIGUE_NUDGE_FIRST_ITERATION = 4;
const FATIGUE_NUDGE_CADENCE = 3;

function shouldShowFatigueNudge(iterationN: number): boolean {
  if (iterationN < FATIGUE_NUDGE_FIRST_ITERATION) return false;
  return (iterationN - FATIGUE_NUDGE_FIRST_ITERATION) % FATIGUE_NUDGE_CADENCE === 0;
}

function generateButtonLabel({
  isLoading,
  hasIteration,
  hasPendingFeedback,
}: {
  isLoading: boolean;
  hasIteration: boolean;
  hasPendingFeedback: boolean;
}): string {
  if (isLoading) return hasIteration ? "Generating revision..." : "Generating...";
  if (!hasIteration) return "Generate prototype";
  if (hasPendingFeedback) return "Generate revised prototype →";
  return "Try another version";
}

interface HatchingPrototypeProps {
  prototype?: PrototypeState | null;
  referenceImage?: ReferenceImage | null;
  onGeneratePrototype: (feedback: string | null) => void;
  onAcceptPrototype: () => void;
  onRevertToIteration?: (n: number) => void;
  isLoading?: boolean;
  error?: string | null;
}

function rewriteErrorCopy(error: string): string {
  return error.includes("RewriteFailed") || error.includes("prototype prompt rewrite failed")
    ? "The model could not return a valid prompt rewrite. Try shorter, more concrete feedback."
    : error;
}

export function HatchingPrototype({
  prototype = null,
  referenceImage = null,
  onGeneratePrototype,
  onAcceptPrototype,
  onRevertToIteration,
  isLoading = false,
  error = null,
}: HatchingPrototypeProps) {
  const [feedback, setFeedback] = useState("");
  const current = prototype?.iterations[prototype.current] ?? null;
  const [promptDraft, setPromptDraft] = useState(current?.revisedPrompt ?? "");
  const [pendingRevisionFor, setPendingRevisionFor] = useState<number | null>(null);
  const referencePending = referenceImage?.descriptionStatus === "pending";

  useEffect(() => {
    setPromptDraft(current?.revisedPrompt ?? "");
  }, [current?.revisedPrompt]);

  useEffect(() => {
    if (isLoading) return;
    if (pendingRevisionFor === null) return;
    if (!current || current.n >= pendingRevisionFor || error) {
      setPendingRevisionFor(null);
    }
  }, [current, error, isLoading, pendingRevisionFor]);

  const previewUrl = useMemo(
    () => (current ? runtimeBridge.petAssetUrl(current.image.outputPath) : null),
    [current],
  );

  function generate() {
    const editedPrompt =
      promptDraft.trim() && promptDraft !== current?.revisedPrompt ? promptDraft : null;
    setPendingRevisionFor((current?.n ?? 0) + 1);
    onGeneratePrototype(editedPrompt ?? (feedback.trim() || null));
    setFeedback("");
  }

  function clearFeedback() {
    setFeedback("");
    setPromptDraft(current?.revisedPrompt ?? "");
  }

  const showFatigueNudge = current ? shouldShowFatigueNudge(current.n) : false;
  const hasPendingFeedback =
    Boolean(feedback.trim()) || (current ? promptDraft !== current.revisedPrompt : false);
  const generateLabel = generateButtonLabel({
    isLoading,
    hasIteration: Boolean(current),
    hasPendingFeedback,
  });
  const isRevisionLoading = Boolean(current && isLoading && pendingRevisionFor !== null);

  return (
    <div className="hatching-prototype">
      <div className="hatching-prototype__header">
        <h3 className="hatching-prototype__title">Prototype Your Pet</h3>
        <p className="hatching-prototype__description">
          Generate a base identity sprite, then iterate with plain-language feedback.
        </p>
      </div>

      {showFatigueNudge ? (
        <div className="hatching-prototype__nudge" role="status">
          If this is getting fiddly, pick the closest version and refine the full atlas later.
        </div>
      ) : null}

      {isRevisionLoading ? (
        <div className="hatching-prototype__revision-status" role="status" aria-live="polite">
          <div className="hatching-prototype__revision-orb" aria-hidden="true" />
          <div>
            <strong>Generating revised prototype #{pendingRevisionFor}...</strong>
            <span>
              Keeping you on this screen until the new image is ready. Imagegen can take a few
              minutes.
            </span>
          </div>
        </div>
      ) : null}

      <div className="hatching-prototype__preview" style={{ imageRendering: "pixelated" }}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Current prototype"
            width={192}
            height={208}
            onError={() =>
              console.error("[hatching][prototype] preview load failed", current?.image.outputPath)
            }
          />
        ) : isLoading ? (
          <div className="hatching-prototype__placeholder" role="status">
            Generating the first prototype...
          </div>
        ) : (
          <div className="hatching-prototype__placeholder">No prototype generated yet.</div>
        )}
      </div>

      {prototype?.iterations.length ? (
        <div className="hatching-prototype__history" aria-label="Prototype history">
          {prototype.iterations.map((iteration) => (
            <button
              key={iteration.n}
              type="button"
              className={
                iteration.n === current?.n ? "hatching-prototype__history-item--current" : ""
              }
              onClick={() => {
                if (iteration.n !== current?.n) onRevertToIteration?.(iteration.n);
              }}
              disabled={isLoading}
              aria-current={iteration.n === current?.n ? "true" : undefined}
              aria-label={
                iteration.n === current?.n
                  ? `Current prototype iteration ${iteration.n}`
                  : `Revert to iteration ${iteration.n}`
              }
            >
              <img
                src={runtimeBridge.petAssetUrl(iteration.image.outputPath)}
                alt=""
                width={48}
                height={52}
                aria-hidden="true"
                onError={() =>
                  console.error(
                    "[hatching][prototype] history thumb load failed",
                    iteration.image.outputPath,
                  )
                }
              />
              <span>#{iteration.n}</span>
              {iteration.n === current?.n ? <strong>Current</strong> : null}
            </button>
          ))}
        </div>
      ) : null}

      <label htmlFor="prototype-feedback">Feedback for the next try</label>
      <textarea
        id="prototype-feedback"
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        placeholder="Make the silhouette rounder, add amber eyes, reduce accessories..."
        rows={3}
        disabled={isLoading}
      />

      {hasPendingFeedback ? (
        <div className="hatching-prototype__pending-feedback" role="status">
          <span>
            You have revision notes pending. Generate the revised prototype before moving on, or
            clear the notes to accept the current image.
          </span>
          <button type="button" onClick={clearFeedback} disabled={isLoading}>
            Clear notes
          </button>
        </div>
      ) : null}

      {current ? (
        <details className="hatching-prototype__prompt">
          <summary>See revised prompt</summary>
          <p>Your edits guide the next revision; the model may further refine.</p>
          <textarea
            aria-label="Revised prompt"
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            rows={6}
            disabled={isLoading}
          />
          {current.summaryOfChanges ? <p>{current.summaryOfChanges}</p> : null}
        </details>
      ) : null}

      {referencePending ? <p role="status">Waiting for reference description...</p> : null}

      {error ? (
        <div className="hatching-prototype__error" role="alert" aria-live="assertive">
          {rewriteErrorCopy(error)}
        </div>
      ) : null}

      <div className="hatching-prototype__actions">
        <button type="button" onClick={generate} disabled={isLoading || referencePending}>
          {generateLabel}
        </button>
        <button
          type="button"
          onClick={onAcceptPrototype}
          disabled={isLoading || !current || hasPendingFeedback}
        >
          Accept · generate the rest →
        </button>
      </div>
    </div>
  );
}
