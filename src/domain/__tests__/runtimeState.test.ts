import { describe, expect, it } from "vitest";
import type { ApprovalRequest, PetAgentEvent } from "../runtimeEvents";
import {
  INITIAL_RUNTIME_STATE,
  reduceRuntime,
  type RuntimeAction,
  type RuntimeState,
} from "../runtimeState";

const APPROVAL: ApprovalRequest = {
  requestId: "req-1",
  toolName: "shell.exec",
  detail: "ls /",
  risk: "execute",
  allowForSession: true,
};

function applyAll(actions: RuntimeAction[], from: RuntimeState = INITIAL_RUNTIME_STATE) {
  return actions.reduce(reduceRuntime, from);
}

function petEvent(event: PetAgentEvent): RuntimeAction {
  return { type: "PET_EVENT", event };
}

describe("reduceRuntime — single events", () => {
  it("text_delta accumulates streaming text and clears stale error/awaiting", () => {
    const state = applyAll([
      { type: "EXTERNAL_ERROR", message: "old" },
      { type: "SEND_START" },
      petEvent({ type: "text_delta", text: "hello " }),
      petEvent({ type: "text_delta", text: "world" }),
    ]);

    expect(state.streamingText).toBe("hello world");
    expect(state.error).toBeUndefined();
    expect(state.awaitingReply).toBe(false);
  });

  it("turn_completed with finalText settles transcript + lastReply and clears streaming", () => {
    const state = applyAll([
      petEvent({ type: "text_delta", text: "in flight" }),
      petEvent({ type: "turn_completed", finalText: "the final text" }),
    ]);

    expect(state.streamingText).toBe("");
    expect(state.lastReply).toBe("the final text");
    expect(state.transcript).toEqual(["the final text"]);
    expect(state.completedOutputCount).toBe(1);
    expect(state.awaitingReply).toBe(false);
  });

  it("turn_completed without finalText falls back to the streamed text", () => {
    const state = applyAll([
      petEvent({ type: "text_delta", text: "hello " }),
      petEvent({ type: "text_delta", text: "world" }),
      petEvent({ type: "turn_completed" }),
    ]);

    expect(state.lastReply).toBe("hello world");
    expect(state.transcript).toEqual(["hello world"]);
    expect(state.completedOutputCount).toBe(1);
    expect(state.streamingText).toBe("");
  });

  it("turn_completed with empty finalText and no streaming does NOT add an empty transcript line", () => {
    const state = reduceRuntime(INITIAL_RUNTIME_STATE, petEvent({ type: "turn_completed" }));
    expect(state.transcript).toEqual([]);
    expect(state.completedOutputCount).toBe(0);
    expect(state.lastReply).toBe("");
  });

  it("turn_completed clears any stale approval/error so the resumed state is clean", () => {
    const state = applyAll([
      petEvent({ type: "approval_request", request: APPROVAL }),
      { type: "EXTERNAL_ERROR", message: "stale" },
      petEvent({ type: "turn_completed", finalText: "done" }),
    ]);

    expect(state.approval).toBeUndefined();
    expect(state.error).toBeUndefined();
  });

  it("approval_request stores the request and clears any prior error", () => {
    const state = applyAll([
      { type: "EXTERNAL_ERROR", message: "old" },
      petEvent({ type: "approval_request", request: APPROVAL }),
    ]);

    expect(state.approval).toEqual(APPROVAL);
    expect(state.error).toBeUndefined();
  });

  it("ambient_message interrupts in-flight turn machinery and appends to transcript", () => {
    const state = applyAll([
      petEvent({ type: "text_delta", text: "mid stream" }),
      petEvent({ type: "approval_request", request: APPROVAL }),
      petEvent({ type: "ambient_message", text: "hi from ambient" }),
    ]);

    expect(state.streamingText).toBe("");
    expect(state.awaitingReply).toBe(false);
    expect(state.approval).toBeUndefined();
    expect(state.error).toBeUndefined();
    expect(state.transcript).toEqual(["hi from ambient"]);
    expect(state.completedOutputCount).toBe(1);
    expect(state.lastReply).toBe("hi from ambient");
  });

  it("ambient_status only adds to the transcript without disturbing other state", () => {
    const before = applyAll([
      petEvent({ type: "text_delta", text: "stream" }),
      petEvent({ type: "approval_request", request: APPROVAL }),
    ]);
    const after = reduceRuntime(
      before,
      petEvent({ type: "ambient_status", message: "status update" }),
    );

    expect(after.transcript).toEqual(["status update"]);
    expect(after.streamingText).toBe(before.streamingText);
    expect(after.approval).toEqual(before.approval);
    expect(after.completedOutputCount).toBe(before.completedOutputCount);
  });

  it("workspace observation appends a dirty-summary line", () => {
    const state = reduceRuntime(
      INITIAL_RUNTIME_STATE,
      petEvent({
        type: "observation",
        digest: {
          type: "workspace",
          cwd: "/repo",
          repoName: "codex-pet-sidecar",
          dirtySummary: "3 files",
          observedAt: "2026-05-06T00:00:00Z",
        },
      }),
    );

    expect(state.transcript).toEqual(["Workspace: codex-pet-sidecar has 3 files."]);
  });

  it("workspace observation falls back to 'repo' when repoName is absent", () => {
    const state = reduceRuntime(
      INITIAL_RUNTIME_STATE,
      petEvent({
        type: "observation",
        digest: {
          type: "workspace",
          cwd: "/repo",
          dirtySummary: "1 file",
          observedAt: "2026-05-06T00:00:00Z",
        },
      }),
    );

    expect(state.transcript).toEqual(["Workspace: repo has 1 file."]);
  });

  it("workspace observation with no dirtySummary is a no-op", () => {
    const before = applyAll([petEvent({ type: "ambient_status", message: "hello" })]);
    const after = reduceRuntime(
      before,
      petEvent({
        type: "observation",
        digest: { type: "workspace", cwd: "/repo", observedAt: "2026-05-06T00:00:00Z" },
      }),
    );
    expect(after).toEqual(before);
  });

  it("error sets the error and tears down the in-flight turn", () => {
    const state = applyAll([
      petEvent({ type: "text_delta", text: "partial" }),
      petEvent({ type: "approval_request", request: APPROVAL }),
      petEvent({ type: "error", message: "kaboom" }),
    ]);

    expect(state.error).toBe("kaboom");
    expect(state.streamingText).toBe("");
    expect(state.approval).toBeUndefined();
    expect(state.awaitingReply).toBe(false);
  });

  it("error preserves transcript history and completed output count", () => {
    const before = applyAll([
      petEvent({ type: "text_delta", text: "first" }),
      petEvent({ type: "turn_completed", finalText: "first turn" }),
    ]);
    const after = reduceRuntime(before, petEvent({ type: "error", message: "boom" }));

    expect(after.transcript).toEqual(["first turn"]);
    expect(after.completedOutputCount).toBe(1);
    expect(after.lastReply).toBe("first turn");
  });
});

describe("reduceRuntime — UI actions", () => {
  it("SEND_START clears stale error/lastReply/streaming and re-enters awaiting", () => {
    const before = applyAll([
      petEvent({ type: "text_delta", text: "old partial" }),
      petEvent({ type: "turn_completed", finalText: "old reply" }),
      { type: "EXTERNAL_ERROR", message: "stale" },
    ]);
    const after = reduceRuntime(before, { type: "SEND_START" });

    expect(after.error).toBeUndefined();
    expect(after.lastReply).toBe("");
    expect(after.streamingText).toBe("");
    expect(after.awaitingReply).toBe(true);
    // Transcript is preserved across sends.
    expect(after.transcript).toEqual(before.transcript);
  });

  it("SEND_FAILED stops awaiting and surfaces the error", () => {
    const before = reduceRuntime(INITIAL_RUNTIME_STATE, { type: "SEND_START" });
    const after = reduceRuntime(before, { type: "SEND_FAILED", message: "bridge dropped" });
    expect(after.awaitingReply).toBe(false);
    expect(after.error).toBe("bridge dropped");
  });

  it("APPROVAL_RESPONDED clears approval + error and re-enters awaiting", () => {
    const before = applyAll([
      petEvent({ type: "approval_request", request: APPROVAL }),
      { type: "EXTERNAL_ERROR", message: "stale" },
    ]);
    const after = reduceRuntime(before, { type: "APPROVAL_RESPONDED" });

    expect(after.approval).toBeUndefined();
    expect(after.error).toBeUndefined();
    expect(after.awaitingReply).toBe(true);
  });

  it("EXTERNAL_ERROR sets only the error, leaving turn machinery untouched", () => {
    const before = applyAll([
      petEvent({ type: "text_delta", text: "in flight" }),
      petEvent({ type: "approval_request", request: APPROVAL }),
    ]);
    const after = reduceRuntime(before, { type: "EXTERNAL_ERROR", message: "load failed" });

    expect(after.error).toBe("load failed");
    expect(after.streamingText).toBe(before.streamingText);
    expect(after.approval).toEqual(before.approval);
  });

  it("ERROR_CLEARED only clears the error", () => {
    const before = reduceRuntime(INITIAL_RUNTIME_STATE, {
      type: "EXTERNAL_ERROR",
      message: "old",
    });
    const after = reduceRuntime(before, { type: "ERROR_CLEARED" });
    expect(after.error).toBeUndefined();
  });

  it("SKILL_PROMPT_SHOWN appends to transcript and surfaces the bare prompt as lastReply", () => {
    const after = reduceRuntime(INITIAL_RUNTIME_STATE, {
      type: "SKILL_PROMPT_SHOWN",
      skill: "hatching",
      prompt: "go forth and design",
    });

    expect(after.transcript).toEqual(["hatching: go forth and design"]);
    // lastReply must NOT include the skill prefix — only the prompt body.
    expect(after.lastReply).toBe("go forth and design");
  });

  it("SKILL_PROMPT_SHOWN does NOT bump completedOutputCount (it's a UI hint, not a turn)", () => {
    const before = applyAll([
      petEvent({ type: "text_delta", text: "real" }),
      petEvent({ type: "turn_completed", finalText: "real reply" }),
    ]);
    expect(before.completedOutputCount).toBe(1);

    const after = reduceRuntime(before, {
      type: "SKILL_PROMPT_SHOWN",
      skill: "hatching",
      prompt: "go",
    });

    // completedOutputCount unchanged — skill prompts must not trigger the
    // unread-review animation that lights up Olive after a real turn.
    expect(after.completedOutputCount).toBe(1);
  });

  it("RESET drops everything back to the initial state", () => {
    const before = applyAll([
      petEvent({ type: "text_delta", text: "stream" }),
      petEvent({ type: "turn_completed", finalText: "reply" }),
      petEvent({ type: "approval_request", request: APPROVAL }),
      { type: "EXTERNAL_ERROR", message: "boom" },
    ]);
    const after = reduceRuntime(before, { type: "RESET" });
    expect(after).toEqual(INITIAL_RUNTIME_STATE);
  });
});

describe("reduceRuntime — interaction sequences", () => {
  it("text_delta then turn_completed produces a transcript entry and clears streaming", () => {
    const state = applyAll([
      { type: "SEND_START" },
      petEvent({ type: "text_delta", text: "hello " }),
      petEvent({ type: "text_delta", text: "world" }),
      petEvent({ type: "turn_completed" }),
    ]);

    expect(state.transcript).toEqual(["hello world"]);
    expect(state.completedOutputCount).toBe(1);
    expect(state.streamingText).toBe("");
    expect(state.lastReply).toBe("hello world");
    expect(state.awaitingReply).toBe(false);
  });

  it("ambient_message during awaiting clears awaiting and records the message", () => {
    const state = applyAll([
      { type: "SEND_START" },
      petEvent({ type: "ambient_message", text: "ambient interrupted" }),
    ]);

    expect(state.awaitingReply).toBe(false);
    expect(state.transcript).toEqual(["ambient interrupted"]);
    expect(state.lastReply).toBe("ambient interrupted");
  });

  it("error during streaming clears awaiting + approval but keeps prior transcript", () => {
    const state = applyAll([
      petEvent({ type: "text_delta", text: "first" }),
      petEvent({ type: "turn_completed", finalText: "first done" }),
      { type: "SEND_START" },
      petEvent({ type: "text_delta", text: "second" }),
      petEvent({ type: "approval_request", request: APPROVAL }),
      petEvent({ type: "error", message: "kaboom" }),
    ]);

    expect(state.error).toBe("kaboom");
    expect(state.approval).toBeUndefined();
    expect(state.awaitingReply).toBe(false);
    expect(state.transcript).toEqual(["first done"]);
    expect(state.completedOutputCount).toBe(1);
    // SEND_START cleared `lastReply` so the lingering speech bubble dismisses
    // while waiting for the new turn; the second turn errored before it could
    // re-populate, so `lastReply` stays empty.
    expect(state.lastReply).toBe("");
  });

  it("approval flow: approval_request → APPROVAL_RESPONDED → text_delta resumes cleanly", () => {
    const state = applyAll([
      { type: "SEND_START" },
      petEvent({ type: "approval_request", request: APPROVAL }),
      { type: "APPROVAL_RESPONDED" },
      petEvent({ type: "text_delta", text: "after approval" }),
    ]);

    expect(state.approval).toBeUndefined();
    expect(state.error).toBeUndefined();
    expect(state.streamingText).toBe("after approval");
    // text_delta clears awaiting because actual progress is happening now.
    expect(state.awaitingReply).toBe(false);
  });

  it("two consecutive turns each produce one transcript line and bump count by one", () => {
    const state = applyAll([
      { type: "SEND_START" },
      petEvent({ type: "text_delta", text: "first" }),
      petEvent({ type: "turn_completed" }),
      { type: "SEND_START" },
      petEvent({ type: "text_delta", text: "second" }),
      petEvent({ type: "turn_completed" }),
    ]);

    expect(state.transcript).toEqual(["first", "second"]);
    expect(state.completedOutputCount).toBe(2);
    expect(state.lastReply).toBe("second");
  });

  it("RESET after a busy session clears everything for a clean pet switch", () => {
    const before = applyAll([
      petEvent({ type: "text_delta", text: "partial" }),
      petEvent({ type: "approval_request", request: APPROVAL }),
      { type: "EXTERNAL_ERROR", message: "boom" },
      petEvent({ type: "ambient_status", message: "history" }),
    ]);
    expect(before).not.toEqual(INITIAL_RUNTIME_STATE);

    const after = reduceRuntime(before, { type: "RESET" });
    expect(after).toEqual(INITIAL_RUNTIME_STATE);
  });
});
