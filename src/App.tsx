import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { PetLibrary } from "./domain/petLibrary";
import { isTuckActive, type InstalledPet, type PetConfig } from "./domain/petConfig";
import { formatError } from "./domain/errors";
import type { ApprovalAction } from "./domain/runtimeEvents";
import { INITIAL_RUNTIME_STATE, reduceRuntime } from "./domain/runtimeState";
import { hatchingBridge } from "./hatchingBridge";
import { useOfficialUpdater } from "./hooks/useOfficialUpdater";
import { useRuntimeRestart } from "./hooks/useRuntimeRestart";
import { runtimeBridge } from "./runtimeBridge";
import { OnboardingFlow } from "./ui/OnboardingFlow";
import { PetPicker } from "./ui/PetPicker";
import { PetWindow } from "./ui/PetWindow";
import { ResumeBanner } from "./ui/hatching/ResumeBanner";
import "./styles.css";

function App() {
  const [library, setLibrary] = useState<PetLibrary>();
  const [pets, setPets] = useState<InstalledPet[]>([]);
  // `config` is the optimistic UI mirror of the pet config — updated immediately
  // on user edits so controlled inputs stay snappy.
  // `appliedConfig` only advances after the disk write resolves; the runtime
  // restart effect keys on it, so we never restart against a stale on-disk state.
  const [config, setConfig] = useState<PetConfig | null>(null);
  const [appliedConfig, setAppliedConfig] = useState<PetConfig | null>(null);
  const [runtime, dispatch] = useReducer(reduceRuntime, INITIAL_RUNTIME_STATE);
  const updater = useOfficialUpdater();
  const previousTuckedRef = useRef<boolean | null>(null);
  const configSaveRevisionRef = useRef(0);

  async function refreshState() {
    const [nextLibrary, nextConfig, installedPets] = await Promise.all([
      runtimeBridge.loadPetLibrary(),
      runtimeBridge.loadPetConfig(),
      runtimeBridge.listInstalledPets(),
    ]);
    setLibrary(nextLibrary);
    setConfig(nextConfig);
    setAppliedConfig(nextConfig);
    setPets(installedPets);
  }

  useEffect(() => {
    let cancelled = false;
    refreshState().catch((caught: unknown) => {
      if (!cancelled) dispatch({ type: "EXTERNAL_ERROR", message: formatError(caught) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleFocus() {
      void refreshState();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  useEffect(() => {
    if (!config) return;
    const tucked = isTuckActive(config.tuck);
    const previous = previousTuckedRef.current;
    previousTuckedRef.current = tucked;

    if (tucked) {
      void runtimeBridge.tuckWindowToTab();
    } else if (previous === true) {
      void runtimeBridge.restorePetWindowFromTab();
    }
  }, [config]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    runtimeBridge
      .onPetEvent((event) => dispatch({ type: "PET_EVENT", event }))
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      })
      .catch((caught: unknown) =>
        dispatch({ type: "EXTERNAL_ERROR", message: formatError(caught) }),
      );
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const handleRestartError = useCallback(
    (caught: unknown) => dispatch({ type: "EXTERNAL_ERROR", message: formatError(caught) }),
    [],
  );
  useRuntimeRestart(appliedConfig, runtimeBridge.startPetRuntime, handleRestartError);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === config?.petId),
    [config?.petId, pets],
  );

  async function switchPet(petId: string) {
    await runtimeBridge.setActivePet(petId);
    dispatch({ type: "RESET" });
    await refreshState();
  }

  async function updateConfig(nextConfig: PetConfig) {
    const previousConfig = config;
    const saveRevision = configSaveRevisionRef.current + 1;
    configSaveRevisionRef.current = saveRevision;
    setConfig(nextConfig); // optimistic UI
    try {
      await runtimeBridge.savePetConfig(nextConfig); // wait for disk
      if (configSaveRevisionRef.current === saveRevision) {
        setAppliedConfig(nextConfig); // restart-eligible only after latest save resolves
      }
    } catch (caught) {
      if (configSaveRevisionRef.current === saveRevision) {
        if (previousConfig) setConfig(previousConfig);
        dispatch({ type: "EXTERNAL_ERROR", message: formatError(caught) });
      }
    }
  }

  async function mute(until: string) {
    await runtimeBridge.setMuteUntil(until);
    if (config) setConfig({ ...config, mute: { until } });
  }

  async function tuck() {
    await runtimeBridge.tuckPet(null);
    dispatch({ type: "RESET" });
    if (config) {
      const nextConfig = { ...config, tuck: { tucked: true } };
      setConfig(nextConfig);
      setAppliedConfig(nextConfig);
    }
  }

  async function wake() {
    await runtimeBridge.wakePet();
    if (config) {
      const nextConfig = { ...config, tuck: { tucked: false } };
      setConfig(nextConfig);
      setAppliedConfig(nextConfig);
    }
  }

  async function respond(action: ApprovalAction) {
    if (!runtime.approval) return;
    await runtimeBridge.respondToApproval(runtime.approval.requestId, action);
    dispatch({ type: "APPROVAL_RESPONDED" });
  }

  async function sendMessage(text: string) {
    try {
      await runtimeBridge.sendUserMessage(text);
    } catch (caught) {
      dispatch({ type: "SEND_FAILED", message: formatError(caught) });
      throw caught;
    }
  }

  // The dialog plugin handles cancel (returns null), and the import command
  // rejects invalid packages with good error messages, so we just surface
  // whatever comes back.
  async function handleImportPet() {
    dispatch({ type: "ERROR_CLEARED" });
    try {
      const folder = await runtimeBridge.pickPetFolder();
      if (!folder) return;
      await runtimeBridge.importPet(folder);
      await refreshState();
    } catch (caught) {
      dispatch({ type: "EXTERNAL_ERROR", message: formatError(caught) });
    }
  }

  async function handleStartHatching() {
    dispatch({ type: "ERROR_CLEARED" });
    try {
      if (config && !isTuckActive(config.tuck)) {
        await runtimeBridge.tuckPet(null);
        dispatch({ type: "RESET" });
        const nextConfig = { ...config, tuck: { tucked: true } };
        setConfig(nextConfig);
        setAppliedConfig(nextConfig);
        await runtimeBridge.tuckWindowToTab();
      }
      await runtimeBridge.showHatchingWizardWindow();
    } catch (caught) {
      dispatch({ type: "EXTERNAL_ERROR", message: formatError(caught) });
    }
  }

  async function handleArchivePet(petId: string) {
    dispatch({ type: "ERROR_CLEARED" });
    try {
      await hatchingBridge.archivePet(petId);
      await refreshState();
    } catch (caught) {
      dispatch({ type: "EXTERNAL_ERROR", message: formatError(caught) });
    }
  }

  if (!library || !config) {
    if (pets.length > 0) return <PetPicker pets={pets} onPick={(pet) => void switchPet(pet.id)} />;
    return (
      <OnboardingFlow
        onUseOlive={() => void refreshState()}
        onHatch={() => void handleStartHatching()}
        onImport={() => void handleImportPet()}
        skillPrompt={runtime.lastReply || undefined}
      />
    );
  }

  return (
    <>
      <ResumeBanner />
      <PetWindow
        config={config}
        tucked={isTuckActive(config.tuck)}
        pet={selectedPet}
        streamingText={runtime.streamingText}
        lastReply={runtime.lastReply}
        awaitingReply={runtime.awaitingReply}
        transcript={runtime.transcript}
        completedOutputCount={runtime.completedOutputCount}
        approval={runtime.approval}
        error={runtime.error}
        onSend={sendMessage}
        onSendStart={() => dispatch({ type: "SEND_START" })}
        library={library}
        pets={pets}
        onSwitchPet={(petId) => void switchPet(petId)}
        onHatchPet={() => void handleStartHatching()}
        onImportPet={() => void handleImportPet()}
        onArchivePet={(petId) => void handleArchivePet(petId)}
        onMute={mute}
        onTuck={() => void tuck()}
        onWake={() => void wake()}
        onConfigChange={updateConfig}
        onApproval={respond}
        onStartDrag={runtimeBridge.startWindowDrag}
        updateState={updater.state}
        onCheckForUpdate={() => void updater.checkForUpdates()}
        onInstallUpdate={() => void updater.installUpdate()}
      />
    </>
  );
}

export default App;
