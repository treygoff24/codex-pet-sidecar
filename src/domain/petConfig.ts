export type ObserverSettings = {
  activeApp: boolean;
  windowTitle: boolean;
  workspace: boolean;
  idle: boolean;
};

export type MuteState = {
  until?: string;
};

export type PetConfig = {
  petId: string;
  displayName: string;
  spritesheetPath: string;
  persona: string;
  mute: MuteState;
  workspaceCwd?: string;
  observers: ObserverSettings;
  proactive: {
    enabled: boolean;
    minMinutesBetweenMessages: number;
  };
};

export type InstalledPet = {
  id: string;
  displayName: string;
  description?: string;
  spritesheetPath: string;
  metadataPath: string;
  diagnostics: string[];
};

export const defaultPersona = "You are my little buddy in my computer with me.";
