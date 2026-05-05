export function SpeechBubble({
  text,
  overflow,
  fading,
  onOpenDrawer,
}: {
  text: string;
  overflow: boolean;
  fading?: boolean;
  onOpenDrawer: () => void;
}) {
  if (!text) return null;
  return (
    <button
      className={fading ? "speech-bubble is-fading" : "speech-bubble"}
      type="button"
      onClick={onOpenDrawer}
      aria-label="Open transcript"
    >
      <span>{text}</span>
      {overflow ? <span className="bubble-overflow">Read more →</span> : null}
    </button>
  );
}
