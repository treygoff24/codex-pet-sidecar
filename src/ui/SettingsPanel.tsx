import type { PetConfig } from "../domain/petConfig";

export function SettingsPanel({
  config,
  onChange,
}: {
  config: PetConfig;
  onChange: (config: PetConfig) => void;
}) {
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
    </section>
  );
}
