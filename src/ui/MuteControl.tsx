import { muteUntilForChoice, type MuteChoice } from "../domain/rateLimit";

const choices: Array<{ value: MuteChoice; label: string }> = [
  { value: "30m", label: "30 minutes" },
  { value: "2h", label: "2 hours" },
  { value: "tomorrow", label: "Until tomorrow" },
];

export function MuteControl({ onMute }: { onMute: (until: string) => void }) {
  return (
    <div className="mute-control" aria-label="Mute controls">
      {choices.map((choice) => (
        <button key={choice.value} type="button" onClick={() => onMute(muteUntilForChoice(choice.value, new Date()))}>{choice.label}</button>
      ))}
    </div>
  );
}
