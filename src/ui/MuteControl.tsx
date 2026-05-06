import { MUTE_CHOICES, muteUntilForChoice, type MuteChoice } from "../domain/rateLimit";

const labels = {
  "30m": "30 minutes",
  "2h": "2 hours",
  tomorrow: "Until tomorrow",
} satisfies Record<MuteChoice, string>;

const choices = MUTE_CHOICES.map((value) => ({ value, label: labels[value] }));

export function MuteControl({ onMute }: { onMute: (until: string) => void }) {
  return (
    <div className="mute-control" aria-label="Mute controls">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          onClick={() => onMute(muteUntilForChoice(choice.value, new Date()))}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
