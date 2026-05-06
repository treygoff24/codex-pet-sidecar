import type { ObservationDigest } from "./observations";

export const APPROVAL_ACTION = {
  allowOnce: "allow_once",
  allowSession: "allow_session",
  deny: "deny",
} as const;

export type ApprovalAction = (typeof APPROVAL_ACTION)[keyof typeof APPROVAL_ACTION];

export type RuntimeSession = {
  threadId: string;
  websocketUrl: string;
  effectiveModel: string;
};

export type ApprovalRequest = {
  requestId: string;
  toolName: string;
  detail: string;
  risk: "read" | "write" | "execute" | "unknown";
  allowForSession: boolean;
};

export type PetAgentEvent =
  | { type: "text_delta"; text: string }
  | { type: "ambient_message"; text: string }
  | { type: "ambient_status"; message: string }
  | { type: "turn_completed"; finalText?: string }
  | { type: "approval_request"; request: ApprovalRequest }
  | { type: "observation"; digest: ObservationDigest }
  | { type: "error"; message: string };
