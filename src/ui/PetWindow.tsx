import type { ApprovalRequest } from "../domain/runtimeEvents";
import type { InstalledPet, PetConfig } from "../domain/petConfig";
import { usePetAnimation } from "../hooks/usePetAnimation";
import { useTypewriter } from "../hooks/useTypewriter";
import type { ApprovalAction } from "../runtimeBridge";
import { ApprovalPrompt } from "./ApprovalPrompt";
import { ChatDrawer } from "./ChatDrawer";
import { MuteControl } from "./MuteControl";
import { PetSprite } from "./PetSprite";
import { SettingsPanel } from "./SettingsPanel";
import { SpeechBubble } from "./SpeechBubble";

// Visual thesis: a tiny creature living at the edge of the desktop, soft and low-friction, with letter-from-a-friend chat rather than productivity chrome.
export function PetWindow({
  config,
  pet,
  streamingText,
  transcript,
  drawerOpen,
  approval,
  error,
  onDrawerOpen,
  onSend,
  onMute,
  onConfigChange,
  onApproval,
  onStartDrag,
}: {
  config: PetConfig;
  pet?: InstalledPet;
  streamingText: string;
  transcript: string[];
  drawerOpen: boolean;
  approval?: ApprovalRequest;
  error?: string;
  onDrawerOpen: () => void;
  onSend: (text: string) => Promise<void> | void;
  onMute: (until: string) => void;
  onConfigChange: (config: PetConfig) => void;
  onApproval: (action: ApprovalAction) => void;
  onStartDrag: () => Promise<void> | void;
}) {
  const typed = useTypewriter(streamingText);
  const bubbleOverflow = typed.length > 110;
  const frame = usePetAnimation(streamingText ? "talk" : "idle");

  return (
    <main className="pet-window">
      <div className="pet-stage">
        <SpeechBubble text={typed} overflow={bubbleOverflow} onOpenDrawer={onDrawerOpen} />
        <button
          type="button"
          className="pet-drag-handle"
          aria-label="Drag pet window"
          onPointerDown={() => void onStartDrag()}
        >
          <PetSprite
            spritesheetPath={pet?.spritesheetPath ?? config.spritesheetPath}
            displayName={config.displayName || pet?.displayName || "Codex pet"}
            frame={frame}
          />
        </button>
        {error ? (
          <button type="button" className="setup-error" onClick={onDrawerOpen}>
            {error} Retry from drawer
          </button>
        ) : null}
      </div>
      {approval ? <ApprovalPrompt request={approval} onRespond={onApproval} /> : null}
      <MuteControl onMute={onMute} />
      <SettingsPanel config={config} onChange={onConfigChange} />
      <ChatDrawer
        open={drawerOpen || bubbleOverflow}
        transcript={transcript.concat(typed ? [typed] : [])}
        onSend={onSend}
      />
    </main>
  );
}
