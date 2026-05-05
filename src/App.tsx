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
    ambient: {
      enabled: true,
      intervalMinutes: 15,
      includeScreenshot: false,
      retainScreenshots: false,
    },
    proactive: { enabled: true, minMinutesBetweenMessages: 10 },
  };
}

function App() {
  const [pets, setPets] = useState<InstalledPet[]>([]);
  const [config, setConfig] = useState<PetConfig | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [lastReply, setLastReply] = useState("");
  const [transcript, setTranscript] = useState<string[]>([]);
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [error, setError] = useState<string>();
  const [awaitingReply, setAwaitingReply] = useState(false);
  const streamingRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    runtimeBridge
      .loadPetConfig()
      .then((savedConfig) => {
        if (cancelled) return;
        setConfig(savedConfig);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
    runtimeBridge
      .listInstalledPets()
      .then((installedPets) => {
        if (!cancelled) setPets(installedPets);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
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
          setAwaitingReply(false);
          setStreamingText((value) => {
            const next = value + event.text;
            streamingRef.current = next;
            return next;
          });
        }
        if (event.type === "turn_completed") {
          const completedText = event.finalText ?? streamingRef.current;
          if (completedText) {
            setTranscript((lines) => lines.concat(completedText));
            setLastReply(completedText);
          }
          streamingRef.current = "";
          setStreamingText("");
          setAwaitingReply(false);
        }
        if (event.type === "approval_request") setApproval(event.request);
        if (event.type === "ambient_message") {
          setTranscript((lines) => lines.concat(event.text));
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
          setAwaitingReply(false);
        }
      })
      .then((un) => {
        // StrictMode runs effects twice in dev; if we were already cleaned up
        // before the listener resolved, drop it immediately.
        if (cancelled) un();
        else unlisten = un;
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    if (!config?.petId) return;
    runtimeBridge
      .startPetRuntime()
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
  }, [config?.petId]);

  const selectedPet = useMemo(
    () => pets.find((pet) => pet.id === config?.petId),
    [config?.petId, pets],
  );

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

  async function sendMessage(text: string) {
    try {
      await runtimeBridge.sendUserMessage(text);
    } catch (caught) {
      setAwaitingReply(false);
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    }
  }

  if (!config?.petId) return <PetPicker pets={pets} onPick={pickPet} />;

  return (
    <PetWindow
      config={config}
      pet={selectedPet}
      streamingText={streamingText}
      lastReply={lastReply}
      awaitingReply={awaitingReply}
      transcript={transcript}
      approval={approval}
      error={error}
      onSend={sendMessage}
      onSendStart={() => {
        setLastReply("");
        setAwaitingReply(true);
      }}
      onMute={mute}
      onConfigChange={updateConfig}
      onApproval={respond}
      onStartDrag={runtimeBridge.startWindowDrag}
    />
  );
}

export default App;
