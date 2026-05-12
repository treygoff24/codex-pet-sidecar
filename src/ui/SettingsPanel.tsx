import { useEffect, useRef, useState } from "react";
import type { PetLibrary } from "../domain/petLibrary";
import { RUNTIME_SAFETY_MODE, SESSION_PERSISTENCE, type PetConfig } from "../domain/petConfig";
import type { InstalledPet } from "../domain/petConfig";
import type { OfficialUpdateState } from "../hooks/useOfficialUpdater";
import { runtimeBridge } from "../runtimeBridge";
import { PetLibraryPanel } from "./PetLibraryPanel";

type PickDirectory = typeof runtimeBridge.pickDirectory;

export function SettingsPanel({
  config,
  onChange,
  onResetPersonality,
  pickDirectory = runtimeBridge.pickDirectory,
  updateState,
  onCheckForUpdate,
  onInstallUpdate,
  library,
  pets,
  onSwitchPet,
  onHatchPet,
  onImportPet,
  onArchivePet,
}: {
  config: PetConfig;
  onChange: (config: PetConfig) => void;
  onResetPersonality?: () => void;
  /** Injectable for tests; defaults to the real Tauri dialog primitive. */
  pickDirectory?: PickDirectory;
  updateState?: OfficialUpdateState;
  onCheckForUpdate?: () => void;
  onInstallUpdate?: () => void;
  library?: PetLibrary;
  pets?: InstalledPet[];
  onSwitchPet?: (petId: string) => void;
  onHatchPet?: () => void;
  onImportPet?: () => void;
  onArchivePet?: (petId: string) => Promise<void> | void;
}) {
  const [powerArmed, setPowerArmed] = useState(false);
  const [intervalDraft, setIntervalDraft] = useState(String(config.ambient.intervalMinutes));
  const intervalFocusedRef = useRef(false);

  useEffect(() => {
    if (!intervalFocusedRef.current) {
      setIntervalDraft(String(config.ambient.intervalMinutes));
    }
  }, [config.ambient.intervalMinutes]);

  const updateAmbient = (ambient: Partial<PetConfig["ambient"]>) =>
    onChange({ ...config, ambient: { ...config.ambient, ...ambient } });
  const updateObservers = (observers: Partial<PetConfig["observers"]>) =>
    onChange({ ...config, observers: { ...config.observers, ...observers } });
  const updateRuntime = (runtime: Partial<PetConfig["runtime"]>) =>
    onChange({ ...config, runtime: { ...config.runtime, ...runtime } });
  const updateInterval = (value: string) => {
    setIntervalDraft(value);
    const parsed = Number(value);
    updateAmbient({
      intervalMinutes: Number.isFinite(parsed) ? Math.max(10, Math.floor(parsed)) : 10,
    });
  };
  const commitIntervalDraft = () => {
    intervalFocusedRef.current = false;
    const parsed = Number(intervalDraft);
    setIntervalDraft(String(Number.isFinite(parsed) ? Math.max(10, Math.floor(parsed)) : 10));
  };
  const canResetBundledOlive = config.petId === "olive" && Boolean(onResetPersonality);

  return (
    <section className="settings-panel" aria-label="Pet settings">
      {library && pets && onSwitchPet && onHatchPet && onImportPet ? (
        <PetLibraryPanel
          library={library}
          pets={pets}
          onSwitch={onSwitchPet}
          onHatch={onHatchPet}
          onImport={onImportPet}
          onArchive={onArchivePet}
        />
      ) : null}
      <label>
        Personality
        <textarea
          value={config.persona}
          onChange={(event) => onChange({ ...config, persona: event.currentTarget.value })}
        />
      </label>
      {canResetBundledOlive ? (
        <div className="settings-actions">
          <button type="button" onClick={onResetPersonality}>
            Reset to bundled Olive
          </button>
        </div>
      ) : null}
      {updateState ? (
        <SoftwareUpdatePanel
          updateState={updateState}
          onCheckForUpdate={onCheckForUpdate}
          onInstallUpdate={onInstallUpdate}
        />
      ) : null}
      <div className="workspace-picker">
        <span className="workspace-picker__label">Workspace folder</span>
        <p className="workspace-picker__value">
          {config.workspaceCwd ?? "Default — an app-owned scratch workspace"}
        </p>
        <div className="workspace-picker__actions">
          <button
            type="button"
            onClick={async () => {
              const picked = await pickDirectory({ defaultPath: config.workspaceCwd });
              if (picked) onChange({ ...config, workspaceCwd: picked });
            }}
          >
            Choose folder
          </button>
          {config.workspaceCwd ? (
            <button type="button" onClick={() => onChange({ ...config, workspaceCwd: undefined })}>
              Use default
            </button>
          ) : null}
        </div>
      </div>
      <fieldset>
        <legend>Runtime safety</legend>
        <label>
          <input
            type="radio"
            name="session-persistence"
            checked={config.runtime.sessionPersistence === SESSION_PERSISTENCE.ephemeral}
            onChange={() => updateRuntime({ sessionPersistence: SESSION_PERSISTENCE.ephemeral })}
          />
          Ephemeral sessions (recommended)
        </label>
        <label>
          <input
            type="radio"
            name="session-persistence"
            checked={config.runtime.sessionPersistence === SESSION_PERSISTENCE.savedHistory}
            onChange={() => updateRuntime({ sessionPersistence: SESSION_PERSISTENCE.savedHistory })}
          />
          Save pet sessions in Codex history
        </label>
        <label>
          <input
            type="radio"
            name="runtime-safety-mode"
            checked={config.runtime.safetyMode === RUNTIME_SAFETY_MODE.safe}
            onChange={() => {
              setPowerArmed(false);
              updateRuntime({ safetyMode: RUNTIME_SAFETY_MODE.safe });
            }}
          />
          Safe mode (recommended)
        </label>
        <label>
          <input
            type="radio"
            name="runtime-safety-mode"
            checked={config.runtime.safetyMode === RUNTIME_SAFETY_MODE.power}
            onChange={() => setPowerArmed(true)}
          />
          Power mode: high-risk broad local access for trusted workspaces only
        </label>
        {powerArmed && config.runtime.safetyMode !== RUNTIME_SAFETY_MODE.power ? (
          <div className="power-confirmation" role="alert">
            <p>
              Power mode can run commands and file changes without asking, with broad local
              filesystem access.
            </p>
            <button
              type="button"
              onClick={() => {
                setPowerArmed(false);
                updateRuntime({ safetyMode: RUNTIME_SAFETY_MODE.power });
              }}
            >
              Enable Power mode
            </button>
            <button type="button" onClick={() => setPowerArmed(false)}>
              Keep Safe mode
            </button>
          </div>
        ) : null}
      </fieldset>
      <fieldset>
        <legend>Local observers</legend>
        <label>
          <input
            type="checkbox"
            checked={config.observers.activeApp}
            onChange={(event) => updateObservers({ activeApp: event.currentTarget.checked })}
          />
          Active app name
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.observers.windowTitle}
            onChange={(event) => updateObservers({ windowTitle: event.currentTarget.checked })}
          />
          Window title (may reveal document names)
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.observers.workspace}
            onChange={(event) => updateObservers({ workspace: event.currentTarget.checked })}
          />
          Workspace and git status
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.observers.idle}
            onChange={(event) => updateObservers({ idle: event.currentTarget.checked })}
          />
          Idle state
        </label>
      </fieldset>
      <fieldset>
        <legend>Ambient awareness</legend>
        <label>
          <input
            type="checkbox"
            checked={config.ambient.enabled}
            onChange={(event) => updateAmbient({ enabled: event.currentTarget.checked })}
          />
          Let the pet quietly check context every few minutes
        </label>
        <label>
          Check interval, minutes
          <input
            type="number"
            min={10}
            step={1}
            value={intervalDraft}
            onFocus={() => {
              intervalFocusedRef.current = true;
            }}
            onBlur={commitIntervalDraft}
            onChange={(event) => updateInterval(event.currentTarget.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={config.ambient.includeScreenshot}
            onChange={(event) => updateAmbient({ includeScreenshot: event.currentTarget.checked })}
          />
          Include an opt-in screenshot with ambient checks
        </label>
        <p>
          Screenshots may include sensitive screen contents and require macOS Screen Recording
          permission. If permission is denied, the pet falls back to text-only context.
        </p>
        <label>
          <input
            type="checkbox"
            checked={config.ambient.retainScreenshots}
            onChange={(event) => updateAmbient({ retainScreenshots: event.currentTarget.checked })}
          />
          Keep ambient screenshots on disk after checks
        </label>
      </fieldset>
    </section>
  );
}

function SoftwareUpdatePanel({
  updateState,
  onCheckForUpdate,
  onInstallUpdate,
}: {
  updateState: OfficialUpdateState;
  onCheckForUpdate?: () => void;
  onInstallUpdate?: () => void;
}) {
  const percent =
    updateState.contentLength && updateState.contentLength > 0
      ? Math.min(100, Math.round((updateState.downloadedBytes / updateState.contentLength) * 100))
      : undefined;
  const busy = updateState.status === "checking" || updateState.status === "downloading";
  return (
    <fieldset className="software-update">
      <legend>Software update</legend>
      {updateState.enabled ? (
        <>
          <p>
            Official release channel
            {updateState.currentVersion ? ` · Current ${updateState.currentVersion}` : ""}
          </p>
          {updateState.status === "available" ? (
            <div className="software-update__available" role="status">
              <strong>Version {updateState.availableVersion} is available.</strong>
              {updateState.notes ? <p>{updateState.notes}</p> : null}
              <button type="button" onClick={onInstallUpdate} disabled={busy}>
                Install and relaunch
              </button>
            </div>
          ) : null}
          {updateState.status === "up-to-date" ? <p>You're up to date.</p> : null}
          {updateState.status === "downloading" ? (
            <p role="status">Downloading update{percent == null ? "…" : `… ${percent}%`}</p>
          ) : null}
          {updateState.status === "relaunching" ? <p role="status">Relaunching…</p> : null}
          {updateState.status === "error" ? (
            <div className="software-update__error" role="alert">
              <p>{updateState.error}</p>
              <button type="button" onClick={onCheckForUpdate} disabled={busy}>
                Try again
              </button>
            </div>
          ) : null}
          <button type="button" onClick={onCheckForUpdate} disabled={busy}>
            {updateState.status === "checking" ? "Checking…" : "Check for updates"}
          </button>
        </>
      ) : (
        <p>Dev channel: update with git pull && npm ci && npm run install:dev.</p>
      )}
    </fieldset>
  );
}
