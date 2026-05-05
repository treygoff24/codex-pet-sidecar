import { useEffect, useMemo, useRef, useState } from "react";
import { defaultPersona, type InstalledPet, type PetConfig } from "./domain/petConfig";
import type { ApprovalRequest } from "./domain/runtimeEvents";
import { runtimeBridge, type ApprovalAction } from "./runtimeBridge";
import { PetPicker } from "./ui/PetPicker";
import { PetWindow } from "./ui/PetWindow";
import "./styles.css";

const fallbackWorkspace = "/Users/treygoff/Code/codex-pet-sidecar";

function configFromPet(pet: InstalledPet): PetConfig {
  return {
    petId: pet.id,
    displayName: pet.displayName,
    spritesheetPath: pet.spritesheetPath,
    persona: defaultPersona,
    mute: {},
    workspaceCwd: fallbackWorkspace,
    observers: { activeApp: true, windowTitle: true, workspace: true, idle: true },
    proactive: { enabled: true, minMinutesBetweenMessages: 10 },
  };
}

function App() {
  const [pets, setPets] = useState<InstalledPet[]>([]);
  const [config, setConfig] = useState<PetConfig | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [error, setError] = useState<string>();
  const streamingRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    runtimeBridge.loadPetConfig()
      .then((savedConfig) => {
        if (cancelled) return;
        setConfig(savedConfig);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
    runtimeBridge.listInstalledPets()
      .then((installedPets) => {
        if (!cancelled) setPets(installedPets);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    runtimeBridge.onPetEvent((event) => {
      if (event.type === "text_delta") {
        setStreamingText((value) => {
          const next = value + event.text;
          streamingRef.current = next;
          return next;
        });
      }
      if (event.type === "turn_completed") {
        const completedText = event.finalText ?? streamingRef.current;
        setTranscript((lines) => (completedText ? lines.concat(completedText) : lines));
        streamingRef.current = "";
        setStreamingText("");
      }
      if (event.type === "approval_request") setApproval(event.request);
      if (event.type === "observation" && event.digest.type === "workspace" && event.digest.dirtySummary) {
        const digest = event.digest;
        setTranscript((lines) => lines.concat(`Workspace: ${digest.repoName ?? "repo"} has ${digest.dirtySummary}.`));
      }
      if (event.type === "error") setError(event.message);
    }).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, []);

  useEffect(() => {
    if (!config?.petId) return;
    runtimeBridge.startPetRuntime().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)));
  }, [config?.petId]);

  const selectedPet = useMemo(() => pets.find((pet) => pet.id === config?.petId), [config?.petId, pets]);

  async function pickPet(pet: InstalledPet) {
    const nextConfig = configFromPet(pet);
    setConfig(nextConfig);
    await runtimeBridge.savePetConfig(nextConfig);
  }

  async function updateConfig(nextConfig: PetConfig) {
    setConfig(nextConfig);
    await runtimeBridge.savePetConfig(nextConfig);
  }

  async function mute(until: string) {
    await runtimeBridge.setMuteUntil(until);
    if (config) setConfig({ ...config, mute: { until } });
  }

  async function respond(action: ApprovalAction) {
    if (!approval) return;
    await runtimeBridge.respondToApproval(approval.requestId, action);
    setApproval(undefined);
  }

  if (!config?.petId) return <PetPicker pets={pets} onPick={pickPet} />;

  return (
    <PetWindow
      config={config}
      pet={selectedPet}
      streamingText={streamingText}
      transcript={transcript}
      drawerOpen={drawerOpen}
      approval={approval}
      error={error}
      onDrawerOpen={() => setDrawerOpen(true)}
      onSend={runtimeBridge.sendUserMessage}
      onMute={mute}
      onConfigChange={updateConfig}
      onApproval={respond}
      onStartDrag={runtimeBridge.startWindowDrag}
    />
  );
}

export default App;
