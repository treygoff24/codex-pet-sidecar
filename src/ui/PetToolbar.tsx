export function PetToolbar({
  muteOpen,
  settingsOpen,
  transcriptOpen,
  hasUnreadTranscript,
  onToggleMute,
  onToggleSettings,
  onToggleTranscript,
}: {
  muteOpen: boolean;
  settingsOpen: boolean;
  transcriptOpen: boolean;
  hasUnreadTranscript: boolean;
  onToggleMute: () => void;
  onToggleSettings: () => void;
  onToggleTranscript: () => void;
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
      <button
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
