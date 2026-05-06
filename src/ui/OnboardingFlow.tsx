export function OnboardingFlow({
  onUseOlive,
  onHatch,
  onImport,
}: {
  onUseOlive: () => void;
  onHatch: () => void;
  onImport: () => void;
}) {
  return (
    <section className="onboarding-flow" aria-label="Welcome">
      <h1>Meet Olive</h1>
      <p>Olive is the bundled sample pet. Use her now, hatch your own later.</p>
      <button type="button" onClick={onUseOlive}>
        Use Olive now
      </button>
      <button type="button" onClick={onHatch}>
        Hatch my own pet with Codex
      </button>
      <button type="button" onClick={onImport}>
        Import existing Codex pet
      </button>
    </section>
  );
}
