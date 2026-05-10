import { useState } from "react";

interface HatchingPrototypeProps {
  onGeneratePrototype: (feedback?: string) => void;
  onAcceptPrototype: () => void;
  isLoading?: boolean;
  error?: string | null;
}

export function HatchingPrototype({
  onGeneratePrototype,
  onAcceptPrototype,
  isLoading = false,
  error = null,
}: HatchingPrototypeProps) {
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  const handleGenerate = () => {
    onGeneratePrototype(showFeedback ? feedback : undefined);
    setFeedback("");
    setShowFeedback(false);
  };

  const handleAccept = () => {
    onAcceptPrototype();
  };

  return (
    <div className="hatching-prototype">
      <div className="hatching-prototype__header">
        <h3 className="hatching-prototype__title">Prototype Your Pet</h3>
        <p className="hatching-prototype__description">
          Generate and refine your pet's appearance. Iteration history is preserved.
        </p>
      </div>

      {/* Placeholder for prototype image */}
      <div className="hatching-prototype__preview">
        <div className="hatching-prototype__placeholder">
          <div className="hatching-prototype__placeholder-icon">🎨</div>
          <div className="hatching-prototype__placeholder-text">
            Prototype generation will be available in the next update
          </div>
          <div className="hatching-prototype__placeholder-hint">
            This feature requires Codex imagegen integration
          </div>
        </div>
      </div>

      {/* Feedback Section */}
      <div className="hatching-prototype__feedback">
        <button
          type="button"
          className="hatching-prototype__toggle"
          onClick={() => setShowFeedback(!showFeedback)}
          disabled={isLoading}
          aria-expanded={showFeedback}
          aria-controls="feedback-section"
        >
          {showFeedback ? "Hide" : "Show"} Feedback Options
        </button>

        {showFeedback && (
          <div id="feedback-section" className="hatching-prototype__feedback-content">
            <label htmlFor="feedback" className="hatching-prototype__label">
              What would you like to change?
            </label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              disabled={isLoading}
              className="hatching-prototype__textarea"
              placeholder="Describe changes to the pet's appearance, style, or any specific features..."
              rows={3}
            />
          </div>
        )}
      </div>

      {/* Error State */}
      {error && (
        <div className="hatching-prototype__error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="hatching-prototype__actions">
        <button
          type="button"
          className="hatching-prototype__button hatching-prototype__button--secondary"
          onClick={handleGenerate}
          disabled={isLoading}
          aria-label="Generate new prototype"
        >
          {isLoading ? "Generating..." : "Generate Prototype"}
        </button>

        <button
          type="button"
          className="hatching-prototype__button hatching-prototype__button--primary"
          onClick={handleAccept}
          disabled={isLoading}
          aria-label="Accept current prototype and continue"
        >
          {isLoading ? "Saving..." : "Accept & Continue"}
        </button>
      </div>

      {/* Info Section */}
      <div className="hatching-prototype__info">
        <p className="hatching-prototype__info-text">
          <strong>Note:</strong> Prototype generation uses the Codex imagegen integration. This
          feature will be available once the Codex client integration is complete.
        </p>
        <p className="hatching-prototype__info-text">
          For now, you can accept the placeholder and proceed to the next step.
        </p>
      </div>
    </div>
  );
}
