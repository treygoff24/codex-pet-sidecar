import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { PetLibrary } from "./domain/petLibrary";
import type { InstalledPet, PetConfig, TuckState, TuckUntilInput } from "./domain/petConfig";
import type { ApprovalAction, PetAgentEvent, RuntimeSession } from "./domain/runtimeEvents";

export type SkillPrompt = {
  skill: string;
  prompt: string;
};

type PetVisibilityState = TuckState & {
  visible: boolean;
};

async function pickSingleDirectory(opts?: { defaultPath?: string; title?: string }) {
  const result = await openDialog({
    directory: true,
    multiple: false,
    ...opts,
  });
  return typeof result === "string" ? result : null;
}

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
  tuckPet: (until: TuckUntilInput) => invoke<PetVisibilityState>("tuck_pet", { until }),
  wakePet: () => invoke<PetVisibilityState>("wake_pet"),
  getPetVisibilityState: () => invoke<PetVisibilityState | null>("get_pet_visibility_state"),
  respondToApproval: (requestId: string, action: ApprovalAction) =>
    invoke<void>("respond_to_approval", { requestId, action }),
  onPetEvent: (handler: (event: PetAgentEvent) => void): Promise<UnlistenFn> =>
    listen<PetAgentEvent>("pet://event", (event) => handler(event.payload)),
  startWindowDrag: () => getCurrentWindow().startDragging(),
  petAssetUrl: (path: string) => convertFileSrc(path),
  pickDirectory: (opts?: { defaultPath?: string }): Promise<string | null> =>
    pickSingleDirectory({ defaultPath: opts?.defaultPath }),
  /** Convenience wrapper: pick a staged-pet folder, defaulting to ~/Documents. */
  pickPetFolder: (): Promise<string | null> =>
    pickSingleDirectory({
      title: "Choose a staged pet folder",
    }),
};
