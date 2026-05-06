import {
  APPROVAL_ACTION,
  type ApprovalAction,
  type ApprovalRequest,
} from "../domain/runtimeEvents";

export function ApprovalPrompt({
  request,
  onRespond,
}: {
  request: ApprovalRequest;
  onRespond: (action: ApprovalAction) => void;
}) {
  return (
    <section className="approval-prompt" aria-label="Codex approval request">
      <strong>{request.toolName}</strong>
      <p>{request.detail}</p>
      <div>
        <button type="button" onClick={() => onRespond(APPROVAL_ACTION.allowOnce)}>
          Allow once
        </button>
        <button
          type="button"
          disabled={!request.allowForSession}
          onClick={() => onRespond(APPROVAL_ACTION.allowSession)}
        >
          Allow for session
        </button>
        <button type="button" onClick={() => onRespond(APPROVAL_ACTION.deny)}>
          Deny
        </button>
      </div>
    </section>
  );
}
