import { useState } from "react";
import type { PetConfig } from "../domain/petConfig";

export function SettingsPanel({
  config,
  onChange,
  onImprovePersonality,
  onResetPersonality,
}: {
  config: PetConfig;
  onChange: (config: PetConfig) => void;
  onImprovePersonality?: () => void;
  onResetPersonality?: () => void;
}) {
  const [powerArmed, setPowerArmed] = useState(false);
  const updateAmbient = (ambient: Partial<PetConfig["ambient"]>) =>
    onChange({ ...config, ambient: { ...config.ambient, ...ambient } });
  const updateObservers = (observers: Partial<PetConfig["observers"]>) =>
    onChange({ ...config, observers: { ...config.observers, ...observers } });
  const updateRuntime = (runtime: Partial<PetConfig["runtime"]>) =>
    onChange({ ...config, runtime: { ...config.runtime, ...runtime } });
  const updateInterval = (value: number) =>
    updateAmbient({ intervalMinutes: Number.isFinite(value) ? Math.max(10, value) : 10 });

  return (
    <section className="settings-panel" aria-label="Pet settings">
      <label>
        Personality
        <textarea
          value={config.persona}
          onChange={(event) => onChange({ ...config, persona: event.currentTarget.value })}
        />
      </label>
      <div className="settings-actions">
        <button type="button" onClick={onImprovePersonality}>
          Improve with Codex
        </button>
        {config.petId === "olive" && onResetPersonality ? (
          <button type="button" onClick={onResetPersonality}>
            Reset to bundled Olive
          </button>
        ) : null}
      </div>
      <label>
        Workspace folder
        <input
          value={config.workspaceCwd ?? ""}
          placeholder="Optional; defaults to an app-owned scratch workspace"
          onChange={(event) =>
            onChange({ ...config, workspaceCwd: event.currentTarget.value || undefined })
          }
        />
      </label>
      <fieldset>
        <legend>Runtime safety</legend>
        <label>
          <input
            type="radio"
            checked={config.runtime.sessionPersistence === "ephemeral"}
            onChange={() => updateRuntime({ sessionPersistence: "ephemeral" })}
          />
          Ephemeral sessions (recommended)
        </label>
        <label>
          <input
            type="radio"
            checked={config.runtime.sessionPersistence === "savedHistory"}
            onChange={() => updateRuntime({ sessionPersistence: "savedHistory" })}
          />
          Save pet sessions in Codex history
        </label>
        <label>
          <input
            type="radio"
            checked={config.runtime.safetyMode === "safe"}
            onChange={() => updateRuntime({ safetyMode: "safe" })}
          />
          Safe mode (recommended)
        </label>
        <label>
          <input
            type="radio"
            checked={config.runtime.safetyMode === "power"}
            onChange={() => setPowerArmed(true)}
          />
          Power mode: high-risk broad local access for trusted workspaces only
        </label>
        {powerArmed && config.runtime.safetyMode !== "power" ? (
          <div className="power-confirmation" role="alert">
            <p>
              Power mode can run commands and file changes without asking, with broad local
              filesystem access.
            </p>
            <button type="button" onClick={() => updateRuntime({ safetyMode: "power" })}>
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
            value={config.ambient.intervalMinutes}
            onChange={(event) => updateInterval(event.currentTarget.valueAsNumber)}
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
