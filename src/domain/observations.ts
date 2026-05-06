export type ObservationDigest =
  | {
      type: "active_app";
      appName: string;
      windowTitle?: string;
      observedAt: string;
      degraded?: string;
    }
  | {
      type: "workspace";
      cwd: string;
      repoName?: string;
      branch?: string;
      dirtySummary?: string;
      observedAt: string;
      degraded?: string;
    }
  | { type: "idle_state"; idleSince?: string; returnedAt?: string; observedAt: string };
