/**
 * HatchingWizardApp - Main hatching wizard orchestrator.
 *
 * This component orchestrates all the hatching wizard steps and manages the overall flow.
 * It uses the shared HatchingWizard shell and integrates all step components.
 */

import { useState, useCallback } from "react";
import { HatchingWizard, type HatchingWizardStep } from "../HatchingWizard";
import { HatchingChoiceGate } from "./HatchingChoiceGate";
import { HatchingInspiration } from "./HatchingInspiration";
import { HatchingBrief } from "./HatchingBrief";
import { HatchingPrototype } from "./HatchingPrototype";
import { HatchingGenerationProgress } from "./HatchingGenerationProgress";
import { HatchingAtlasReview } from "./HatchingAtlasReview";

export function HatchingWizardApp() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLibraryFull] = useState(false); // TODO: Check library status from backend

  const handleOpenLibrary = useCallback(() => {
    // TODO: Implement library opening logic
    console.log("Open library to archive a pet");
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
    // TODO: Implement cancel logic - close window or show confirmation
    console.log("Cancel hatching wizard");
  }, []);

  const steps: HatchingWizardStep[] = [
    {
      id: "choice-gate",
      title: "Welcome",
      phase: "Inspiration",
      content: (
        <HatchingChoiceGate
          onStartNew={() => handleNext()}
          onResumeSession={(sessionId) => {
            console.log("Resume session:", sessionId);
            handleNext();
          }}
          isLoading={isLoading}
          isLibraryFull={isLibraryFull}
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
      phase: "Inspiration",
      content: (
        <HatchingInspiration
          onSkip={() => {
            console.log("Skip inspiration");
            handleNext();
          }}
          onSelectArchetype={(archetypeId) => {
            console.log("Selected archetype:", archetypeId);
            handleNext();
          }}
          isLoading={isLoading}
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
      phase: "Brief",
      content: (
        <HatchingBrief
          onSubmit={(brief) => {
            console.log("Submit brief:", brief);
            handleNext();
          }}
          isLoading={isLoading}
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
      phase: "Prototype",
      content: (
        <HatchingPrototype
          onGeneratePrototype={(feedback) => {
            console.log("Generate prototype with feedback:", feedback);
          }}
          onAcceptPrototype={() => {
            console.log("Accept prototype");
            handleNext();
          }}
          isLoading={isLoading}
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
      phase: { Generating: { rowsCompleted: 0, rowsTotal: 8, estimatedRemaining: 0, totalImagegenCalls: 0 } },
      content: (
        <HatchingGenerationProgress
          progress={null}
          currentRow={undefined}
          error={error}
        />
      ),
      canProceed: false,
      canGoBack: false,
      onCancel: handleCancel,
    },
    {
      id: "atlas-review",
      title: "Atlas Review",
      phase: "Review",
      content: (
        <HatchingAtlasReview
          onImport={(activate) => {
            console.log("Import atlas, activate:", activate);
            handleNext();
          }}
          onRegenerateRow={(rowKey) => {
            console.log("Regenerate row:", rowKey);
          }}
          isLoading={isLoading}
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
      isLoading={isLoading}
      error={error}
    />
  );
}