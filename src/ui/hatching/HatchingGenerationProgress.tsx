/**
 * HatchingProgress - Generation progress UI for hatching wizard.
 *
 * Displays progress during row generation and atlas composition.
 * Follows accessibility and UI/UX best practices from the design system.
 */

import type { GenerationProgress } from "../../domain/hatching";

const formatTime = (milliseconds: number): string => {
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

interface HatchingProgressProps {
  progress: GenerationProgress | null;
  currentRow?: string;
  error?: string | null;
}

export function HatchingGenerationProgress({
  progress,
  currentRow,
  error = null,
}: HatchingProgressProps) {
  const percentage = progress ? (progress.rowsCompleted / progress.rowsTotal) * 100 : 0;

  return (
    <div className="hatching-progress">
      <div className="hatching-progress__header">
        <h3 className="hatching-progress__title">Generating Your Pet</h3>
        <p className="hatching-progress__description">
          Creating animation row strips and composing the atlas...
        </p>
      </div>

      {/* Progress Bar */}
      <div className="hatching-progress__bar-container">
        <div
          className="hatching-progress__bar"
          role="progressbar"
          aria-valuenow={progress?.rowsCompleted || 0}
          aria-valuemin={0}
          aria-valuemax={progress?.rowsTotal || 8}
          aria-label="Row generation progress"
          style={{ width: `${percentage}%` }}
        >
          <span className="hatching-progress__bar-text">
            {progress ? `${progress.rowsCompleted} / ${progress.rowsTotal} rows` : "0 / 8 rows"}
          </span>
        </div>
      </div>

      {/* Progress Details */}
      {progress && (
        <div className="hatching-progress__details">
          <div className="hatching-progress__detail">
            <span className="hatching-progress__detail-label">Completed:</span>
            <span className="hatching-progress__detail-value">
              {progress.rowsCompleted} of {progress.rowsTotal} rows
            </span>
          </div>

          {progress.estimatedRemaining > 0 && (
            <div className="hatching-progress__detail">
              <span className="hatching-progress__detail-label">Estimated time remaining:</span>
              <span className="hatching-progress__detail-value">
                {formatTime(progress.estimatedRemaining)}
              </span>
            </div>
          )}

          {progress.totalImagegenCalls > 0 && (
            <div className="hatching-progress__detail">
              <span className="hatching-progress__detail-label">Image generation calls:</span>
              <span className="hatching-progress__detail-value">{progress.totalImagegenCalls}</span>
            </div>
          )}

          {currentRow && (
            <div className="hatching-progress__current">
              <span className="hatching-progress__current-label">Currently generating:</span>
              <span className="hatching-progress__current-value">{currentRow}</span>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="hatching-progress__error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Info Section */}
      <div className="hatching-progress__info">
        <p className="hatching-progress__info-text">
          This process generates all 8 animation row strips and composes them into a single atlas
          file for your pet.
        </p>
        <p className="hatching-progress__info-text">
          <strong>Note:</strong> Row generation uses the Codex imagegen integration. This feature
          will be fully available once the Codex client integration is complete.
        </p>
      </div>
    </div>
  );
}
