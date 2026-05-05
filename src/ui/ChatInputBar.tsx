import { FormEvent, useState } from "react";

export function ChatInputBar({
  onSend,
  disabled,
  placeholder = "talk to olive…",
}: {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    setText("");
    await onSend(trimmed);
  }

  const canSend = text.trim().length > 0 && !disabled;

  return (
    <form onSubmit={submit} className="chat-input-bar" aria-label="Send a message to your pet">
      <label className="sr-only" htmlFor="pet-chat-input">
        Message your pet
      </label>
      <input
        id="pet-chat-input"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      <button type="submit" disabled={!canSend} aria-label="Send message">
        ↑
      </button>
    </form>
  );
}
