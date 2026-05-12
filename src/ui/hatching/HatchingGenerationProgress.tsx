import {
  type GenerationProgress,
  type HatchingSession,
  type RowKey,
  type RowState,
} from "../../domain/hatching";
import { runtimeBridge } from "../../runtimeBridge";

const GENERATED_ORDER: RowKey[] = [
  "running-right",
  "waving",
  "jumping",
  "failed",
  "waiting",
  "running",
  "review",
];

const formatTime = (milliseconds: number): string => {
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

interface HatchingProgressProps {
  session: HatchingSession | null;
  progress: GenerationProgress | null;
  error?: string | null;
  onCancel: () => void;
}

function rowClass(row: RowState | undefined, isDerived = false): string {
  if (isDerived) return "derived";
  if (row?.status === "ready") return "done";
  if (row?.status === "generating") return "live";
  if (row?.status === "failed") return "failed";
  return "queued";
}

function rowMeta(row: RowState | undefined, rowKey: RowKey): string {
  if (rowKey === "idle") return `accepted from prototype gate (try ${row?.attempts || 1})`;
  if (row?.status === "ready") return "candidate accepted · grounded on base";
  if (row?.status === "generating") {
    return `attempt ${Math.max(1, row.attempts || 1)} · expecting ig_*.png in runtime workspace`;
  }
  if (row?.status === "failed") return row.lastError ?? "failed · needs regeneration";
  return "queued · grounded on base";
}

function imageUrl(row: RowState | undefined): string | null {
  return row?.image?.outputPath ? runtimeBridge.petAssetUrl(row.image.outputPath) : null;
}

function fallbackFeed(session: HatchingSession | null, progress: GenerationProgress | null) {
  const now = new Date().toISOString();
  const current = Object.entries(session?.rows ?? {}).find(
    ([, row]) => row.status === "generating",
  );
  return [
    { id: "fallback-1", at: now, tone: "ok" as const, message: "prototype accepted" },
    {
      id: "fallback-2",
      at: now,
      tone: "info" as const,
      message: "canonical_identity_reference set",
    },
    current
      ? {
          id: "fallback-3",
          at: now,
          tone: "work" as const,
          message: `$imagegen ${current[0]}`,
        }
      : {
          id: "fallback-3",
          at: now,
          tone: "work" as const,
          message: progress ? "awaiting next imagegen result…" : "preparing row pipeline…",
        },
  ];
}

export function HatchingGenerationProgress({
  session,
  progress,
  error = null,
  onCancel,
}: HatchingProgressProps) {
  const displayName = session?.brief?.displayName ?? "your pet";
  const rows: Partial<Record<RowKey, RowState>> = session?.rows ?? {};
  const feed = session?.runtimeFeed.length ? session.runtimeFeed : fallbackFeed(session, progress);
  const rowsCompleted =
    progress?.rowsCompleted ??
    GENERATED_ORDER.filter((key) => rows[key]?.status === "ready").length;
  const rowsTotal = progress?.rowsTotal ?? 7;
  const calls = progress?.totalImagegenCalls ?? session?.prototype?.iterations.length ?? 0;

  return (
    <section className="hatching-progress" aria-label="Pet generation progress">
      <div className="hatching-progress__header">
        <h2>
          Building <em>{displayName}.</em>
        </h2>
        <p>
          Base accepted. Generating the remaining 7 rows, each grounded on the canonical identity
          reference. This can take a few minutes.
        </p>
      </div>

      <div className="hatching-progress__pipeline-grid">
        <ol className="hatching-progress__pipeline">
          <li className={rowClass(rows.idle)}>
            <span className="node" />
            <div className="row-name">
              01 · base / idle <span>canonical identity ✓</span>
            </div>
            <div className="row-meta">{rowMeta(rows.idle, "idle")}</div>
            {imageUrl(rows.idle) ? (
              <img className="thumb" src={imageUrl(rows.idle) ?? ""} alt="" />
            ) : null}
          </li>
          {GENERATED_ORDER.map((rowKey, index) => {
            const row = rows[rowKey];
            const rowNumber = String(index + 2).padStart(2, "0");
            return (
              <li key={rowKey} className={rowClass(row)}>
                <span className="node" />
                <div className="row-name">
                  {rowNumber} · {rowKey}
                  {row?.status === "generating" ? <span>generating…</span> : null}
                </div>
                <div className="row-meta">{rowMeta(row, rowKey)}</div>
                {imageUrl(row) ? <img className="thumb" src={imageUrl(row) ?? ""} alt="" /> : null}
              </li>
            );
          })}
          <li className={rowClass(rows["running-left"], true)}>
            <span className="node" />
            <div className="row-name">— · running-left</div>
            <div className="row-meta">auto-mirror from running-right (no generation)</div>
          </li>
        </ol>

        <div className="hatching-progress__feed">
          <h3>Runtime feed</h3>
          {feed.map((event) => (
            <div key={event.id} className={`line line--${event.tone}`}>
              <span className="ts">{timeOf(event.at)}</span>
              <span>{event.message}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hatching-progress__footer">
        <span>
          <strong>{rowsCompleted}</strong> / {rowsTotal} rows · <strong>{calls}</strong> total
          imagegen calls so far
        </span>
        {progress?.estimatedRemaining ? (
          <span>~ {formatTime(progress.estimatedRemaining)} remaining</span>
        ) : (
          <span>waiting for the next artifact…</span>
        )}
      </div>

      {error ? (
        <div className="hatching-progress__error" role="alert" aria-live="assertive">
          {error}
        </div>
      ) : null}

      <div className="hatching-progress__actions">
        <button
          type="button"
          className="wizard-shell__button wizard-shell__button--danger"
          onClick={onCancel}
        >
          Cancel run
        </button>
        <button type="button" className="wizard-shell__button wizard-shell__button--ghost" disabled>
          Continue ({Math.max(0, rowsTotal - rowsCompleted)} left) →
        </button>
      </div>
    </section>
  );
}
