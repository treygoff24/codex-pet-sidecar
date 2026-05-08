export function OnboardingFlow({
  onUseOlive,
  onHatch,
  onImport,
  skillPrompt,
}: {
  onUseOlive: () => void;
  onHatch: () => void;
  onImport: () => void;
  skillPrompt?: string;
}) {
  return (
    <section className="onboarding-flow" aria-label="Welcome">
      <h1>Meet Olive</h1>
      <p>Olive is the bundled sample pet. Use her now, hatch your own later.</p>
      <p className="onboarding-flow__note">
        <small>Requires Codex CLI with an active ChatGPT subscription</small>
      </p>
      <button type="button" onClick={onUseOlive}>
        Use Olive now
      </button>
      <button type="button" onClick={onHatch}>
        Hatch my own pet with Codex
      </button>
      <button type="button" onClick={onImport}>
        Import existing Codex pet
      </button>
      {skillPrompt ? (
        <div className="onboarding-flow__prompt" role="status">
          <strong>Next step</strong>
          <p>{skillPrompt}</p>
        </div>
      ) : null}
    </section>
  );
}
