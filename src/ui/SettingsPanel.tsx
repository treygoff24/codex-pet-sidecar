import type { PetConfig } from "../domain/petConfig";

export function SettingsPanel({
  config,
  onChange,
}: {
  config: PetConfig;
  onChange: (config: PetConfig) => void;
}) {
  const updateAmbient = (ambient: Partial<PetConfig["ambient"]>) =>
    onChange({ ...config, ambient: { ...config.ambient, ...ambient } });
  const updateInterval = (value: number) =>
    updateAmbient({ intervalMinutes: Number.isFinite(value) ? Math.max(10, value) : 10 });

  return (
    <section className="settings-panel" aria-label="Pet settings">
      <label>
        Persona
        <textarea
          value={config.persona}
          onChange={(event) => onChange({ ...config, persona: event.currentTarget.value })}
        />
      </label>
      <label>
        Workspace folder
        <input
          value={config.workspaceCwd ?? ""}
          onChange={(event) => onChange({ ...config, workspaceCwd: event.currentTarget.value })}
        />
      </label>
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
