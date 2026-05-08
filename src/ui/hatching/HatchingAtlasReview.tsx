import { useState } from "react";

/**
 * HatchingAtlasReview - Step 5 of the hatching wizard.
 *
 * Allows users to review the generated atlas before importing.
 * Follows accessibility and UI/UX best practices from the design system.
 */

interface HatchingAtlasReviewProps {
  onImport: (activate: boolean) => void;
  onRegenerateRow: (rowKey: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export function HatchingAtlasReview({
  onImport,
  onRegenerateRow,
  isLoading = false,
  error = null,
}: HatchingAtlasReviewProps) {
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  const handleImportAndActivate = () => {
    onImport(true);
  };

  const handleImportOnly = () => {
    onImport(false);
  };

  const handleRegenerateRow = (rowKey: string) => {
    setSelectedRow(rowKey);
    onRegenerateRow(rowKey);
  };

  const rowNames = [
    { key: "idle", label: "Idle", description: "Standing still" },
    { key: "running-right", label: "Running Right", description: "Moving right" },
    { key: "running-left", label: "Running Left", description: "Moving left (mirrored)" },
    { key: "waving", label: "Waving", description: "Greeting animation" },
    { key: "jumping", label: "Jumping", description: "Jumping animation" },
    { key: "failed", label: "Failed", description: "Error state" },
    { key: "waiting", label: "Waiting", description: "Waiting state" },
    { key: "running", label: "Running", description: "General running" },
  ];

  return (
    <div className="hatching-atlas-review">
      <div className="hatching-atlas-review__header">
        <h3 className="hatching-atlas-review__title">Review Your Pet's Atlas</h3>
        <p className="hatching-atlas-review__description">
          Review the generated animation atlas and make any final adjustments before importing.
        </p>
      </div>

      {/* Atlas Preview Placeholder */}
      <div className="hatching-atlas-review__preview">
        <div className="hatching-atlas-review__placeholder">
          <div className="hatching-atlas-review__placeholder-icon">🖼️</div>
          <div className="hatching-atlas-review__placeholder-text">
            Atlas preview will be available in the next update
          </div>
          <div className="hatching-atlas-review__placeholder-hint">
            The atlas is a 1536×1872 spritesheet containing all animation frames
          </div>
        </div>
      </div>

      {/* Row Grid */}
      <div className="hatching-atlas-review__rows">
        <h4 className="hatching-atlas-review__rows-title">Animation Rows</h4>
        <div className="hatching-atlas-review__rows-grid">
          {rowNames.map((row) => (
            <button
              key={row.key}
              type="button"
              className={`hatching-atlas-review__row ${
                selectedRow === row.key ? "hatching-atlas-review__row--selected" : ""
              }`}
              onClick={() => handleRegenerateRow(row.key)}
              disabled={isLoading}
              aria-label={`Regenerate ${row.label} row`}
            >
              <div className="hatching-atlas-review__row-label">{row.label}</div>
              <div className="hatching-atlas-review__row-description">{row.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="hatching-atlas-review__error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="hatching-atlas-review__actions">
        <button
          type="button"
          className="hatching-atlas-review__button hatching-atlas-review__button--secondary"
          onClick={handleImportOnly}
          disabled={isLoading}
          aria-label="Import pet without activating"
        >
          Import Only
        </button>

        <button
          type="button"
          className="hatching-atlas-review__button hatching-atlas-review__button--primary"
          onClick={handleImportAndActivate}
          disabled={isLoading}
          aria-label="Import and activate pet immediately"
        >
          {isLoading ? "Importing..." : "Import & Activate"}
        </button>
      </div>

      {/* Info Section */}
      <div className="hatching-atlas-review__info">
        <p className="hatching-atlas-review__info-text">
          <strong>Note:</strong> Atlas generation uses the Codex imagegen integration. This feature
          will be fully available once the Codex client integration is complete.
        </p>
        <p className="hatching-atlas-review__info-text">
          For now, you can import the placeholder and proceed to the welcome step.
        </p>
      </div>
    </div>
  );
}
