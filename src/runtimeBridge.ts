import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow, primaryMonitor } from "@tauri-apps/api/window";
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

const PET_WINDOW_SIZE = { width: 288, height: 368 };
const TUCKED_TAB_SIZE = { width: 88, height: 64 };
const EDGE_GAP = 8;
const WAKE_MARGIN = 16;

async function pickSingleDirectory(opts?: { defaultPath?: string; title?: string }) {
  const result = await openDialog({
    directory: true,
    multiple: false,
    ...opts,
  });
  return typeof result === "string" ? result : null;
}

async function currentLogicalWorkArea() {
  const window = getCurrentWindow();
  const scaleFactor = await window.scaleFactor();
  const monitor = (await currentMonitor()) ?? (await primaryMonitor());
  if (!monitor) return null;
  return {
    x: monitor.workArea.position.x / scaleFactor,
    y: monitor.workArea.position.y / scaleFactor,
    width: monitor.workArea.size.width / scaleFactor,
    height: monitor.workArea.size.height / scaleFactor,
  };
}

async function currentLogicalY(fallback: number): Promise<number> {
  try {
    const window = getCurrentWindow();
    const [position, scaleFactor] = await Promise.all([
      window.outerPosition(),
      window.scaleFactor(),
    ]);
    return position.y / scaleFactor;
  } catch {
    return fallback;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function tuckWindowToTab() {
  const window = getCurrentWindow();
  const workArea = await currentLogicalWorkArea();
  await window.show();
  await window.setSize(new LogicalSize(TUCKED_TAB_SIZE.width, TUCKED_TAB_SIZE.height));
  if (!workArea) return;

  const currentY = await currentLogicalY(
    workArea.y + workArea.height - TUCKED_TAB_SIZE.height - 120,
  );
  const x = workArea.x + workArea.width - TUCKED_TAB_SIZE.width + EDGE_GAP;
  const y = clamp(
    currentY,
    workArea.y + WAKE_MARGIN,
    workArea.y + workArea.height - TUCKED_TAB_SIZE.height - WAKE_MARGIN,
  );
  await window.setPosition(new LogicalPosition(x, y));
}

async function restorePetWindowFromTab() {
  const window = getCurrentWindow();
  const workArea = await currentLogicalWorkArea();
  await window.show();
  await window.setSize(new LogicalSize(PET_WINDOW_SIZE.width, PET_WINDOW_SIZE.height));
  if (workArea) {
    const currentY = await currentLogicalY(
      workArea.y + workArea.height - PET_WINDOW_SIZE.height - WAKE_MARGIN,
    );
    const x = workArea.x + workArea.width - PET_WINDOW_SIZE.width - WAKE_MARGIN;
    const y = clamp(
      currentY,
      workArea.y + WAKE_MARGIN,
      workArea.y + workArea.height - PET_WINDOW_SIZE.height - WAKE_MARGIN,
    );
    await window.setPosition(new LogicalPosition(x, y));
  }
  await window.setFocus();
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
  tuckWindowToTab,
  restorePetWindowFromTab,
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
