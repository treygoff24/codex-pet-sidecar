interface HatchingLibraryFullBannerProps {
  onOpenLibrary: () => void;
}

export function HatchingLibraryFullBanner({ onOpenLibrary }: HatchingLibraryFullBannerProps) {
  return (
    <div className="hatching-library-full-banner" role="alert" aria-live="polite">
      <div className="hatching-library-full-banner__content">
        <div className="hatching-library-full-banner__icon" aria-hidden="true">
          ⚠️
        </div>
        <div className="hatching-library-full-banner__message">
          <h4 className="hatching-library-full-banner__title">Pet Library is Full</h4>
          <p className="hatching-library-full-banner__description">
            You have reached the maximum of 20 pets. Archive a pet from your library before hatching
            another one.
          </p>
        </div>
        <button
          type="button"
          className="hatching-library-full-banner__button"
          onClick={onOpenLibrary}
          aria-label="Open pet library to archive a pet"
        >
          Open Library
        </button>
      </div>
    </div>
  );
}
