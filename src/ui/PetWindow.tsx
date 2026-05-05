import { useEffect, useRef, useState } from "react";
import type { ApprovalRequest } from "../domain/runtimeEvents";
import type { InstalledPet, PetConfig } from "../domain/petConfig";
import { usePetAnimation } from "../hooks/usePetAnimation";
import { useTypewriter } from "../hooks/useTypewriter";
import type { ApprovalAction } from "../runtimeBridge";
import { ApprovalPrompt } from "./ApprovalPrompt";
import { ChatDrawer } from "./ChatDrawer";
import { ChatInputBar } from "./ChatInputBar";
import { MuteControl } from "./MuteControl";
import { PetSprite } from "./PetSprite";
import { PetToolbar } from "./PetToolbar";
import { SettingsPanel } from "./SettingsPanel";
import { SpeechBubble } from "./SpeechBubble";
import { ThinkingBubble } from "./ThinkingBubble";

// Visual thesis: Olive lives at the edge of the desktop. Her sprite + a chat
// input are the only permanent surfaces. Everything else (settings, snooze,
// transcript) lives behind hover-revealed icons or sheets.
export function PetWindow({
  config,
  pet,
  streamingText,
  lastReply,
  awaitingReply,
  transcript,
  approval,
  error,
  onSend,
  onMute,
  onConfigChange,
  onApproval,
  onStartDrag,
  onSendStart,
}: {
  config: PetConfig;
  pet?: InstalledPet;
  streamingText: string;
  lastReply: string;
  awaitingReply: boolean;
  transcript: string[];
  approval?: ApprovalRequest;
  error?: string;
  onSend: (text: string) => Promise<void> | void;
  onMute: (until: string) => void;
  onConfigChange: (config: PetConfig) => void;
  onApproval: (action: ApprovalAction) => void;
  onStartDrag: () => Promise<void> | void;
  onSendStart?: () => void;
}) {
  // While streaming, the bubble shows live typed-out text. After streaming
  // ends, it lingers on the last completed reply so the user can actually read it.
  const isStreaming = streamingText.length > 0;
  const bubbleSource = isStreaming ? streamingText : lastReply;
  const typed = useTypewriter(bubbleSource);
  const bubbleOverflow = typed.length > 110;
  const showThinking = awaitingReply && !isStreaming && !typed;

  const spriteRef = useRef<HTMLDivElement>(null);
  usePetAnimation(spriteRef, isStreaming ? "talk" : "idle");

  // Auto-fade the lingering reply after a quiet stretch so Olive doesn't sit
  // there with a stale bubble forever. Resets the moment new content arrives.
  type BubbleState = "visible" | "fading" | "hidden";
  const [bubbleState, setBubbleState] = useState<BubbleState>("visible");
  useEffect(() => {
    setBubbleState("visible");
  }, [bubbleSource, isStreaming, awaitingReply]);
  useEffect(() => {
    if (!bubbleSource || isStreaming || awaitingReply) return;
    if (bubbleState !== "visible") return;
    const startFade = setTimeout(() => setBubbleState("fading"), 12_000);
    return () => clearTimeout(startFade);
  }, [bubbleSource, isStreaming, awaitingReply, bubbleState]);
  useEffect(() => {
    if (bubbleState !== "fading") return;
    const finishFade = setTimeout(() => setBubbleState("hidden"), 600);
    return () => clearTimeout(finishFade);
  }, [bubbleState]);

  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [seenTranscriptCount, setSeenTranscriptCount] = useState(transcript.length);

  useEffect(() => {
    if (transcriptOpen) setSeenTranscriptCount(transcript.length);
  }, [transcriptOpen, transcript.length]);

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
          onPointerDown={() => void onStartDrag()}
        >
          <PetSprite
            ref={spriteRef}
            spritesheetPath={pet?.spritesheetPath ?? config.spritesheetPath}
            displayName={config.displayName || pet?.displayName || "Codex pet"}
          />
        </button>
      </div>

      <ChatInputBar onSend={handleSend} />

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
            <SettingsPanel config={config} onChange={onConfigChange} />
          </section>
        </>
      ) : null}
    </main>
  );
}
