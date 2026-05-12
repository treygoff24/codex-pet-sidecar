import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { formatError } from "../domain/errors";
import {
  getGeneratingProgress,
  isPhaseDone,
  isPhaseGenerating,
  type BriefSubmitOutcome,
  type GenerationProgress,
  type HatchingSession,
  type PetBrief,
  type PromptDraft,
  type PrototypeIteration,
  type ReferenceImage,
  type RowKey,
  type RowState,
} from "../domain/hatching";
import { hatchingBridge } from "../hatchingBridge";

export interface UseHatchingSession {
  session: HatchingSession | null;
  progress: GenerationProgress | null;
  isLoading: boolean;
  error: string | null;
  isInspiration: boolean;
  isBrief: boolean;
  isPrompts: boolean;
  isPrototype: boolean;
  isGenerating: boolean;
  isReview: boolean;
  isImporting: boolean;
  isDone: boolean;
  startNew: () => Promise<void>;
  resume: (sessionId: string) => Promise<void>;
  cancel: () => Promise<void>;
  uploadReferenceImage: (localPath: string) => Promise<ReferenceImage>;
  submitBrief: (
    brief: PetBrief,
    archetypeId: string | null,
    referenceImageId: string | null,
  ) => Promise<BriefSubmitOutcome>;
  confirmBriefChange: (brief: PetBrief, archetypeId: string | null) => Promise<BriefSubmitOutcome>;
  draftPromptReview: () => Promise<PromptDraft[]>;
  savePromptDrafts: (drafts: PromptDraft[]) => Promise<void>;
  generatePrototype: (feedback: string | null) => Promise<PrototypeIteration>;
  revertToIteration: (n: number) => Promise<void>;
  acceptPrototype: () => Promise<void>;
  regenerateRow: (rowKey: RowKey) => Promise<RowState>;
  importHatchedPet: (activate: boolean) => Promise<string>;
}

function activeSessionId(sessionId: string | null): string {
  if (!sessionId) throw new Error("No active hatching session");
  return sessionId;
}

function isPollingPhase(session: HatchingSession | null): boolean {
  if (!session) return false;
  return (
    session.phase === "inspiration" ||
    session.phase === "brief" ||
    session.phase === "prompts" ||
    session.phase === "prototype" ||
    isPhaseGenerating(session.phase) ||
    session.phase === "review"
  );
}

export function useHatchingSession(initialSessionId: string | null = null): UseHatchingSession {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const sessionIdRef = useRef<string | null>(initialSessionId);
  const [session, setSession] = useState<HatchingSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  const refreshSession = useCallback(async (id = sessionIdRef.current) => {
    if (!id) return null;
    const next = await hatchingBridge.getHatchingState(id);
    setSession(next);
    return next;
  }, []);

  const run = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      return await operation();
    } catch (caught) {
      const message = formatError(caught);
      setError(message);
      throw caught;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialSessionId) return;
    let cancelled = false;
    setIsLoading(true);
    refreshSession(initialSessionId)
      .catch((caught: unknown) => {
        if (!cancelled) setError(formatError(caught));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSessionId, refreshSession]);

  useEffect(() => {
    if (!sessionId) return;
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    listen<GenerationProgress>(`hatching://progress/${sessionId}`, (event) => {
      if (cancelled) return;
      setSession((current) => {
        if (!current || current.id !== sessionId) return current;
        return { ...current, phase: { generating: event.payload } };
      });
    })
      .then((nextUnlisten) => {
        if (cancelled) nextUnlisten();
        else unlisten = nextUnlisten;
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(formatError(caught));
      });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [sessionId]);

  const progress = session ? getGeneratingProgress(session.phase) : null;
  const isGenerating = !!progress;
  const isPolling = isPollingPhase(session);

  useEffect(() => {
    if (!isPolling) return;
    const intervalMs = isGenerating ? 2_000 : 5_000;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshSession().catch((caught: unknown) => setError(formatError(caught)));
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isGenerating, isPolling, refreshSession]);

  const startNew = useCallback(
    async () =>
      run(async () => {
        const nextSessionId = await hatchingBridge.startHatchingRun();
        sessionIdRef.current = nextSessionId;
        setSessionId(nextSessionId);
        await refreshSession(nextSessionId);
      }),
    [refreshSession, run],
  );

  const resume = useCallback(
    async (nextSessionId: string) =>
      run(async () => {
        const resumed = await hatchingBridge.resumeHatchingRun(nextSessionId);
        sessionIdRef.current = nextSessionId;
        setSessionId(nextSessionId);
        setSession(resumed);
      }),
    [run],
  );

  const cancel = useCallback(
    async () =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        await hatchingBridge.cancelHatchingRun(id);
        sessionIdRef.current = null;
        setSessionId(null);
        setSession(null);
      }),
    [run],
  );

  const uploadReferenceImage = useCallback(
    async (localPath: string) =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        const reference = await hatchingBridge.uploadReferenceImage(id, localPath);
        await refreshSession(id);
        return reference;
      }),
    [refreshSession, run],
  );

  const submitBrief = useCallback(
    async (brief: PetBrief, archetypeId: string | null, referenceImageId: string | null) =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        const outcome = await hatchingBridge.submitBrief(id, brief, archetypeId, referenceImageId);
        if (!outcome.requiresConfirmation) await refreshSession(id);
        return outcome;
      }),
    [refreshSession, run],
  );

  const confirmBriefChange = useCallback(
    async (brief: PetBrief, archetypeId: string | null) =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        const outcome = await hatchingBridge.confirmBriefChange(id, brief, archetypeId);
        await refreshSession(id);
        return outcome;
      }),
    [refreshSession, run],
  );

  const draftPromptReview = useCallback(
    async () =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        const drafts = await hatchingBridge.draftPromptReview(id);
        await refreshSession(id);
        return drafts;
      }),
    [refreshSession, run],
  );

  const savePromptDrafts = useCallback(
    async (drafts: PromptDraft[]) =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        await hatchingBridge.savePromptDrafts(id, drafts);
        await refreshSession(id);
      }),
    [refreshSession, run],
  );

  const generatePrototype = useCallback(
    async (feedback: string | null) =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        const iteration = await hatchingBridge.generatePrototype(id, feedback);
        await refreshSession(id);
        return iteration;
      }),
    [refreshSession, run],
  );

  const revertToIteration = useCallback(
    async (n: number) =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        await hatchingBridge.revertToIteration(id, n);
        await refreshSession(id);
      }),
    [refreshSession, run],
  );

  const acceptPrototype = useCallback(
    async () =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        await hatchingBridge.acceptPrototype(id);
        await refreshSession(id);
      }),
    [refreshSession, run],
  );

  const regenerateRow = useCallback(
    async (rowKey: RowKey) =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        const row = await hatchingBridge.regenerateRow(id, rowKey);
        await refreshSession(id);
        return row;
      }),
    [refreshSession, run],
  );

  const importHatchedPet = useCallback(
    async (activate: boolean) =>
      run(async () => {
        const id = activeSessionId(sessionIdRef.current);
        const petId = await hatchingBridge.importHatchedPet(id, activate);
        await refreshSession(id).catch(() => null);
        return petId;
      }),
    [refreshSession, run],
  );

  return useMemo(
    () => ({
      session,
      progress,
      isLoading,
      error,
      isInspiration: session?.phase === "inspiration",
      isBrief: session?.phase === "brief",
      isPrompts: session?.phase === "prompts",
      isPrototype: session?.phase === "prototype",
      isGenerating,
      isReview: session?.phase === "review",
      isImporting: session?.phase === "importing",
      isDone: session ? isPhaseDone(session.phase) : false,
      startNew,
      resume,
      cancel,
      uploadReferenceImage,
      submitBrief,
      confirmBriefChange,
      draftPromptReview,
      savePromptDrafts,
      generatePrototype,
      revertToIteration,
      acceptPrototype,
      regenerateRow,
      importHatchedPet,
    }),
    [
      acceptPrototype,
      cancel,
      confirmBriefChange,
      draftPromptReview,
      error,
      generatePrototype,
      importHatchedPet,
      isGenerating,
      isLoading,
      progress,
      regenerateRow,
      resume,
      revertToIteration,
      session,
      startNew,
      savePromptDrafts,
      submitBrief,
      uploadReferenceImage,
    ],
  );
}
