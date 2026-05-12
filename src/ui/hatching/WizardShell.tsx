import type { ReactNode } from "react";

interface WizardShellProps {
  step: number;
  totalSteps: number;
  isDone: boolean;
  canGoBack: boolean;
  onBack?: () => void;
  onCancel: () => void;
  isLoading: boolean;
  error: string | null;
  children: ReactNode;
}

const STEP_LABELS = ["Inspiration", "Brief", "Prompts", "Prototype", "Generate", "Review"];

export function WizardShell({
  step,
  totalSteps,
  isDone,
  canGoBack,
  onBack,
  onCancel,
  isLoading,
  error,
  children,
}: WizardShellProps) {
  const activeStep = Math.max(1, Math.min(step, totalSteps));

  return (
    <main className="wizard-shell" aria-label="Hatching wizard">
      <div className="wizard-shell__device">
        <nav className="wizard-shell__progress" aria-label="Hatching progress">
          <div className="wizard-shell__progress-main">
            <span className="wizard-shell__pill">
              {isDone ? "Done" : `Step ${activeStep} / ${totalSteps}`}
            </span>
            {isDone ? (
              <span className="wizard-shell__done-crumb">Welcome home.</span>
            ) : (
              <ol className="wizard-shell__crumbs">
                {STEP_LABELS.slice(0, totalSteps).map((label, index) => {
                  const dot = index + 1;
                  return (
                    <li
                      key={label}
                      className={dot === activeStep ? "wizard-shell__crumb--active" : undefined}
                      aria-current={dot === activeStep ? "step" : undefined}
                    >
                      {label}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <button
            type="button"
            className="wizard-shell__cancel"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
        </nav>

        {error ? (
          <div className="wizard-shell__error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="wizard-shell__body">{children}</section>

        {canGoBack ? (
          <footer className="wizard-shell__actions">
            <button
              type="button"
              className="wizard-shell__button wizard-shell__button--ghost"
              onClick={onBack}
              disabled={isLoading}
            >
              ← Back
            </button>
          </footer>
        ) : null}
      </div>
    </main>
  );
}
