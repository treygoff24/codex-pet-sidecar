import { useMemo, useState } from "react";
import {
  HATCHING_ATLAS_REVIEW_ROWS,
  type AtlasReviewCheck,
  type HatchingSession,
  type RowKey,
  type RowState,
} from "../../domain/hatching";
import { runtimeBridge } from "../../runtimeBridge";

interface HatchingAtlasReviewProps {
  session: HatchingSession | null;
  onImport: (activate: boolean) => void;
  onRegenerateRow: (rowKey: RowKey) => void;
  isLoading?: boolean;
  error?: string | null;
}

function chipState(rows: Partial<Record<RowKey, RowState>>, key: RowKey): string {
  return rows[key]?.status ?? "pending";
}

function fallbackChecks(rows: Partial<Record<RowKey, RowState>>): AtlasReviewCheck[] {
  const ready = HATCHING_ATLAS_REVIEW_ROWS.every((row) => rows[row.key]?.status === "ready");
  return [
    {
      label: "Atlas validation",
      ok: false,
      detail: ready ? "waiting for backend to compose the atlas" : "waiting for all rows to finish",
    },
  ];
}

export function HatchingAtlasReview({
  session,
  onImport,
  onRegenerateRow,
  isLoading = false,
  error = null,
}: HatchingAtlasReviewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const rows: Partial<Record<RowKey, RowState>> = session?.rows ?? {};
  const atlasPath =
    session?.atlasReview?.atlasPath ?? (session ? `${session.workspace}/atlas.png` : null);
  const atlasUrl = atlasPath ? runtimeBridge.petAssetUrl(atlasPath) : null;
  const checks = session?.atlasReview?.checks.length
    ? session.atlasReview.checks
    : fallbackChecks(rows);
  const allChecksPassed = checks.every((check) => check.ok);
  const failedRows = HATCHING_ATLAS_REVIEW_ROWS.filter((row) => rows[row.key]?.status === "failed");
  const generatedAt = useMemo(() => {
    if (!session?.atlasReview?.composedAt) return null;
    return new Date(session.atlasReview.composedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [session?.atlasReview?.composedAt]);

  function regenerate(rowKey: RowKey) {
    if (rowKey === "idle") {
      window.alert(
        "The base / idle row is controlled by the prototype gate. Go back to Prototype to change it.",
      );
      return;
    }
    if (rowKey === "running-left") {
      const confirmed = window.confirm(
        "Running-left is derived from running-right. Regenerate running-right instead?",
      );
      if (!confirmed) return;
      onRegenerateRow("running-right");
      setModalOpen(false);
      return;
    }
    onRegenerateRow(rowKey);
    setModalOpen(false);
  }

  return (
    <section className="hatching-atlas-review" aria-label="Atlas review">
      <div className="hatching-atlas-review__header">
        <h2>
          The <em>atlas.</em>
        </h2>
        <p>
          What the renderer actually sees: 8 columns × 9 rows, 192×208 per cell.{" "}
          {allChecksPassed ? "All checks passed." : "Review the checks before saving."}
        </p>
        {generatedAt ? <small>Composed at {generatedAt}</small> : null}
      </div>

      <div className="hatching-atlas-review__layout">
        <div className="hatching-atlas-review__preview">
          {atlasUrl ? (
            <div className="hatching-atlas-review__atlas-frame">
              <img src={atlasUrl} alt="Composed pet atlas" />
              <div className="hatching-atlas-review__grid" aria-hidden="true" />
            </div>
          ) : (
            <div className="hatching-atlas-review__placeholder">Atlas preview unavailable.</div>
          )}
          <div className="hatching-atlas-review__row-key" aria-label="Atlas row keys">
            {HATCHING_ATLAS_REVIEW_ROWS.map((row) => (
              <span key={row.key}>{row.key}</span>
            ))}
          </div>
        </div>

        <ul className="hatching-atlas-review__checks" aria-label="Atlas validation">
          {checks.map((check) => (
            <li key={check.label} className={check.ok ? "ok" : "warn"}>
              <span>{check.ok ? "✓" : "!"}</span>
              <strong>{check.label}</strong>
              {check.detail ? <small>{check.detail}</small> : null}
            </li>
          ))}
        </ul>
      </div>

      {failedRows.length ? (
        <div className="hatching-atlas-review__bulk-warning" role="alert">
          {failedRows.length} row(s) need regeneration before this pet can be imported.
        </div>
      ) : null}

      <div className="hatching-atlas-review__rows" aria-label="Animation rows">
        {HATCHING_ATLAS_REVIEW_ROWS.map((row) => {
          const status = chipState(rows, row.key);
          return (
            <button
              key={row.key}
              type="button"
              className={`hatching-atlas-review__row hatching-atlas-review__row--${status}`}
              onClick={() => (status === "failed" ? regenerate(row.key) : undefined)}
              disabled={isLoading || status !== "failed"}
            >
              <span>{row.label}</span>
              <small>{status}</small>
              {status === "failed" ? <strong>Regenerate</strong> : null}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="wizard-shell__button wizard-shell__button--ghost"
        onClick={() => setModalOpen(true)}
        disabled={isLoading}
      >
        ← Regenerate a row
      </button>
      {modalOpen ? (
        <dialog open aria-label="Regenerate which row?">
          <p>Regenerate which row?</p>
          {HATCHING_ATLAS_REVIEW_ROWS.map((row) => (
            <button key={row.key} type="button" onClick={() => regenerate(row.key)}>
              {row.label}
            </button>
          ))}
          <button type="button" onClick={() => setModalOpen(false)}>
            Close
          </button>
        </dialog>
      ) : null}

      {error ? (
        <div className="hatching-atlas-review__error" role="alert" aria-live="assertive">
          {error}
        </div>
      ) : null}

      <div className="hatching-atlas-review__actions">
        <button
          type="button"
          className="wizard-shell__button wizard-shell__button--primary"
          onClick={() => onImport(true)}
          disabled={isLoading || !allChecksPassed || failedRows.length > 0}
        >
          Looks good — name it →
        </button>
      </div>
    </section>
  );
}
