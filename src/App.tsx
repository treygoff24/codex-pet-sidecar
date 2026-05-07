import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { PetLibrary } from "./domain/petLibrary";
import {
  isTuckActive,
  type InstalledPet,
  type PetConfig,
  type TuckUntilInput,
} from "./domain/petConfig";
import type { ApprovalAction } from "./domain/runtimeEvents";
import { INITIAL_RUNTIME_STATE, reduceRuntime } from "./domain/runtimeState";
import { useOfficialUpdater } from "./hooks/useOfficialUpdater";
import { useRuntimeRestart } from "./hooks/useRuntimeRestart";
import { runtimeBridge, type SkillPrompt } from "./runtimeBridge";
import { OnboardingFlow } from "./ui/OnboardingFlow";
import { PetPicker } from "./ui/PetPicker";
import { PetWindow } from "./ui/PetWindow";
import "./styles.css";

function hasStringMessage(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

function formatError(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === "string") return caught;
  if (hasStringMessage(caught)) return caught.message;
  try {
    return JSON.stringify(caught);
  } catch {
    return "Unknown error";
  }
}

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
    setConfig(nextConfig); // optimistic UI
    await runtimeBridge.savePetConfig(nextConfig); // wait for disk
    setAppliedConfig(nextConfig); // restart-eligible only after save resolves
  }

  async function mute(until: string) {
    await runtimeBridge.setMuteUntil(until);
    if (config) setConfig({ ...config, mute: { until } });
  }

  async function tuck(until: TuckUntilInput) {
    await runtimeBridge.tuckPet(until);
    if (config) setConfig({ ...config, tuck: { tucked: true, tuckedUntil: until ?? undefined } });
  }

  async function wake() {
    await runtimeBridge.wakePet();
    if (config) setConfig({ ...config, tuck: { tucked: false } });
  }

  async function showSkillPrompt(loader: () => Promise<SkillPrompt>) {
    const prompt = await loader();
    dispatch({ type: "SKILL_PROMPT_SHOWN", skill: prompt.skill, prompt: prompt.prompt });
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

  // Both the onboarding "Import existing Codex pet" button and the in-app
  // toolbar "Import pet" button route here. The dialog plugin handles cancel
  // (returns null), the import command itself rejects invalid packages with
  // good error messages, so we just surface whatever comes back.
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

  if (!library || !config) {
    if (pets.length > 0) return <PetPicker pets={pets} onPick={(pet) => void switchPet(pet.id)} />;
    return (
      <OnboardingFlow
        onUseOlive={() => void refreshState()}
        onHatch={() => void showSkillPrompt(runtimeBridge.startHatchingFlow)}
        onImport={() => void handleImportPet()}
      />
    );
  }

  return (
    <PetWindow
      config={config}
      tucked={isTuckActive(config.tuck)}
      pet={selectedPet}
      library={library}
      pets={pets}
      streamingText={runtime.streamingText}
      lastReply={runtime.lastReply}
      awaitingReply={runtime.awaitingReply}
      transcript={runtime.transcript}
      completedOutputCount={runtime.completedOutputCount}
      approval={runtime.approval}
      error={runtime.error}
      onSend={sendMessage}
      onSendStart={() => dispatch({ type: "SEND_START" })}
      onMute={mute}
      onTuck={tuck}
      onWake={wake}
      onConfigChange={updateConfig}
      onSwitchPet={switchPet}
      onHatchPet={() => void showSkillPrompt(runtimeBridge.startHatchingFlow)}
      onImportPet={() => void handleImportPet()}
      onImprovePersonality={() => void showSkillPrompt(runtimeBridge.startPersonalityFlow)}
      onApproval={respond}
      onStartDrag={runtimeBridge.startWindowDrag}
      updateState={updater.state}
      onCheckForUpdate={() => void updater.checkForUpdates()}
      onInstallUpdate={() => void updater.installUpdate()}
    />
  );
}

export default App;
