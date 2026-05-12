import { useEffect, useMemo, useState } from "react";
import { HATCHING_ATLAS_REVIEW_ROW_KEYS } from "../../domain/hatching";
import type { PromptDraft, RowKey } from "../../domain/hatching";

interface HatchingPromptReviewProps {
  displayName: string;
  drafts: PromptDraft[];
  onSave: (drafts: PromptDraft[]) => void;
  isLoading?: boolean;
  error?: string | null;
}

// Prompts are numbered in canonical row order — the same sequence the atlas
// uses. If prompt order ever needs to diverge from atlas order, give prompts
// their own ordered key list rather than reusing this one.
function rowNumberFor(rowKey: RowKey): string {
  return String(HATCHING_ATLAS_REVIEW_ROW_KEYS.indexOf(rowKey) + 1).padStart(2, "0");
}

export function HatchingPromptReview({
  displayName,
  drafts,
  onSave,
  isLoading = false,
  error = null,
}: HatchingPromptReviewProps) {
  const [localDrafts, setLocalDrafts] = useState<PromptDraft[]>(drafts);

  useEffect(() => {
    setLocalDrafts(drafts);
  }, [drafts]);

  const counts = useMemo(() => {
    const derived = localDrafts.filter((draft) => !draft.editable || draft.derivedFrom).length;
    return {
      editable: localDrafts.length - derived,
      derived,
    };
  }, [localDrafts]);

  function updatePrompt(rowKey: RowKey, prompt: string) {
    setLocalDrafts((current) =>
      current.map((draft) => (draft.rowKey === rowKey ? { ...draft, prompt } : draft)),
    );
  }

  const canSave =
    localDrafts.length > 0 &&
    localDrafts.every((draft) => !draft.editable || draft.prompt.trim().length > 0);

  return (
    <section className="hatching-prompts" aria-label="Animation prompt review">
      <div className="hatching-prompts__header">
        <h2>
          Codex drafted your <em>animation prompts.</em>
        </h2>
        <p>
          One per animation row. Edit any of them before generation — they&apos;ll all share{" "}
          <em>{displayName}</em>&apos;s identity from the base image.
        </p>
      </div>

      {localDrafts.length === 0 ? (
        <div className="hatching-prompts__loading" aria-live="polite">
          Drafting animation prompts from your brief…
        </div>
      ) : (
        <div className="hatching-prompts__list">
          {localDrafts.map((draft) => (
            <label
              key={draft.rowKey}
              className={
                draft.editable
                  ? "hatching-prompts__row"
                  : "hatching-prompts__row hatching-prompts__row--derived"
              }
            >
              <span className="hatching-prompts__glyph">{rowNumberFor(draft.rowKey)}</span>
              <span className="hatching-prompts__content">
                <span className="hatching-prompts__label">{draft.label}</span>
                <textarea
                  aria-label={draft.label}
                  value={draft.prompt}
                  disabled={!draft.editable || isLoading}
                  onChange={(event) => updatePrompt(draft.rowKey, event.target.value)}
                />
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="hatching-prompts__cap">
        {counts.editable} prompts to generate · {counts.derived} derived
      </div>

      {error ? (
        <div className="hatching-prompts__error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="hatching-prompts__actions">
        <button
          type="button"
          className="wizard-shell__button wizard-shell__button--primary"
          onClick={() => onSave(localDrafts)}
          disabled={!canSave || isLoading}
        >
          Looks good — make a prototype →
        </button>
      </div>
    </section>
  );
}
