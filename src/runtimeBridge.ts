import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { PetLibrary } from "./domain/petLibrary";
import type { InstalledPet, PetConfig, TuckState } from "./domain/petConfig";
import type { PetAgentEvent, RuntimeSession } from "./domain/runtimeEvents";

export type ApprovalAction = "allow_once" | "allow_session" | "deny";

export type SkillPrompt = {
  skill: string;
  prompt: string;
};

export type PetVisibilityState = {
  tucked: boolean;
  tuckedUntil?: string;
  visible: boolean;
};

export const runtimeBridge = {
  listInstalledPets: () => invoke<InstalledPet[]>("list_installed_pets"),
  loadPetLibrary: () => invoke<PetLibrary>("load_pet_library"),
  loadPetConfig: () => invoke<PetConfig | null>("load_pet_config"),
  savePetConfig: (config: PetConfig) => invoke<void>("save_pet_config", { config }),
  setActivePet: (petId: string) => invoke<PetLibrary>("set_active_pet", { petId }),
  importPet: (sourceDir: string) => invoke<PetLibrary>("import_pet", { sourceDir }),
  startHatchingFlow: () => invoke<SkillPrompt>("start_hatching_flow"),
  startPersonalityFlow: () => invoke<SkillPrompt>("start_personality_flow"),
  startPetRuntime: () => invoke<RuntimeSession>("start_pet_runtime"),
  sendUserMessage: (text: string) => invoke<void>("send_user_message", { text }),
  interruptTurn: () => invoke<void>("interrupt_turn"),
  setMuteUntil: (until: string | null) => invoke<void>("set_mute_until", { until }),
  tuckPet: (until: TuckState["tuckedUntil"] | null) =>
    invoke<PetVisibilityState>("tuck_pet", { until }),
  wakePet: () => invoke<PetVisibilityState>("wake_pet"),
  getPetVisibilityState: () => invoke<PetVisibilityState | null>("get_pet_visibility_state"),
  respondToApproval: (requestId: string, action: ApprovalAction) =>
    invoke<void>("respond_to_approval", { requestId, action }),
  onPetEvent: (handler: (event: PetAgentEvent) => void): Promise<UnlistenFn> =>
    listen<PetAgentEvent>("pet://event", (event) => handler(event.payload)),
  startWindowDrag: () => getCurrentWindow().startDragging(),
  petAssetUrl: (path: string) => {
    try {
      return convertFileSrc(path);
    } catch {
      return path;
    }
  },
  pickDirectory: async (opts?: { defaultPath?: string }): Promise<string | null> => {
    const result = await openDialog({
      directory: true,
      multiple: false,
      defaultPath: opts?.defaultPath,
    });
    return typeof result === "string" ? result : null;
  },
  /** Convenience wrapper: pick a staged-pet folder, defaulting to ~/Documents. */
  pickPetFolder: async (): Promise<string | null> => {
    const result = await openDialog({
      directory: true,
      multiple: false,
      title: "Choose a staged pet folder",
    });
    return typeof result === "string" ? result : null;
  },
};
