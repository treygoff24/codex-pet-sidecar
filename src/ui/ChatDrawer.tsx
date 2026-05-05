import { FormEvent, useState } from "react";

export function ChatDrawer({ open, transcript, onSend }: { open: boolean; transcript: string[]; onSend: (text: string) => Promise<void> | void }) {
  const [text, setText] = useState("");
  if (!open) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    await onSend(trimmed);
  }

  return (
    <aside className="chat-drawer" aria-label="Pet chat drawer">
      <div className="drawer-thread" data-testid="drawer-thread">
        {transcript.map((line, index) => <p key={`${index}-${line.slice(0, 12)}`}>{line}</p>)}
      </div>
      <form onSubmit={submit} className="chat-form">
        <label className="sr-only" htmlFor="chat-input">Message your pet</label>
        <input id="chat-input" value={text} onChange={(event) => setText(event.currentTarget.value)} placeholder="Write a tiny note…" />
        <button type="submit">Send</button>
      </form>
    </aside>
  );
}
