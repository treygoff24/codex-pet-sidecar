import { useMemo, useState } from "react";
import type { HatchingSession } from "../../domain/hatching";
import { runtimeBridge } from "../../runtimeBridge";

interface HatchingWelcomeProps {
  session: HatchingSession | null;
  petId: string | null;
  onSaveAndStay: () => void;
  onStartWith: (activate: boolean) => void;
}

function elapsed(createdAt?: string): string {
  if (!createdAt) return "unknown";
  const ms = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function HatchingWelcome({
  session,
  petId,
  onSaveAndStay,
  onStartWith,
}: HatchingWelcomeProps) {
  const [activate, setActivate] = useState(true);
  const displayName = session?.brief?.displayName ?? petId ?? "Your pet";
  const portraitUrl = session?.rows.idle?.image?.outputPath
    ? runtimeBridge.petAssetUrl(session.rows.idle.image.outputPath)
    : null;
  const stats = useMemo(() => {
    const rows = Object.values(session?.rows ?? {});
    return {
      totalTime: elapsed(session?.createdAt),
      imagegenCalls:
        (session?.prototype?.iterations.length ?? 0) +
        rows.reduce((sum, row) => sum + row.attempts, 0),
      acceptedRows: rows.filter((row) => row.status === "ready" && !row.derivedFrom).length,
      derivedRows: rows.filter((row) => row.derivedFrom).length,
    };
  }, [session]);

  return (
    <section className="hatching-welcome" aria-label="Hatching complete">
      <div className="hatching-welcome__header">
        <h2>
          Meet <em>{displayName}.</em>
        </h2>
        <p>
          Hatched in {stats.totalTime}. {stats.imagegenCalls} image generations,{" "}
          {stats.acceptedRows} accepted, {stats.derivedRows} derived. Ready to keep you company from
          the menu bar.
        </p>
      </div>

      <div className="hatching-welcome__card">
        <div className="hatching-welcome__portrait">
          {portraitUrl ? (
            <img src={portraitUrl} alt={displayName} />
          ) : (
            <span>{displayName[0]}</span>
          )}
        </div>
        <dl className="hatching-welcome__summary">
          <div>
            <dt>name</dt>
            <dd className="name">{displayName}</dd>
          </div>
          {session?.brief?.description ? (
            <div>
              <dt>brief</dt>
              <dd>{session.brief.description}</dd>
            </div>
          ) : null}
          {session?.brief?.personality.length ? (
            <div>
              <dt>personality</dt>
              <dd>{session.brief.personality.join(" · ")}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <label className="hatching-welcome__toggle">
        <input
          type="checkbox"
          checked={activate}
          onChange={(event) => setActivate(event.target.checked)}
        />
        <span>
          <strong>Make {displayName} your active pet.</strong> Your current pet will stay in the
          library.
        </span>
      </label>

      {petId ? (
        <p className="hatching-welcome__path">Pet package saved to local pet library/{petId}/</p>
      ) : null}

      <div className="hatching-welcome__actions">
        <button
          type="button"
          className="wizard-shell__button wizard-shell__button--ghost"
          onClick={onSaveAndStay}
        >
          Save and stay here
        </button>
        <button
          type="button"
          className="wizard-shell__button wizard-shell__button--primary"
          onClick={() => onStartWith(activate)}
        >
          Start with {displayName} →
        </button>
      </div>
    </section>
  );
}
