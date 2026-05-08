/**
 * HatchingWizard - Shared wizard shell for pet creation.
 *
 * This component provides the structure and navigation for the multi-step hatching wizard,
 * following accessibility best practices and the project's design system.
 *
 * Accessibility features:
 * - Proper focus management between steps
 * - Keyboard navigation support
 * - ARIA labels and live regions
 * - Screen reader announcements
 * - Reduced motion support
 *
 * UI/UX features:
 * - Touch targets ≥ 44×44px
 * - 8px+ spacing between interactive elements
 * - Loading feedback during async operations
 * - Clear error messaging
 * - Consistent design language
 */

import { ReactNode, useEffect, useRef } from "react";
import type { HatchingPhase } from "../domain/hatching";

export interface HatchingWizardStep {
  id: string;
  title: string;
  phase: HatchingPhase;
  content: ReactNode;
  canProceed: boolean;
  canGoBack: boolean;
  onNext?: () => void | Promise<void>;
  onBack?: () => void;
  onCancel?: () => void;
}

interface HatchingWizardProps {
  steps: HatchingWizardStep[];
  currentStepIndex: number;
  onStepChange: (index: number) => void;
  isLoading?: boolean;
  error?: string | null;
}

export function HatchingWizard({
  steps,
  currentStepIndex,
  onStepChange,
  isLoading = false,
  error = null,
}: HatchingWizardProps) {
  const currentStep = steps[currentStepIndex];
  const stepContainerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Focus management: move focus to step title when step changes
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, [currentStepIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to cancel (if cancel handler exists)
      if (e.key === "Escape" && currentStep.onCancel) {
        currentStep.onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentStep]);

  const handleNext = async () => {
    if (currentStep.onNext && !isLoading) {
      await currentStep.onNext();
    }
  };

  const handleBack = () => {
    if (currentStep.onBack && !isLoading) {
      currentStep.onBack();
    }
  };

  const handleCancel = () => {
    if (currentStep.onCancel && !isLoading) {
      currentStep.onCancel();
    }
  };

  const goToStep = (index: number) => {
    if (!isLoading && index >= 0 && index < steps.length) {
      onStepChange(index);
    }
  };

  return (
    <div className="hatching-wizard" role="dialog" aria-modal="true" aria-labelledby="wizard-title">
      {/* Step indicator */}
      <nav className="hatching-wizard__steps" aria-label="Wizard progress" role="tablist">
        {steps.map((step, index) => {
          const isCurrent = index === currentStepIndex;
          const isPast = index < currentStepIndex;
          const isClickable = isPast || (isCurrent && step.canGoBack);

          return (
            <button
              key={step.id}
              type="button"
              className={`hatching-wizard__step ${
                isCurrent ? "hatching-wizard__step--current" : ""
              } ${isPast ? "hatching-wizard__step--past" : ""}`}
              onClick={() => isClickable && goToStep(index)}
              disabled={!isClickable || isLoading}
              aria-selected={isCurrent}
              aria-current={isCurrent ? "step" : undefined}
              role="tab"
              tabIndex={isCurrent ? 0 : -1}
            >
              <span className="hatching-wizard__step-number">{index + 1}</span>
              <span className="hatching-wizard__step-title">{step.title}</span>
            </button>
          );
        })}
      </nav>

      {/* Step content */}
      <div
        ref={stepContainerRef}
        className="hatching-wizard__content"
        role="tabpanel"
        aria-labelledby={`step-${currentStep.id}-title`}
      >
        <h2 id="wizard-title" ref={titleRef} className="hatching-wizard__title" tabIndex={-1}>
          {currentStep.title}
        </h2>

        {error && (
          <div className="hatching-wizard__error" role="alert" aria-live="assertive">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="hatching-wizard__body">{currentStep.content}</div>
      </div>

      {/* Action buttons */}
      <div className="hatching-wizard__actions">
        {currentStep.onCancel && (
          <button
            type="button"
            className="hatching-wizard__button hatching-wizard__button--cancel"
            onClick={handleCancel}
            disabled={isLoading}
            aria-label="Cancel wizard"
          >
            Cancel
          </button>
        )}

        {currentStep.onBack && currentStep.canGoBack && (
          <button
            type="button"
            className="hatching-wizard__button hatching-wizard__button--secondary"
            onClick={handleBack}
            disabled={isLoading}
            aria-label="Go back to previous step"
          >
            Back
          </button>
        )}

        {currentStep.onNext && (
          <button
            type="button"
            className="hatching-wizard__button hatching-wizard__button--primary"
            onClick={handleNext}
            disabled={!currentStep.canProceed || isLoading}
            aria-label={isLoading ? "Processing, please wait" : "Continue to next step"}
          >
            {isLoading ? (
              <span className="hatching-wizard__button-text">Processing...</span>
            ) : (
              <span className="hatching-wizard__button-text">
                {currentStepIndex === steps.length - 1 ? "Finish" : "Next"}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
