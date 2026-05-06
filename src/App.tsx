import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PetLibrary } from "./domain/petLibrary";
import {
  isTuckActive,
  type InstalledPet,
  type PetConfig,
  type TuckUntilInput,
} from "./domain/petConfig";
import type { ApprovalAction, ApprovalRequest } from "./domain/runtimeEvents";
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
  const [streamingText, setStreamingText] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [completedOutputCount, setCompletedOutputCount] = useState(0);
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [error, setError] = useState<string>();
  const [awaitingReply, setAwaitingReply] = useState(false);
  const streamingRef = useRef("");

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
      if (!cancelled) setError(formatError(caught));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    runtimeBridge
      .onPetEvent((event) => {
        if (event.type === "text_delta") {
          setError(undefined);
          setAwaitingReply(false);
          const nextStreamingText = streamingRef.current + event.text;
          streamingRef.current = nextStreamingText;
          setStreamingText(nextStreamingText);
        }
        if (event.type === "turn_completed") {
          setError(undefined);
          setApproval(undefined);
          const completedText = event.finalText ?? streamingRef.current;
          if (completedText) {
            setTranscript((lines) => lines.concat(completedText));
            setCompletedOutputCount((count) => count + 1);
            setLastReply(completedText);
          }
          streamingRef.current = "";
          setStreamingText("");
          setAwaitingReply(false);
        }
        if (event.type === "approval_request") {
          setError(undefined);
          setApproval(event.request);
        }
        if (event.type === "ambient_message") {
          setError(undefined);
          setApproval(undefined);
          setAwaitingReply(false);
          setStreamingText("");
          streamingRef.current = "";
          setTranscript((lines) => lines.concat(event.text));
          setCompletedOutputCount((count) => count + 1);
          setLastReply(event.text);
        }
        if (event.type === "ambient_status") {
          setTranscript((lines) => lines.concat(event.message));
        }
        if (
          event.type === "observation" &&
          event.digest.type === "workspace" &&
          event.digest.dirtySummary
        ) {
          const digest = event.digest;
          setTranscript((lines) =>
            lines.concat(`Workspace: ${digest.repoName ?? "repo"} has ${digest.dirtySummary}.`),
          );
        }
        if (event.type === "error") {
          setError(event.message);
          setApproval(undefined);
          setAwaitingReply(false);
          setStreamingText("");
          streamingRef.current = "";
        }
      })
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      })
      .catch((caught: unknown) => setError(formatError(caught)));
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const handleRestartError = useCallback((caught: unknown) => setError(formatError(caught)), []);
  useRuntimeRestart(appliedConfig, runtimeBridge.startPetRuntime, handleRestartError);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === config?.petId),
    [config?.petId, pets],
  );

  async function switchPet(petId: string) {
    await runtimeBridge.setActivePet(petId);
    setApproval(undefined);
    setError(undefined);
    setAwaitingReply(false);
    setTranscript([]);
    setCompletedOutputCount(0);
    setLastReply("");
    setStreamingText("");
    streamingRef.current = "";
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
    setTranscript((lines) => lines.concat(`${prompt.skill}: ${prompt.prompt}`));
    setLastReply(prompt.prompt);
  }

  async function respond(action: ApprovalAction) {
    if (!approval) return;
    await runtimeBridge.respondToApproval(approval.requestId, action);
    setError(undefined);
    setApproval(undefined);
    setAwaitingReply(true);
  }

  async function sendMessage(text: string) {
    try {
      await runtimeBridge.sendUserMessage(text);
    } catch (caught) {
      setAwaitingReply(false);
      setError(formatError(caught));
      throw caught;
    }
  }

  // Both the onboarding "Import existing Codex pet" button and the in-app
  // toolbar "Import pet" button route here. The dialog plugin handles cancel
  // (returns null), the import command itself rejects invalid packages with
  // good error messages, so we just surface whatever comes back.
  async function handleImportPet() {
    setError(undefined);
    try {
      const folder = await runtimeBridge.pickPetFolder();
      if (!folder) return;
      await runtimeBridge.importPet(folder);
      await refreshState();
    } catch (caught) {
      setError(formatError(caught));
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
      streamingText={streamingText}
      lastReply={lastReply}
      awaitingReply={awaitingReply}
      transcript={transcript}
      completedOutputCount={completedOutputCount}
      approval={approval}
      error={error}
      onSend={sendMessage}
      onSendStart={() => {
        setError(undefined);
        setLastReply("");
        setStreamingText("");
        streamingRef.current = "";
        setAwaitingReply(true);
      }}
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
    />
  );
}

export default App;
