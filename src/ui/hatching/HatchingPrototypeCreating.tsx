import { useEffect, useMemo, useState } from "react";
import type { ReferenceImage } from "../../domain/hatching";

interface HatchingPrototypeCreatingProps {
  displayName?: string | null;
  referenceImage?: ReferenceImage | null;
  isGenerating: boolean;
  error?: string | null;
  onRetry: () => void;
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

export function HatchingPrototypeCreating({
  displayName,
  referenceImage = null,
  isGenerating,
  error = null,
  onRetry,
}: HatchingPrototypeCreatingProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const petName = displayName?.trim() || "your pet";

  useEffect(() => {
    if (!isGenerating) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  const statusLine = useMemo(() => {
    if (error && !isGenerating) return "Generation paused before a prototype was ready.";
    if (referenceImage?.descriptionStatus === "pending") {
      return "Reading the reference image before starting the sprite.";
    }
    if (elapsedSeconds < 45) return "Starting the imagegen run and waiting for the first sprite.";
    if (elapsedSeconds < 180) return "Still working. Imagegen is slow here; this is expected.";
    return "Still generating. Some runs take five minutes or more.";
  }, [elapsedSeconds, error, isGenerating, referenceImage?.descriptionStatus]);

  return (
    <div className="hatching-prototype-creating" role="status" aria-live="polite">
      <div className="hatching-prototype-creating__stage" aria-hidden="true">
        <div className="hatching-prototype-creating__pet">
          <span />
          <span />
          <span />
        </div>
        <div className="hatching-prototype-creating__sparkles">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>

      <div className="hatching-prototype-creating__copy">
        <p className="hatching-prototype-creating__eyebrow">Creating prototype</p>
        <h1 className="hatching-prototype-creating__title">
          Making {petName}'s first <em>sprite.</em>
        </h1>
        <p className="hatching-prototype-creating__description">
          This step sends the brief to imagegen and waits for a real generated image before review.
          It commonly takes 3-5 minutes, sometimes longer.
        </p>
      </div>

      <div className="hatching-prototype-creating__status">
        <div className="hatching-prototype-creating__meter" aria-hidden="true">
          <span />
        </div>
        <div className="hatching-prototype-creating__status-row">
          <span>{statusLine}</span>
          {isGenerating ? <strong>{formatElapsed(elapsedSeconds)}</strong> : null}
        </div>
      </div>

      {referenceImage ? (
        <p className="hatching-prototype-creating__reference">
          Reference image attached · {referenceImage.descriptionStatus.replace("-", " ")}
        </p>
      ) : null}

      {error && !isGenerating ? (
        <div className="hatching-prototype-creating__error" role="alert">
          <strong>Prototype did not finish.</strong>
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            Try generating again
          </button>
        </div>
      ) : null}
    </div>
  );
}
