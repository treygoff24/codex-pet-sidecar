import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { OfficialUpdateState } from "../../hooks/useOfficialUpdater";
import type { InstalledPet, PetConfig } from "../../domain/petConfig";
import { PetWindow } from "../PetWindow";

const runtimeBridgeMock = vi.hoisted(() => ({
  petAssetUrl: vi.fn((path: string) => path),
  pickDirectory: vi.fn(),
}));

vi.mock("../../runtimeBridge", () => ({
  runtimeBridge: runtimeBridgeMock,
}));

const baseConfig: PetConfig = {
  petId: "olive",
  displayName: "Olive",
  spritesheetPath: "/tmp/olive.webp",
  persona: "friendly",
  mute: {},
  tuck: { tucked: false },
  workspaceCwd: "/repo",
  observers: { activeApp: true, windowTitle: true, workspace: true, idle: true },
  ambient: {
    enabled: true,
    intervalMinutes: 15,
    includeScreenshot: false,
    retainScreenshots: false,
  },
  runtime: { sessionPersistence: "ephemeral", safetyMode: "safe" },
};

const olivePet: InstalledPet = {
  id: "olive",
  displayName: "Olive",
  spritesheetPath: "/tmp/olive.webp",
  metadataPath: "/tmp/pet.json",
  diagnostics: [],
};

function SettingsHarness({
  initialConfig = baseConfig,
  updateState = { enabled: false, status: "disabled", downloadedBytes: 0 },
  onConfigChange = vi.fn(),
  onCheckForUpdate = vi.fn(),
  onInstallUpdate = vi.fn(),
  onStartDrag = vi.fn(),
}: {
  initialConfig?: PetConfig;
  updateState?: OfficialUpdateState;
  onConfigChange?: (config: PetConfig) => void;
  onCheckForUpdate?: () => void;
  onInstallUpdate?: () => void;
  onStartDrag?: () => void;
}) {
  const [config, setConfig] = useState(initialConfig);
  return (
    <PetWindow
      config={config}
      tucked={false}
      pet={olivePet}
      streamingText=""
      lastReply=""
      awaitingReply={false}
      transcript={[]}
      completedOutputCount={0}
      onSend={vi.fn()}
      onMute={vi.fn()}
      onTuck={vi.fn()}
      onWake={vi.fn()}
      onConfigChange={(nextConfig) => {
        onConfigChange(nextConfig);
        setConfig(nextConfig);
      }}
      onApproval={vi.fn()}
      onStartDrag={onStartDrag}
      updateState={updateState}
      onCheckForUpdate={onCheckForUpdate}
      onInstallUpdate={onInstallUpdate}
    />
  );
}

async function openSettings() {
  const user = userEvent.setup();
  render(<SettingsHarness />);
  await user.click(screen.getByRole("button", { name: "Pet settings" }));
  return { user, dialog: await screen.findByRole("dialog", { name: "Pet settings" }) };
}

describe("settings dialog end-to-end behavior", () => {
  it("scrolls internally without affecting the host page", async () => {
    const { dialog } = await openSettings();

    expect(within(dialog).getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Pet settings")).toHaveClass("settings-panel");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("closes cleanly when dismissed", async () => {
    const { user, dialog } = await openSettings();

    await user.click(within(dialog).getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("dialog", { name: "Pet settings" })).not.toBeInTheDocument();
  });

  it("starts window dragging from settings chrome without hijacking controls", async () => {
    const user = userEvent.setup();
    const onStartDrag = vi.fn();
    render(<SettingsHarness onStartDrag={onStartDrag} />);
    await user.click(screen.getByRole("button", { name: "Pet settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Pet settings" });

    fireEvent.mouseDown(within(dialog).getByRole("heading", { name: "Settings" }), { button: 0 });
    expect(onStartDrag).toHaveBeenCalledTimes(1);

    fireEvent.mouseDown(within(dialog).getByLabelText("Personality"), { button: 0 });
    expect(onStartDrag).toHaveBeenCalledTimes(1);
  });

  it("edits persona and workspace from the real dialog controls", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    runtimeBridgeMock.pickDirectory.mockResolvedValue("/new-workspace");

    render(<SettingsHarness onConfigChange={onConfigChange} />);
    await user.click(screen.getByRole("button", { name: "Pet settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Pet settings" });

    const persona = within(dialog).getByLabelText("Personality");
    await user.clear(persona);
    await user.type(persona, "new personality");
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ persona: "new personality" }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Choose folder" }));
    await waitFor(() =>
      expect(runtimeBridgeMock.pickDirectory).toHaveBeenCalledWith({ defaultPath: "/repo" }),
    );
    await waitFor(() =>
      expect(onConfigChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ workspaceCwd: "/new-workspace" }),
      ),
    );

    await user.click(within(dialog).getByRole("button", { name: "Use default" }));
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceCwd: undefined }),
    );
  });

  it("updates runtime settings through explicit radio groups and confirms power mode", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    render(<SettingsHarness onConfigChange={onConfigChange} />);
    await user.click(screen.getByRole("button", { name: "Pet settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Pet settings" });

    expect(within(dialog).getByLabelText("Ephemeral sessions (recommended)")).toHaveAttribute(
      "name",
      "session-persistence",
    );
    expect(within(dialog).getByLabelText("Safe mode (recommended)")).toHaveAttribute(
      "name",
      "runtime-safety-mode",
    );

    await user.click(within(dialog).getByLabelText("Save pet sessions in Codex history"));
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runtime: { sessionPersistence: "savedHistory", safetyMode: "safe" },
      }),
    );

    await user.click(
      within(dialog).getByLabelText(
        "Power mode: high-risk broad local access for trusted workspaces only",
      ),
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Power mode can run commands");
    expect(onConfigChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({ safetyMode: "power" }),
      }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Keep Safe mode" }));
    expect(within(dialog).queryByRole("alert")).toBeNull();

    await user.click(
      within(dialog).getByLabelText(
        "Power mode: high-risk broad local access for trusted workspaces only",
      ),
    );
    await user.click(within(dialog).getByRole("button", { name: "Enable Power mode" }));
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runtime: { sessionPersistence: "savedHistory", safetyMode: "power" },
      }),
    );
  });

  it("updates observer and ambient settings without clobbering sibling values", async () => {
    const user = userEvent.setup();
    const onConfigChange = vi.fn();
    render(<SettingsHarness onConfigChange={onConfigChange} />);
    await user.click(screen.getByRole("button", { name: "Pet settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Pet settings" });

    await user.click(within(dialog).getByLabelText("Active app name"));
    await user.click(within(dialog).getByLabelText("Window title (may reveal document names)"));
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        observers: { activeApp: false, windowTitle: false, workspace: true, idle: true },
      }),
    );

    await user.click(
      within(dialog).getByLabelText("Let the pet quietly check context every few minutes"),
    );
    await user.clear(within(dialog).getByLabelText("Check interval, minutes"));
    await user.type(within(dialog).getByLabelText("Check interval, minutes"), "7");
    await user.click(
      within(dialog).getByLabelText("Include an opt-in screenshot with ambient checks"),
    );
    await user.click(
      within(dialog).getByLabelText("Keep ambient screenshots on disk after checks"),
    );

    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ambient: {
          enabled: false,
          intervalMinutes: 10,
          includeScreenshot: true,
          retainScreenshots: true,
        },
      }),
    );
  });

  it("drives official update states from the settings dialog", async () => {
    const user = userEvent.setup();
    const onCheckForUpdate = vi.fn();
    const onInstallUpdate = vi.fn();
    render(
      <SettingsHarness
        updateState={{
          enabled: true,
          status: "available",
          currentVersion: "0.1.0",
          availableVersion: "0.2.0",
          notes: "Better pets",
          downloadedBytes: 0,
        }}
        onCheckForUpdate={onCheckForUpdate}
        onInstallUpdate={onInstallUpdate}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pet settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Pet settings" });

    expect(
      within(dialog).getByText("Official release channel · Current 0.1.0"),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Version 0.2.0 is available.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Install and relaunch" }));
    expect(onInstallUpdate).toHaveBeenCalledTimes(1);
    await user.click(within(dialog).getByRole("button", { name: "Check for updates" }));
    expect(onCheckForUpdate).toHaveBeenCalledTimes(1);
  });

  it("disables update actions while checking or downloading and exposes retry on errors", async () => {
    const user = userEvent.setup();
    const onCheckForUpdate = vi.fn();
    const { rerender } = render(
      <SettingsHarness
        updateState={{ enabled: true, status: "checking", downloadedBytes: 0 }}
        onCheckForUpdate={onCheckForUpdate}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Pet settings" }));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();

    rerender(
      <SettingsHarness
        updateState={{
          enabled: true,
          status: "downloading",
          downloadedBytes: 25,
          contentLength: 100,
        }}
        onCheckForUpdate={onCheckForUpdate}
      />,
    );
    expect(screen.getByText("Downloading update… 25%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();

    rerender(
      <SettingsHarness
        updateState={{
          enabled: true,
          status: "error",
          downloadedBytes: 0,
          error: "Network exploded",
        }}
        onCheckForUpdate={onCheckForUpdate}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onCheckForUpdate).toHaveBeenCalledTimes(1);
  });
});
