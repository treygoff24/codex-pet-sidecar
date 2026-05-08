import type { Ref } from "react";

export function PetToolbar({
  muteOpen,
  settingsOpen,
  transcriptOpen,
  hasUnreadTranscript,
  onToggleMute,
  onTuck,
  onToggleSettings,
  onToggleTranscript,
  settingsButtonRef,
}: {
  muteOpen: boolean;
  settingsOpen: boolean;
  transcriptOpen: boolean;
  hasUnreadTranscript: boolean;
  onToggleMute: () => void;
  onTuck: () => void;
  onToggleSettings: () => void;
  onToggleTranscript: () => void;
  settingsButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="pet-toolbar" role="toolbar" aria-label="Pet controls">
      <button
        type="button"
        aria-label="Snooze proactive messages"
        aria-pressed={muteOpen}
        title="Snooze"
        onClick={onToggleMute}
      >
        <span aria-hidden>💤</span>
      </button>
      <button
        type="button"
        aria-label={transcriptOpen ? "Close transcript" : "Open transcript"}
        aria-pressed={transcriptOpen}
        title="Transcript"
        onClick={onToggleTranscript}
      >
        <span aria-hidden>{hasUnreadTranscript ? "💬" : "💭"}</span>
      </button>
      <button type="button" aria-label="Tuck pet away" title="Tuck" onClick={onTuck}>
        <span aria-hidden>↘</span>
      </button>
      <button
        ref={settingsButtonRef}
        type="button"
        aria-label="Pet settings"
        aria-pressed={settingsOpen}
        title="Settings"
        onClick={onToggleSettings}
      >
        <span aria-hidden>⚙</span>
      </button>
    </div>
  );
}
