import { useCallback, useEffect, useRef, useState } from "react";
import { updaterBridge, type AvailableAppUpdate, type UpdaterBridge } from "../updaterBridge";

export type UpdateStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "relaunching"
  | "error";

export type OfficialUpdateState = {
  enabled: boolean;
  status: UpdateStatus;
  currentVersion?: string;
  availableVersion?: string;
  notes?: string;
  date?: string;
  downloadedBytes: number;
  contentLength?: number;
  error?: string;
};

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function isOfficialUpdateChannel(env: ImportMetaEnv = import.meta.env) {
  return env.PROD && env.VITE_CODEX_PET_RELEASE_CHANNEL === "official";
}

function errorMessage(caught: unknown) {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === "string") return caught;
  return "Update check failed";
}

const disabledState: OfficialUpdateState = {
  enabled: false,
  status: "disabled",
  downloadedBytes: 0,
};

export function useOfficialUpdater({
  enabled = isOfficialUpdateChannel(),
  bridge = updaterBridge,
}: {
  enabled?: boolean;
  bridge?: UpdaterBridge;
} = {}) {
  const updateRef = useRef<AvailableAppUpdate | null>(null);
  const [state, setState] = useState<OfficialUpdateState>(
    enabled ? { enabled: true, status: "idle", downloadedBytes: 0 } : disabledState,
  );

  const checkForUpdates = useCallback(async () => {
    if (!enabled) return;
    // Cleared on each new check; preserved across install errors so the user can retry without re-fetching.
    updateRef.current = null;
    setState((current) => ({
      ...current,
      enabled: true,
      status: "checking",
      error: undefined,
      downloadedBytes: 0,
      contentLength: undefined,
    }));
    try {
      const [currentVersion, update] = await Promise.all([
        bridge.getCurrentVersion(),
        bridge.checkForUpdate(),
      ]);
      updateRef.current = update;
      setState({
        enabled: true,
        status: update ? "available" : "up-to-date",
        currentVersion,
        availableVersion: update?.version,
        notes: update?.body,
        date: update?.date,
        downloadedBytes: 0,
      });
    } catch (caught) {
      setState((current) => ({
        ...current,
        enabled: true,
        status: "error",
        error: errorMessage(caught),
      }));
    }
  }, [bridge, enabled]);

  const installUpdate = useCallback(async () => {
    if (!enabled || !updateRef.current) return;
    setState((current) => ({
      ...current,
      status: "downloading",
      error: undefined,
      downloadedBytes: 0,
      contentLength: undefined,
    }));
    try {
      let downloadedBytes = 0;
      await updateRef.current.install((event) => {
        if (event.event === "Started") {
          downloadedBytes = 0;
          setState((current) => ({
            ...current,
            downloadedBytes,
            contentLength: event.data.contentLength,
          }));
        } else if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          setState((current) => ({ ...current, downloadedBytes }));
        }
      });
      setState((current) => ({ ...current, status: "relaunching" }));
      await bridge.relaunchApp();
    } catch (caught) {
      setState((current) => ({
        ...current,
        status: "error",
        error: errorMessage(caught),
      }));
    }
  }, [bridge, enabled]);

  useEffect(() => {
    if (!enabled) {
      setState(disabledState);
      return;
    }
    void checkForUpdates();
    const intervalId = setInterval(() => {
      void checkForUpdates();
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [checkForUpdates, enabled]);

  return { state, checkForUpdates, installUpdate };
}
