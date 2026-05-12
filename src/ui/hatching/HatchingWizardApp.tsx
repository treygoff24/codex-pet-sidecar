import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_PETS } from "../../domain/petLibrary";
import { formatError } from "../../domain/errors";
import type {
  HatchingPhase,
  OrphanSummary,
  PetBrief,
  PromptDraft,
  RowKey,
} from "../../domain/hatching";
import { getGeneratingProgress, isPhaseDone } from "../../domain/hatching";
import { hatchingBridge } from "../../hatchingBridge";
import { useHatchingSession } from "../../hooks/useHatchingSession";
import { runtimeBridge } from "../../runtimeBridge";
import { HatchingInspiration } from "./HatchingInspiration";
import { HatchingBrief } from "./HatchingBrief";
import { HatchingPromptReview } from "./HatchingPromptReview";
import { HatchingPrototype } from "./HatchingPrototype";
import { HatchingPrototypeCreating } from "./HatchingPrototypeCreating";
import { HatchingGenerationProgress } from "./HatchingGenerationProgress";
import { HatchingAtlasReview } from "./HatchingAtlasReview";
import { HatchingWelcome } from "./HatchingWelcome";
import { WizardShell } from "./WizardShell";
import { HATCHING_ARCHETYPES } from "./archetypes";

type WizardScreen =
  | "inspiration"
  | "brief"
  | "prompts"
  | "prototype"
  | "generation"
  | "review"
  | "welcome";

const TOTAL_STEPS = 6;

function screenForPhase(phase: HatchingPhase | null): WizardScreen {
  if (!phase) return "inspiration";
  if (phase === "inspiration") return "inspiration";
  if (phase === "brief") return "brief";
  if (phase === "prompts") return "prompts";
  if (phase === "prototype") return "prototype";
  if (getGeneratingProgress(phase)) return "generation";
  if (phase === "review" || phase === "importing") return "review";
  if (isPhaseDone(phase)) return "welcome";
  return "inspiration";
}

function stepForScreen(screen: WizardScreen): number {
  switch (screen) {
    case "inspiration":
      return 1;
    case "brief":
      return 2;
    case "prompts":
      return 3;
    case "prototype":
      return 4;
    case "generation":
      return 5;
    case "review":
    case "welcome":
      return 6;
  }
}

function canGoBack(screen: WizardScreen): boolean {
  return (
    screen === "brief" || screen === "prompts" || screen === "prototype" || screen === "review"
  );
}

function welcomePetId(phase: HatchingPhase | null, importedPetId: string | null): string | null {
  if (phase && isPhaseDone(phase)) return phase.done.petId;
  return importedPetId;
}

// Identity-defining inputs for prompt drafting / first prototype generation.
// When this tuple changes, the auto-fire effects should re-run; otherwise
// they should remain idempotent across re-renders.
function autoFireKey(
  sessionId: string,
  brief: PetBrief | null,
  archetype: string | null,
  referenceImageId: string | null,
): string {
  return `${sessionId}|${brief?.petId ?? ""}|${archetype ?? ""}|${referenceImageId ?? ""}`;
}

export function HatchingWizardApp() {
  const hatching = useHatchingSession();
  const autoPrototypeKeyRef = useRef<string | null>(null);
  const promptDraftKeyRef = useRef<string | null>(null);
  const [manualScreen, setManualScreen] = useState<WizardScreen | null>(null);
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string | null>(null);
  const [referenceImageId, setReferenceImageId] = useState<string | null>(null);
  const [orphanSessions, setOrphanSessions] = useState<OrphanSummary[]>([]);
  const [isLibraryFull, setIsLibraryFull] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [importedPetId, setImportedPetId] = useState<string | null>(null);
  const [isAutoGeneratingPrototype, setIsAutoGeneratingPrototype] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      runtimeBridge
        .loadPetLibrary()
        .then((library) => {
          if (!cancelled) setIsLibraryFull(library.pets.length >= MAX_PETS);
        })
        .catch(() => {
          if (!cancelled) setIsLibraryFull(false);
        }),
      hatchingBridge
        .listOrphanHatchingSessions()
        .then((sessions) => {
          if (!cancelled) setOrphanSessions(sessions);
        })
        .catch(() => {
          if (!cancelled) setOrphanSessions([]);
        }),
    ]);
    return () => {
      cancelled = true;
    };
  }, []);

  const screen = manualScreen ?? screenForPhase(hatching.session?.phase ?? null);
  const petId = welcomePetId(hatching.session?.phase ?? null, importedPetId);
  const selectedArchetype =
    HATCHING_ARCHETYPES.find((archetype) => archetype.id === selectedArchetypeId) ?? null;
  const referencePending = hatching.session?.referenceImage?.descriptionStatus === "pending";
  const prototypeIterations = hatching.session?.prototype?.iterations.length ?? 0;

  const closeWindow = useCallback(async () => {
    await runtimeBridge.hideHatchingWizardWindow();
  }, []);

  const ensureSession = useCallback(async () => {
    if (!hatching.session) await hatching.startNew();
  }, [hatching]);

  const cancel = useCallback(async () => {
    if (!hatching.session) {
      await closeWindow();
      return;
    }
    if (!window.confirm("This will discard the in-progress hatch.")) return;
    try {
      setLocalError(null);
      await hatching.cancel();
      await closeWindow();
    } catch (caught) {
      setLocalError(formatError(caught, "Failed to cancel hatch"));
    }
  }, [closeWindow, hatching]);

  async function chooseReference() {
    try {
      setLocalError(null);
      await ensureSession();
      const path = await hatchingBridge.pickReferenceImage();
      if (!path) return;
      const reference = await hatching.uploadReferenceImage(path);
      setReferenceImageId(reference.id);
    } catch (caught) {
      setLocalError(formatError(caught));
    }
  }

  async function startBlank() {
    try {
      setLocalError(null);
      await ensureSession();
      setSelectedArchetypeId(null);
      setManualScreen("brief");
    } catch (caught) {
      setLocalError(formatError(caught));
    }
  }

  async function selectArchetype(archetypeId: string) {
    try {
      setLocalError(null);
      await ensureSession();
      setSelectedArchetypeId(archetypeId);
      setManualScreen("brief");
    } catch (caught) {
      setLocalError(formatError(caught));
    }
  }

  async function resumeSession(sessionId: string) {
    try {
      setLocalError(null);
      await hatching.resume(sessionId);
      setManualScreen(null);
    } catch (caught) {
      setLocalError(formatError(caught));
    }
  }

  const goBack = useCallback(() => {
    if (screen === "brief") setManualScreen(null);
    else if (screen === "prompts") setManualScreen("brief");
    else if (screen === "prototype") setManualScreen("prompts");
    else if (screen === "review") setManualScreen("prototype");
  }, [screen]);

  useEffect(() => {
    const session = hatching.session;
    if (!session) return;
    if (screen !== "prompts") return;
    if (session.phase !== "prompts") return;
    if (!session.brief) return;
    if (session.promptDrafts.length > 0) return;
    if (hatching.isLoading || referencePending) return;

    const key = autoFireKey(
      session.id,
      session.brief,
      session.archetype,
      session.referenceImage?.id ?? null,
    );
    if (promptDraftKeyRef.current === key) return;
    promptDraftKeyRef.current = key;

    void hatching.draftPromptReview().catch((caught: unknown) => {
      setLocalError(formatError(caught));
    });
  }, [hatching, referencePending, screen]);

  useEffect(() => {
    const session = hatching.session;
    if (!session) return;
    if (screen !== "prototype") return;
    if (session.phase !== "prototype") return;
    if (!session.brief) return;
    if (prototypeIterations > 0) return;
    if (hatching.isLoading || referencePending) return;

    const key = autoFireKey(
      session.id,
      session.brief,
      session.archetype,
      session.referenceImage?.id ?? null,
    );
    if (autoPrototypeKeyRef.current === key) return;
    autoPrototypeKeyRef.current = key;

    setIsAutoGeneratingPrototype(true);
    void hatching
      .generatePrototype(null)
      .catch((caught: unknown) => setLocalError(formatError(caught)))
      .finally(() => setIsAutoGeneratingPrototype(false));
  }, [hatching, prototypeIterations, referencePending, screen]);

  async function submitBrief(brief: PetBrief) {
    try {
      setLocalError(null);
      const activeReferenceImageId =
        referenceImageId ?? hatching.session?.referenceImage?.id ?? null;
      const outcome = await hatching.submitBrief(
        brief,
        selectedArchetypeId,
        activeReferenceImageId,
      );
      if (outcome.requiresConfirmation) {
        const confirmed = window.confirm(
          "Changing this brief will discard prototype iterations. Continue?",
        );
        if (!confirmed) return;
        await hatching.confirmBriefChange(brief, selectedArchetypeId);
      }
      setManualScreen(null);
    } catch (caught) {
      setLocalError(formatError(caught));
    }
  }

  async function generatePrototype(feedback: string | null) {
    try {
      setLocalError(null);
      setIsAutoGeneratingPrototype(true);
      await hatching.generatePrototype(feedback);
    } catch (caught) {
      setLocalError(formatError(caught));
    } finally {
      setIsAutoGeneratingPrototype(false);
    }
  }

  async function saveEditedPromptDrafts(drafts: PromptDraft[]) {
    try {
      setLocalError(null);
      await hatching.savePromptDrafts(drafts);
      setManualScreen(null);
    } catch (caught) {
      setLocalError(formatError(caught));
    }
  }

  async function importPet(activate: boolean) {
    const nextPetId = await hatching.importHatchedPet(activate);
    setImportedPetId(nextPetId);
    setManualScreen("welcome");
  }

  async function startWithPet(activate: boolean) {
    if (activate && petId) await runtimeBridge.setActivePet(petId);
    await closeWindow();
  }

  const error = localError ?? hatching.error;
  const needsFirstPrototype =
    screen === "prototype" && Boolean(hatching.session?.brief) && prototypeIterations === 0;

  let content;
  if (screen === "inspiration") {
    content = (
      <HatchingInspiration
        onSkip={() => void startBlank()}
        onSelectArchetype={(archetypeId) => void selectArchetype(archetypeId)}
        onChooseReference={() => void chooseReference()}
        onResumeSession={(sessionId) => void resumeSession(sessionId)}
        referenceImage={hatching.session?.referenceImage ?? null}
        resumeSessions={orphanSessions}
        isLibraryFull={isLibraryFull}
        isLoading={hatching.isLoading}
      />
    );
  } else if (screen === "brief") {
    content = (
      <HatchingBrief
        initialBrief={hatching.session?.brief ?? null}
        archetype={selectedArchetype}
        referenceImage={hatching.session?.referenceImage ?? null}
        onChooseReference={() => void chooseReference()}
        onSubmit={(brief) => void submitBrief(brief)}
        isLoading={hatching.isLoading}
      />
    );
  } else if (screen === "prompts") {
    content = (
      <HatchingPromptReview
        displayName={hatching.session?.brief?.displayName ?? "your pet"}
        drafts={hatching.session?.promptDrafts ?? []}
        onSave={(drafts) => void saveEditedPromptDrafts(drafts)}
        isLoading={hatching.isLoading}
        error={error}
      />
    );
  } else if (needsFirstPrototype) {
    content = (
      <HatchingPrototypeCreating
        displayName={hatching.session?.brief?.displayName ?? null}
        referenceImage={hatching.session?.referenceImage ?? null}
        isGenerating={isAutoGeneratingPrototype || hatching.isLoading}
        error={error}
        onRetry={() => void generatePrototype(null)}
      />
    );
  } else if (screen === "prototype") {
    content = (
      <HatchingPrototype
        prototype={hatching.session?.prototype ?? null}
        referenceImage={hatching.session?.referenceImage ?? null}
        onGeneratePrototype={(feedback) => void generatePrototype(feedback ?? null)}
        onAcceptPrototype={() => void hatching.acceptPrototype()}
        onRevertToIteration={(n) => void hatching.revertToIteration(n)}
        isLoading={hatching.isLoading}
        error={error}
      />
    );
  } else if (screen === "generation") {
    content = (
      <HatchingGenerationProgress
        session={hatching.session}
        progress={hatching.progress}
        error={error}
        onCancel={() => void cancel()}
      />
    );
  } else if (screen === "review") {
    content = (
      <HatchingAtlasReview
        session={hatching.session}
        onImport={(activate) => void importPet(activate)}
        onRegenerateRow={(rowKey: RowKey) => void hatching.regenerateRow(rowKey)}
        isLoading={hatching.isLoading}
        error={error}
      />
    );
  } else {
    content = (
      <HatchingWelcome
        session={hatching.session}
        petId={petId}
        onSaveAndStay={() => void closeWindow()}
        onStartWith={(activate) => void startWithPet(activate)}
      />
    );
  }

  return (
    <WizardShell
      step={stepForScreen(screen)}
      totalSteps={TOTAL_STEPS}
      isDone={screen === "welcome"}
      canGoBack={canGoBack(screen)}
      onBack={goBack}
      onCancel={() => void cancel()}
      isLoading={hatching.isLoading}
      error={error}
    >
      {content}
    </WizardShell>
  );
}
