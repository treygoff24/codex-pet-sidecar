import { useEffect, useRef, useState } from "react";
import { resolvePetWindowAnimation } from "../domain/petAnimation";
import type { InstalledPet, PetConfig, TuckUntilInput } from "../domain/petConfig";
import type { PetLibrary } from "../domain/petLibrary";
import type { ApprovalAction, ApprovalRequest } from "../domain/runtimeEvents";
import type { OfficialUpdateState } from "../hooks/useOfficialUpdater";
import { useBubbleFade } from "../hooks/useBubbleFade";
import { useDragAnimation } from "../hooks/useDragAnimation";
import { usePetAnimation } from "../hooks/usePetAnimation";
import { useTypewriter } from "../hooks/useTypewriter";
import { ApprovalPrompt } from "./ApprovalPrompt";
import { ChatDrawer } from "./ChatDrawer";
import { ChatInputBar } from "./ChatInputBar";
import { MuteControl } from "./MuteControl";
import { PetSprite } from "./PetSprite";
import { PetToolbar } from "./PetToolbar";
import { PetLibraryPanel } from "./PetLibraryPanel";
import { TuckWakeControl } from "./TuckWakeControl";
import { SettingsPanel } from "./SettingsPanel";
import { SpeechBubble } from "./SpeechBubble";
import { ThinkingBubble } from "./ThinkingBubble";

// Visual thesis: Olive lives at the edge of the desktop. Her sprite + a chat
// input are the only permanent surfaces. Everything else (settings, snooze,
// transcript) lives behind hover-revealed icons or sheets.

export function PetWindow({
  config,
  tucked,
  pet,
  streamingText,
  lastReply,
  awaitingReply,
  transcript,
  completedOutputCount,
  approval,
  error,
  onSend,
  onMute,
  onConfigChange,
  onApproval,
  onStartDrag,
  onSendStart,
  library,
  pets,
  onSwitchPet,
  onHatchPet,
  onImportPet,
  onTuck,
  onWake,
  onImprovePersonality,
  updateState,
  onCheckForUpdate,
  onInstallUpdate,
}: {
  config: PetConfig;
  tucked: boolean;
  pet?: InstalledPet;
  library?: PetLibrary;
  pets: InstalledPet[];
  streamingText: string;
  lastReply: string;
  awaitingReply: boolean;
  transcript: string[];
  completedOutputCount: number;
  approval?: ApprovalRequest;
  error?: string;
  onSend: (text: string) => Promise<void> | void;
  onMute: (until: string) => void;
  onConfigChange: (config: PetConfig) => void;
  onApproval: (action: ApprovalAction) => void;
  onStartDrag: () => Promise<void> | void;
  onSendStart?: () => void;
  onSwitchPet: (petId: string) => void;
  onHatchPet: () => void;
  onImportPet: () => void;
  onTuck: (until: TuckUntilInput) => void;
  onWake: () => void;
  onImprovePersonality: () => void;
  updateState?: OfficialUpdateState;
  onCheckForUpdate?: () => void;
  onInstallUpdate?: () => void;
}) {
  // While streaming, the bubble shows live typed-out text. After streaming
  // ends, it lingers on the last completed reply so the user can actually read it.
  const isStreaming = streamingText.length > 0;
  const bubbleSource = isStreaming ? streamingText : lastReply;
  const typed = useTypewriter(bubbleSource);
  const bubbleOverflow = typed.length > 110;
  const showThinking = awaitingReply && !isStreaming && !typed;

  const bubbleState = useBubbleFade({ source: bubbleSource, isStreaming, awaitingReply });
  const hasVisibleCompletedReply = Boolean(lastReply) && !isStreaming && bubbleState !== "hidden";
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [seenTranscriptCount, setSeenTranscriptCount] = useState(transcript.length);
  const [seenCompletedOutputCount, setSeenCompletedOutputCount] = useState(completedOutputCount);
  const hasUnreadReply = completedOutputCount > seenCompletedOutputCount;
  const spriteRef = useRef<HTMLDivElement>(null);
  const [isSpriteHovered, setIsSpriteHovered] = useState(false);
  const { dragAnimation, handlers: dragHandlers } =
    useDragAnimation<HTMLButtonElement>(onStartDrag);
  const baseAnimation = resolvePetWindowAnimation({
    tucked,
    isStreaming,
    awaitingReply,
    hasVisibleReply: hasVisibleCompletedReply,
    hasUnreadReply,
    hasApproval: approval != null,
    hasError: error != null,
  });
  const activeAnimation = dragAnimation ?? (isSpriteHovered ? "jumping" : baseAnimation);
  usePetAnimation(spriteRef, activeAnimation);

  useEffect(() => {
    if (!transcriptOpen) return;
    setSeenTranscriptCount(transcript.length);
    setSeenCompletedOutputCount(completedOutputCount);
  }, [completedOutputCount, transcriptOpen, transcript.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (settingsOpen) setSettingsOpen(false);
      else if (muteOpen) setMuteOpen(false);
      else if (transcriptOpen) setTranscriptOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, muteOpen, transcriptOpen]);

  function handleMute(until: string) {
    onMute(until);
    setMuteOpen(false);
  }

  function openTranscript() {
    setTranscriptOpen(true);
  }

  async function handleSend(text: string) {
    onSendStart?.();
    await onSend(text);
  }

  return (
    <main className="pet-window">
      <PetToolbar
        muteOpen={muteOpen}
        settingsOpen={settingsOpen}
        transcriptOpen={transcriptOpen}
        hasUnreadTranscript={transcript.length > seenTranscriptCount}
        onToggleMute={() => {
          setMuteOpen((v) => !v);
          setSettingsOpen(false);
        }}
        onToggleSettings={() => {
          setSettingsOpen((v) => !v);
          setMuteOpen(false);
        }}
        onToggleTranscript={() => setTranscriptOpen((v) => !v)}
      />

      <div className="pet-quick-controls">
        <button type="button" onClick={() => setLibraryOpen((value) => !value)}>
          Pets
        </button>
        <TuckWakeControl tucked={tucked} onTuck={onTuck} onWake={onWake} />
      </div>

      {libraryOpen && library ? (
        <PetLibraryPanel
          library={library}
          pets={pets}
          onSwitch={onSwitchPet}
          onHatch={onHatchPet}
          onImport={onImportPet}
        />
      ) : null}

      <div className="pet-stage">
        {showThinking ? (
          <ThinkingBubble />
        ) : bubbleState !== "hidden" ? (
          <SpeechBubble
            text={typed}
            overflow={bubbleOverflow}
            fading={bubbleState === "fading"}
            onOpenDrawer={openTranscript}
          />
        ) : null}
        <button
          type="button"
          className="pet-drag-handle"
          aria-label="Drag pet window"
          onPointerEnter={() => setIsSpriteHovered(true)}
          onPointerLeave={() => setIsSpriteHovered(false)}
          {...dragHandlers}
        >
          <PetSprite
            ref={spriteRef}
            spritesheetPath={pet?.spritesheetPath ?? config.spritesheetPath}
            displayName={config.displayName}
          />
        </button>
      </div>

      <ChatInputBar onSend={handleSend} petName={pet?.displayName ?? config.displayName} />

      {muteOpen ? (
        <div className="mute-popover" role="dialog" aria-label="Snooze options">
          <div className="mute-popover-title">Mute proactive messages</div>
          <MuteControl onMute={handleMute} />
        </div>
      ) : null}

      <ChatDrawer
        open={transcriptOpen}
        transcript={transcript.concat(typed && isStreaming ? [typed] : [])}
        onClose={() => setTranscriptOpen(false)}
      />

      {approval ? <ApprovalPrompt request={approval} onRespond={onApproval} /> : null}

      {error ? (
        <button type="button" className="setup-error" onClick={() => setSettingsOpen(true)}>
          {error} · Open settings
        </button>
      ) : null}

      {updateState?.status === "available" && !settingsOpen ? (
        <button type="button" className="update-prompt" onClick={() => setSettingsOpen(true)}>
          Update {updateState.availableVersion} available · Open settings
        </button>
      ) : null}

      {settingsOpen ? (
        <>
          <button
            type="button"
            className="sheet-backdrop"
            aria-label="Close settings"
            onClick={() => setSettingsOpen(false)}
          />
          <section className="settings-sheet" role="dialog" aria-label="Pet settings">
            <header className="sheet-header">
              <h2>Settings</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                ×
              </button>
            </header>
            <SettingsPanel
              config={config}
              onChange={onConfigChange}
              onImprovePersonality={onImprovePersonality}
              updateState={updateState}
              onCheckForUpdate={onCheckForUpdate}
              onInstallUpdate={onInstallUpdate}
            />
          </section>
        </>
      ) : null}
    </main>
  );
}
