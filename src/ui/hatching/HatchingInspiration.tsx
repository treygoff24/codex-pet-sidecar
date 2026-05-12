import { useState } from "react";
import type { OrphanSummary, ReferenceImage } from "../../domain/hatching";
import { getPhaseDisplayName } from "../../domain/hatching";
import { fileNameFromPath, referenceDescriptionLabel } from "../../domain/referenceImage";
import { HATCHING_ARCHETYPES, type Archetype } from "./archetypes";

interface HatchingInspirationProps {
  onSkip: () => void;
  onSelectArchetype: (archetypeId: string) => void;
  onChooseReference?: () => void;
  onResumeSession?: (sessionId: string) => void;
  referenceImage?: ReferenceImage | null;
  resumeSessions?: OrphanSummary[];
  isLibraryFull?: boolean;
  isLoading?: boolean;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HatchingInspiration({
  onSkip,
  onSelectArchetype,
  onChooseReference,
  onResumeSession,
  referenceImage = null,
  resumeSessions = [],
  isLibraryFull = false,
  isLoading = false,
}: HatchingInspirationProps) {
  const [selectedArchetype, setSelectedArchetype] = useState<Archetype | null>(null);
  const referenceFileName = referenceImage ? fileNameFromPath(referenceImage.path) : null;
  const referenceStatus = referenceImage ? referenceDescriptionLabel(referenceImage) : null;

  return (
    <div className="hatching-inspiration">
      <div className="hatching-inspiration__header">
        <h1 className="hatching-inspiration__title">
          Where should we <em>start?</em>
        </h1>
        <p className="hatching-inspiration__description">
          Pick a vibe to start from, add a visual reference, or start completely blank. These
          pre-fill the brief; they do not lock you in.
        </p>
      </div>

      {isLibraryFull ? (
        <div className="hatching-inspiration__library-full" role="alert">
          <strong>Pet Library is Full</strong>
          <span>Archive an existing pet in settings before hatching another.</span>
        </div>
      ) : null}

      {resumeSessions.length > 0 && onResumeSession ? (
        <section className="hatching-inspiration__resume" aria-label="Interrupted hatches">
          <strong>Resume an interrupted hatch</strong>
          <div className="hatching-inspiration__resume-list">
            {resumeSessions.map((session) => (
              <button
                key={session.sessionId}
                type="button"
                onClick={() => onResumeSession(session.sessionId)}
                disabled={isLoading}
              >
                <span>{session.displayName ?? "Unnamed pet"}</span>
                <small>
                  {getPhaseDisplayName(session.phase)} · {formatDate(session.createdAt)}
                </small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <div className="hatching-inspiration__grid" aria-label="Pet archetypes">
        {HATCHING_ARCHETYPES.map((archetype) => (
          <button
            key={archetype.id}
            type="button"
            className={`hatching-inspiration__card ${
              selectedArchetype?.id === archetype.id ? "hatching-inspiration__card--selected" : ""
            }`}
            onClick={() => setSelectedArchetype(archetype)}
            disabled={isLoading || isLibraryFull}
            aria-pressed={selectedArchetype?.id === archetype.id}
            style={
              {
                "--archetype-primary": archetype.palette.primary,
                "--archetype-secondary": archetype.palette.secondary,
              } as React.CSSProperties
            }
          >
            <img
              className="hatching-inspiration__thumbnail"
              src={archetype.thumbnail}
              alt=""
              width={96}
              height={104}
              aria-hidden="true"
            />
            <span className="hatching-inspiration__card-name">{archetype.name}</span>
            <span className="hatching-inspiration__card-description">{archetype.descriptor}</span>
            <span className="hatching-inspiration__card-tags" aria-hidden="true">
              {archetype.chips.map((chip) => (
                <span key={chip} className="hatching-inspiration__card-tag">
                  {chip}
                </span>
              ))}
            </span>
          </button>
        ))}
      </div>

      <div className="hatching-inspiration__divider">and / or</div>

      <button
        type="button"
        className={`hatching-reference-pill ${
          referenceImage ? "hatching-reference-pill--attached" : ""
        }`}
        onClick={onChooseReference}
        disabled={isLoading || isLibraryFull || !onChooseReference}
        aria-label="Choose a visual reference image"
      >
        <span className="hatching-reference-pill__art" aria-hidden="true" />
        <span className="hatching-reference-pill__copy">
          <strong>Visual reference</strong>
          <span>
            {referenceFileName && referenceStatus
              ? `${referenceFileName} · ${referenceStatus}`
              : "Drop an image or click to browse. Used as inspiration for the base sprite."}
          </span>
        </span>
        <span className="hatching-reference-pill__action">
          {referenceImage ? "Replace" : "Browse"}
        </span>
      </button>

      <button
        type="button"
        className="hatching-inspiration__blank-link"
        onClick={onSkip}
        disabled={isLoading || isLibraryFull}
        aria-label="Start from a blank brief"
      >
        <span className="hatching-inspiration__blank-kicker">No preset needed</span>
        <span className="hatching-inspiration__blank-title">Start from a blank brief</span>
        <span className="hatching-inspiration__blank-copy">
          Skip the vibe cards and write the pet yourself.
        </span>
      </button>

      <div className="hatching-inspiration__actions">
        <button
          type="button"
          className="hatching-inspiration__button hatching-inspiration__button--primary"
          onClick={() => selectedArchetype && onSelectArchetype(selectedArchetype.id)}
          disabled={!selectedArchetype || isLoading || isLibraryFull}
        >
          {selectedArchetype ? "Continue with this →" : "Choose a starting point"}
        </button>
      </div>
    </div>
  );
}
