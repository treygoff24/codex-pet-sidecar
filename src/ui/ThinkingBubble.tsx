// Renders the small "thinking" indicator that appears while we're waiting
// for Olive's first delta after a user message. Three soft pulsing dots in
// a bubble — same shape as the speech bubble so the transition feels native.
export function ThinkingBubble() {
  return (
    <div className="thinking-bubble" aria-label="Olive is thinking" role="status">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </div>
  );
}
