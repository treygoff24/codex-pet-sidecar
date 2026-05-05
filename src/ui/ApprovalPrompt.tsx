import type { ApprovalRequest } from "../domain/runtimeEvents";
import type { ApprovalAction } from "../runtimeBridge";

export function ApprovalPrompt({ request, onRespond }: { request: ApprovalRequest; onRespond: (action: ApprovalAction) => void }) {
  return (
    <section className="approval-prompt" aria-label="Codex approval request">
      <strong>{request.toolName}</strong>
      <p>{request.detail}</p>
      <div>
        <button type="button" onClick={() => onRespond("allow_once")}>Allow once</button>
        <button type="button" disabled={!request.allowForSession} onClick={() => onRespond("allow_session")}>Allow for session</button>
        <button type="button" onClick={() => onRespond("deny")}>Deny</button>
      </div>
    </section>
  );
}
