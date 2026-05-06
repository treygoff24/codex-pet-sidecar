export type ObserverSettings = {
  activeApp: boolean;
  windowTitle: boolean;
  workspace: boolean;
  idle: boolean;
};

export type MuteState = {
  until?: string;
};

export type TuckState = {
  tucked: boolean;
  tuckedUntil?: string;
};

export type SessionPersistence = "ephemeral" | "savedHistory";
export type RuntimeSafetyMode = "safe" | "power";

export type RuntimeConfig = {
  sessionPersistence: SessionPersistence;
  safetyMode: RuntimeSafetyMode;
};

export type PetConfig = {
  petId: string;
  displayName: string;
  spritesheetPath: string;
  persona: string;
  mute: MuteState;
  tuck: TuckState;
  workspaceCwd?: string;
  observers: ObserverSettings;
  ambient: {
    enabled: boolean;
    intervalMinutes: number;
    includeScreenshot: boolean;
    retainScreenshots: boolean;
  };
  runtime: RuntimeConfig;
};

export type InstalledPet = {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
  metadataPath: string;
  diagnostics: string[];
};

export const genericDefaultPersona =
  "You are a small desktop pet. Be warm, brief, playful, and respectful of the user's privacy.";

export function isTuckActive(tuck: TuckState, now = new Date()): boolean {
  if (!tuck.tucked) return false;
  if (!tuck.tuckedUntil) return true;
  const until = Date.parse(tuck.tuckedUntil);
  // Treat unparseable timestamps as expired so the user can wake the pet.
  // Mirrors the Rust-side fallback in commands::tuck_is_active.
  if (Number.isNaN(until)) return false;
  return until > now.getTime();
}
