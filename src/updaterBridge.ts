import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";

export type UpdateDownloadEvent = DownloadEvent;

export type AvailableAppUpdate = {
  version: string;
  date?: string;
  body?: string;
  install: (onEvent: (event: UpdateDownloadEvent) => void) => Promise<void>;
};

export type UpdaterBridge = {
  getCurrentVersion: () => Promise<string>;
  checkForUpdate: () => Promise<AvailableAppUpdate | null>;
  relaunchApp: () => Promise<void>;
};

export const updaterBridge: UpdaterBridge = {
  getCurrentVersion: getVersion,
  checkForUpdate: async () => {
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      date: update.date,
      body: update.body,
      install: (onEvent) => update.downloadAndInstall(onEvent),
    };
  },
  relaunchApp: relaunch,
};
