import { useEffect, useState } from "react";
import { formatError } from "../../domain/errors";
import type { OrphanSummary } from "../../domain/hatching";
import { getPhaseDisplayName } from "../../domain/hatching";
import { hatchingBridge } from "../../hatchingBridge";

const RESUME_ERROR_FALLBACK = "Unable to resume hatching session";

function runtimeMissing(message: string): boolean {
  return message.toLowerCase().includes("hatching runtime");
}

export function ResumeBanner() {
  const [orphans, setOrphans] = useState<OrphanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    hatchingBridge
      .listOrphanHatchingSessions()
      .then((sessions) => {
        if (!cancelled) setOrphans(sessions);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(formatError(caught, RESUME_ERROR_FALLBACK));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function resume(sessionId: string) {
    try {
      setError(null);
      await hatchingBridge.resumeHatchingRun(sessionId);
      setOrphans((current) => current?.filter((orphan) => orphan.sessionId !== sessionId) ?? null);
    } catch (caught) {
      const message = formatError(caught, RESUME_ERROR_FALLBACK);
      setError(
        runtimeMissing(message)
          ? "Start over — your brief is preserved, but the old hatching runtime is missing."
          : message,
      );
    }
  }

  async function discard(sessionId: string) {
    try {
      setError(null);
      await hatchingBridge.cancelHatchingRun(sessionId);
      setOrphans((current) => current?.filter((orphan) => orphan.sessionId !== sessionId) ?? null);
    } catch (caught) {
      setError(formatError(caught, RESUME_ERROR_FALLBACK));
    }
  }

  if (!orphans?.length && !error) return null;

  return (
    <aside className="resume-banner" aria-label="Interrupted hatching sessions">
      {orphans?.length ? (
        <>
          <strong>Resume hatching?</strong>
          <ul>
            {orphans.map((orphan) => (
              <li key={orphan.sessionId}>
                <span>
                  {orphan.displayName || "Unnamed pet"} — {getPhaseDisplayName(orphan.phase)}
                </span>
                <button type="button" onClick={() => void resume(orphan.sessionId)}>
                  Resume
                </button>
                <button type="button" onClick={() => void discard(orphan.sessionId)}>
                  Discard
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error ? (
        <p className="resume-banner__error" role="alert">
          {error}
        </p>
      ) : null}
    </aside>
  );
}
