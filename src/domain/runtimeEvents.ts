export type RuntimeSession = {
  threadId: string;
  websocketUrl: string;
  effectiveModel: string;
};

export type PetUserInput = {
  text: string;
  attachments?: Array<{ type: "localImage"; path: string }>;
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
  | { type: "turn_completed"; finalText?: string }
  | { type: "approval_request"; request: ApprovalRequest }
  | { type: "observation"; digest: import("./observations").ObservationDigest }
  | { type: "error"; message: string };
