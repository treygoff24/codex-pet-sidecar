type ObserverSettings = {
  activeApp: boolean;
  windowTitle: boolean;
  workspace: boolean;
  idle: boolean;
};

type MuteState = {
  until?: string;
};

export type TuckState = {
  tucked: boolean;
  tuckedUntil?: string;
};

export type TuckUntilInput = NonNullable<TuckState["tuckedUntil"]> | null;

export const SESSION_PERSISTENCE = {
  ephemeral: "ephemeral",
  savedHistory: "savedHistory",
} as const;

type SessionPersistence = (typeof SESSION_PERSISTENCE)[keyof typeof SESSION_PERSISTENCE];

export const RUNTIME_SAFETY_MODE = {
  safe: "safe",
  power: "power",
} as const;

type RuntimeSafetyMode = (typeof RUNTIME_SAFETY_MODE)[keyof typeof RUNTIME_SAFETY_MODE];

type RuntimeConfig = {
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
  if (tuck.tuckedUntil == null) return true;
  const until = Date.parse(tuck.tuckedUntil);
  // Treat unparseable timestamps as expired so the user can wake the pet.
  // Mirrors the Rust-side fallback in commands::tuck_is_active.
  if (Number.isNaN(until)) return false;
  return until > now.getTime();
}
