import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { InstalledPet, PetConfig } from "./domain/petConfig";
import type { PetAgentEvent, RuntimeSession } from "./domain/runtimeEvents";

export type ApprovalAction = "allow_once" | "allow_session" | "deny";

export const runtimeBridge = {
  listInstalledPets: () => invoke<InstalledPet[]>("list_installed_pets"),
  loadPetConfig: () => invoke<PetConfig | null>("load_pet_config"),
  savePetConfig: (config: PetConfig) => invoke<void>("save_pet_config", { config }),
  startPetRuntime: () => invoke<RuntimeSession>("start_pet_runtime"),
  sendUserMessage: (text: string) => invoke<void>("send_user_message", { text }),
  interruptTurn: () => invoke<void>("interrupt_turn"),
  setMuteUntil: (until: string | null) => invoke<void>("set_mute_until", { until }),
  respondToApproval: (requestId: string, action: ApprovalAction) => invoke<void>("respond_to_approval", { requestId, action }),
  onPetEvent: (handler: (event: PetAgentEvent) => void): Promise<UnlistenFn> => listen<PetAgentEvent>("pet://event", (event) => handler(event.payload)),
  startWindowDrag: () => getCurrentWindow().startDragging(),
  petAssetUrl: (path: string) => {
    try {
      return convertFileSrc(path);
    } catch {
      return path;
    }
  },
};
