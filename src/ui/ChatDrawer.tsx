import { useEffect, useRef } from "react";

export function ChatDrawer({
  open,
  transcript,
  onClose,
}: {
  open: boolean;
  transcript: string[];
  onClose?: () => void;
}) {
  const threadRef = useRef<HTMLDivElement>(null);

  // Keep the latest line in view as new messages stream in.
  useEffect(() => {
    if (!open) return;
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, transcript]);

  if (!open) return null;

  return (
    <aside className="transcript-drawer" aria-label="Conversation transcript">
      <div className="transcript-header">
        <span>Recent</span>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close transcript">
            ×
          </button>
        ) : null}
      </div>
      <div className="drawer-thread" data-testid="drawer-thread" ref={threadRef}>
        {transcript.length === 0 ? (
          <p className="drawer-empty">Nothing yet — say hi.</p>
        ) : (
          transcript.map((line, index) => <p key={`${index}-${line.slice(0, 12)}`}>{line}</p>)
        )}
      </div>
    </aside>
  );
}
