/**
 * HatchingChoiceGate - Step 1 of the hatching wizard.
 *
 * Presents users with the choice to start a new pet or resume an interrupted session.
 * Follows accessibility and UI/UX best practices from the design system.
 */

import { useEffect, useState } from "react";
import { hatchingBridge } from "../../hatchingBridge";
import type { OrphanSummary } from "../../domain/hatching";
import { getPhaseDisplayName } from "../../domain/hatching";
import { HatchingLibraryFullBanner } from "./HatchingLibraryFullBanner";

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

interface HatchingChoiceGateProps {
  onStartNew: () => void;
  onResumeSession: (sessionId: string) => void;
  isLoading?: boolean;
  isLibraryFull?: boolean;
  onOpenLibrary?: () => void;
}

export function HatchingChoiceGate({
  onStartNew,
  onResumeSession,
  isLoading = false,
  isLibraryFull = false,
  onOpenLibrary,
}: HatchingChoiceGateProps) {
  const [orphans, setOrphans] = useState<OrphanSummary[]>([]);
  const [isLoadingOrphans, setIsLoadingOrphans] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOrphans();
  }, []);

  const loadOrphans = async () => {
    try {
      setIsLoadingOrphans(true);
      setError(null);
      const sessions = await hatchingBridge.listOrphanHatchingSessions();
      setOrphans(sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    } finally {
      setIsLoadingOrphans(false);
    }
  };

  return (
    <div className="hatching-choice-gate">
      <h3 className="hatching-choice-gate__title">Create Your Pet</h3>
      <p className="hatching-choice-gate__description">
        Start fresh with a new pet or resume an interrupted session.
      </p>

      {/* Library Full Banner */}
      {isLibraryFull && onOpenLibrary && (
        <HatchingLibraryFullBanner onOpenLibrary={onOpenLibrary} />
      )}

      {/* Start Fresh Option */}
      <div className="hatching-choice-gate__option">
        <button
          type="button"
          className="hatching-choice-gate__card hatching-choice-gate__card--primary"
          onClick={onStartNew}
          disabled={isLoading || isLoadingOrphans || isLibraryFull}
          aria-label="Start creating a new pet"
        >
          <div className="hatching-choice-gate__card-icon">✨</div>
          <div className="hatching-choice-gate__card-content">
            <div className="hatching-choice-gate__card-title">Start Fresh</div>
            <div className="hatching-choice-gate__card-description">
              Create a completely new pet from scratch
            </div>
          </div>
        </button>
      </div>

      {/* Resume Sessions Option */}
      {orphans.length > 0 && (
        <div className="hatching-choice-gate__section">
          <h4 className="hatching-choice-gate__section-title">Resume Interrupted Sessions</h4>
          <div className="hatching-choice-gate__sessions">
            {orphans.map((orphan) => (
              <button
                key={orphan.sessionId}
                type="button"
                className="hatching-choice-gate__card hatching-choice-gate__card--secondary"
                onClick={() => onResumeSession(orphan.sessionId)}
                disabled={isLoading}
                aria-label={`Resume session for ${orphan.displayName || "unnamed pet"}`}
              >
                <div className="hatching-choice-gate__card-content">
                  <div className="hatching-choice-gate__card-title">
                    {orphan.displayName || "Unnamed Pet"}
                  </div>
                  <div className="hatching-choice-gate__card-meta">
                    <span className="hatching-choice-gate__card-date">
                      {formatDate(orphan.createdAt)}
                    </span>
                    <span className="hatching-choice-gate__card-phase">
                      {getPhaseDisplayName(orphan.phase)}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoadingOrphans && (
        <div className="hatching-choice-gate__loading" role="status" aria-live="polite">
          Loading sessions...
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="hatching-choice-gate__error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!isLoadingOrphans && orphans.length === 0 && !error && (
        <div className="hatching-choice-gate__empty">
          <p>No interrupted sessions found.</p>
        </div>
      )}
    </div>
  );
}
