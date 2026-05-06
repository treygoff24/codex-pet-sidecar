import type { ApprovalRequest, PetAgentEvent } from "./runtimeEvents";

/**
 * The pet's runtime-driven UI state. All seven slots are derived purely from
 * the action stream — no useEffect-driven mirroring, no out-of-band state.
 *
 * The activation priority computed in `petAnimation.resolvePetWindowAnimation`
 * is sensitive to the combinations of these flags, so transitions need to be
 * coherent: e.g. the start of a new turn must clear stale `error`/`approval`
 * so they don't mask the resumed `running` state. Keeping every transition
 * in one reducer makes those clears auditable in one place.
 */
export type RuntimeState = {
  streamingText: string;
  lastReply: string;
  transcript: string[];
  completedOutputCount: number;
  approval: ApprovalRequest | undefined;
  error: string | undefined;
  awaitingReply: boolean;
};

export const INITIAL_RUNTIME_STATE: RuntimeState = {
  streamingText: "",
  lastReply: "",
  transcript: [],
  completedOutputCount: 0,
  approval: undefined,
  error: undefined,
  awaitingReply: false,
};

export type RuntimeAction =
  // A pet event arrived from the runtime bridge. The reducer owns the
  // per-event-type logic; App.tsx just forwards the event.
  | { type: "PET_EVENT"; event: PetAgentEvent }
  // The user kicked off a send. Clears the prior settled reply, any stale
  // error, and any in-flight streaming text so the next progress looks fresh.
  | { type: "SEND_START" }
  // The send failed before any progress arrived. Stops the awaiting state and
  // surfaces the error.
  | { type: "SEND_FAILED"; message: string }
  // The user responded to an approval. The runtime will resume the turn, so
  // clear approval + error and re-enter awaiting.
  | { type: "APPROVAL_RESPONDED" }
  // An error from outside the runtime stream (initial state load,
  // subscription setup, import flow). Sets the error without touching the
  // approval/streaming/awaiting machinery.
  | { type: "EXTERNAL_ERROR"; message: string }
  // The user is starting a UI flow that should clear the prior error pill
  // (e.g. opening the import dialog).
  | { type: "ERROR_CLEARED" }
  // A user-initiated "show me a skill prompt" flow (Hatch, Improve
  // Personality). Surfaces the prompt in the bubble + transcript without
  // bumping completedOutputCount — these are UI hints, not Codex turn output,
  // and should NOT trigger the unread-review animation.
  | { type: "SKILL_PROMPT_SHOWN"; skill: string; prompt: string }
  // The user switched pets. Drop everything.
  | { type: "RESET" };

export function reduceRuntime(state: RuntimeState, action: RuntimeAction): RuntimeState {
  switch (action.type) {
    case "PET_EVENT":
      return reducePetEvent(state, action.event);
    case "SEND_START":
      return {
        ...state,
        error: undefined,
        lastReply: "",
        streamingText: "",
        awaitingReply: true,
      };
    case "SEND_FAILED":
      return { ...state, error: action.message, awaitingReply: false };
    case "APPROVAL_RESPONDED":
      return { ...state, error: undefined, approval: undefined, awaitingReply: true };
    case "EXTERNAL_ERROR":
      return { ...state, error: action.message };
    case "ERROR_CLEARED":
      return { ...state, error: undefined };
    case "SKILL_PROMPT_SHOWN":
      return {
        ...state,
        transcript: state.transcript.concat(`${action.skill}: ${action.prompt}`),
        lastReply: action.prompt,
      };
    case "RESET":
      return INITIAL_RUNTIME_STATE;
  }
}

function reducePetEvent(state: RuntimeState, event: PetAgentEvent): RuntimeState {
  switch (event.type) {
    case "text_delta":
      // Progress arriving means any prior error is stale, and we're no longer
      // strictly "awaiting" — text is flowing.
      return {
        ...state,
        error: undefined,
        awaitingReply: false,
        streamingText: state.streamingText + event.text,
      };

    case "turn_completed": {
      // Settle the final text into the transcript + lastReply when present;
      // an empty turn_completed does NOT add an empty transcript line.
      const completedText = event.finalText ?? state.streamingText;
      const settled = completedText
        ? {
            transcript: state.transcript.concat(completedText),
            completedOutputCount: state.completedOutputCount + 1,
            lastReply: completedText,
          }
        : {};
      return {
        ...state,
        ...settled,
        error: undefined,
        approval: undefined,
        streamingText: "",
        awaitingReply: false,
      };
    }

    case "approval_request":
      return { ...state, error: undefined, approval: event.request };

    case "ambient_message":
      // Ambient pings interrupt whatever was happening. Clear the in-flight
      // turn machinery and append the message to the transcript.
      return {
        ...state,
        error: undefined,
        approval: undefined,
        awaitingReply: false,
        streamingText: "",
        transcript: state.transcript.concat(event.text),
        completedOutputCount: state.completedOutputCount + 1,
        lastReply: event.text,
      };

    case "ambient_status":
      return { ...state, transcript: state.transcript.concat(event.message) };

    case "observation":
      if (event.digest.type !== "workspace" || !event.digest.dirtySummary) return state;
      return {
        ...state,
        transcript: state.transcript.concat(
          `Workspace: ${event.digest.repoName ?? "repo"} has ${event.digest.dirtySummary}.`,
        ),
      };

    case "error":
      // A runtime error supersedes the in-flight approval/streaming, but does
      // NOT clear the transcript or completed output history.
      return {
        ...state,
        error: event.message,
        approval: undefined,
        awaitingReply: false,
        streamingText: "",
      };
  }
}
