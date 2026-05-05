export function SpeechBubble({
  text,
  overflow,
  onOpenDrawer,
}: {
  text: string;
  overflow: boolean;
  onOpenDrawer: () => void;
}) {
  if (!text) return null;
  return (
    <button
      className="speech-bubble"
      type="button"
      onClick={onOpenDrawer}
      aria-label="Open chat drawer"
    >
      <span>{text}</span>
      {overflow ? <span className="bubble-overflow">Open drawer →</span> : null}
    </button>
  );
}
