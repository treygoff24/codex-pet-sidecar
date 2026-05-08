/**
 * HatchingWelcome - Step 6 of the hatching wizard.
 *
 * Shows success message when pet is successfully created.
 * Provides options to activate the pet or return to library.
 */

interface HatchingWelcomeProps {
  petName: string;
  petId: string;
  onActivate: () => void;
  onReturnToLibrary: () => void;
  isLoading?: boolean;
}

export function HatchingWelcome({
  petName,
  petId,
  onActivate,
  onReturnToLibrary,
  isLoading = false,
}: HatchingWelcomeProps) {
  return (
    <div className="hatching-welcome">
      <div className="hatching-welcome__success">
        <div className="hatching-welcome__success-icon" aria-hidden="true">
          ✓
        </div>
        <h3 className="hatching-welcome__title">
          {petName} is Ready!
        </h3>
        <p className="hatching-welcome__description">
          Your new pet has been successfully created and added to your library.
        </p>
      </div>

      <div className="hatching-welcome__actions">
        <button
          type="button"
          className="hatching-welcome__button hatching-welcome__button--primary"
          onClick={onActivate}
          disabled={isLoading}
          aria-label={`Activate ${petName} now`}
        >
          {isLoading ? "Activating..." : `Activate ${petName}`}
        </button>

        <button
          type="button"
          className="hatching-welcome__button hatching-welcome__button--secondary"
          onClick={onReturnToLibrary}
          disabled={isLoading}
          aria-label="Return to pet library"
        >
          Return to Library
        </button>
      </div>

      <div className="hatching-welcome__info">
        <p className="hatching-welcome__info-text">
          <strong>Pet ID:</strong> {petId}
        </p>
        <p className="hatching-welcome__info-text">
          You can always activate this pet later from the settings panel.
        </p>
      </div>
    </div>
  );
}