import { useState, useCallback } from "react";
import { HatchingWizard, type HatchingWizardStep } from "../HatchingWizard";
import { HatchingChoiceGate } from "./HatchingChoiceGate";
import { HatchingInspiration } from "./HatchingInspiration";
import { HatchingBrief } from "./HatchingBrief";
import { HatchingPrototype } from "./HatchingPrototype";
import { HatchingGenerationProgress } from "./HatchingGenerationProgress";
import { HatchingAtlasReview } from "./HatchingAtlasReview";

// TODO(phase-3): wire hatchingBridge calls into each step callback.
// The wizard currently runs as a navigation-only shell — every action is
// a placeholder. See src/hatchingBridge.ts for the typed contract that
// these callbacks should consume (startHatchingRun, submitBrief,
// generatePrototype, runRowGeneration, importHatchedPet, etc).

const PHASE_3_IS_LOADING = false;
const PHASE_3_IS_LIBRARY_FULL = false;

export function HatchingWizardApp() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleOpenLibrary = useCallback(() => {
    // TODO(phase-3): open pet library window
  }, []);

  const handleNext = useCallback(() => {
    setCurrentStepIndex((prev) => prev + 1);
    setError(null);
  }, []);

  const handleBack = useCallback(() => {
    setCurrentStepIndex((prev) => prev - 1);
    setError(null);
  }, []);

  const handleCancel = useCallback(() => {
    // TODO(phase-3): cancel session via hatchingBridge.cancelHatchingSession
  }, []);

  const steps: HatchingWizardStep[] = [
    {
      id: "choice-gate",
      title: "Welcome",
      phase: "inspiration",
      content: (
        <HatchingChoiceGate
          onStartNew={() => handleNext()}
          onResumeSession={(_sessionId) => {
            // TODO(phase-3): resume via hatchingBridge.resumeHatchingSession(sessionId)
            handleNext();
          }}
          isLoading={PHASE_3_IS_LOADING}
          isLibraryFull={PHASE_3_IS_LIBRARY_FULL}
          onOpenLibrary={handleOpenLibrary}
        />
      ),
      canProceed: false,
      canGoBack: false,
      onCancel: handleCancel,
    },
    {
      id: "inspiration",
      title: "Inspiration",
      phase: "inspiration",
      content: (
        <HatchingInspiration
          onSkip={() => {
            // TODO(phase-3): record archetype skip
            handleNext();
          }}
          onSelectArchetype={(_archetypeId) => {
            // TODO(phase-3): record archetype via hatchingBridge
            handleNext();
          }}
          isLoading={PHASE_3_IS_LOADING}
        />
      ),
      canProceed: false,
      canGoBack: true,
      onBack: handleBack,
      onCancel: handleCancel,
    },
    {
      id: "brief",
      title: "Pet Brief",
      phase: "brief",
      content: (
        <HatchingBrief
          onSubmit={(_brief) => {
            // TODO(phase-3): submitBrief; honor BriefSubmitOutcome.invalidatesIterations and requiresConfirmation
            handleNext();
          }}
          isLoading={PHASE_3_IS_LOADING}
        />
      ),
      canProceed: false,
      canGoBack: true,
      onBack: handleBack,
      onCancel: handleCancel,
    },
    {
      id: "prototype",
      title: "Prototype",
      phase: "prototype",
      content: (
        <HatchingPrototype
          onGeneratePrototype={(_feedback) => {
            // TODO(phase-3): generatePrototype with feedback
          }}
          onAcceptPrototype={() => {
            // TODO(phase-3): acceptPrototype
            handleNext();
          }}
          isLoading={PHASE_3_IS_LOADING}
          error={error}
        />
      ),
      canProceed: false,
      canGoBack: true,
      onBack: handleBack,
      onCancel: handleCancel,
    },
    {
      id: "generation",
      title: "Generation",
      phase: {
        generating: {
          rowsCompleted: 0,
          rowsTotal: 8,
          estimatedRemaining: 0,
          totalImagegenCalls: 0,
        },
      },
      content: <HatchingGenerationProgress progress={null} currentRow={undefined} error={error} />,
      canProceed: false,
      canGoBack: false,
      onCancel: handleCancel,
    },
    {
      id: "atlas-review",
      title: "Atlas Review",
      phase: "review",
      content: (
        <HatchingAtlasReview
          onImport={(_activate) => {
            // TODO(phase-3): importHatchedPet({ activate })
            handleNext();
          }}
          onRegenerateRow={(_rowKey) => {
            // TODO(phase-3): regenerateRow(rowKey)
          }}
          isLoading={PHASE_3_IS_LOADING}
          error={error}
        />
      ),
      canProceed: false,
      canGoBack: true,
      onBack: handleBack,
      onCancel: handleCancel,
    },
  ];

  return (
    <HatchingWizard
      steps={steps}
      currentStepIndex={currentStepIndex}
      onStepChange={setCurrentStepIndex}
      isLoading={PHASE_3_IS_LOADING}
      error={error}
    />
  );
}
