import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { PaletteSpec, PetBrief, PetIdPreview, ReferenceImage } from "../../domain/hatching";
import { normalizeDisplayNameToPetId } from "../../domain/petIdNormalization";
import { fileNameFromPath, referenceDescriptionLabel } from "../../domain/referenceImage";
import { hatchingBridge } from "../../hatchingBridge";
import { HATCHING_ARCHETYPES, type Archetype } from "./archetypes";

const MAX_PERSONALITY_TRAITS = 10;
const FALLBACK_PERSONALITY_TRAITS = [
  "cozy",
  "curious",
  "sleepy",
  "mischievous",
  "earnest",
  "grumpy",
  "wise",
  "stoic",
  "playful",
  "quiet",
  "focused",
  "observant",
] as const;

interface HatchingBriefProps {
  initialBrief?: PetBrief | null;
  archetype?: Archetype | null;
  referenceImage?: ReferenceImage | null;
  onChooseReference?: () => void;
  onSubmit: (brief: PetBrief) => void;
  isLoading?: boolean;
}

function initialPalette(initialBrief?: PetBrief | null, archetype?: Archetype | null): PaletteSpec {
  return (
    initialBrief?.palette ??
    archetype?.palette ?? { primary: "#7B68EE", secondary: "#9B8BEE", accent: "#FFB6C1" }
  );
}

function normalizeTraits(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const traits: string[] = [];
  for (const value of values) {
    const trait = value.trim();
    const key = trait.toLowerCase();
    if (!trait || seen.has(key)) continue;
    seen.add(key);
    traits.push(trait);
  }
  return traits;
}

function suggestedTraits(archetype?: Archetype | null, selectedTraits: readonly string[] = []) {
  return normalizeTraits([
    ...selectedTraits,
    ...(archetype?.chips ?? []),
    ...HATCHING_ARCHETYPES.flatMap((candidate) => candidate.chips),
    ...FALLBACK_PERSONALITY_TRAITS,
  ]);
}

export function HatchingBrief({
  initialBrief,
  archetype = null,
  referenceImage = null,
  onChooseReference,
  onSubmit,
  isLoading = false,
}: HatchingBriefProps) {
  const [displayName, setDisplayName] = useState(initialBrief?.displayName ?? "");
  const [petId, setPetId] = useState(
    initialBrief?.petId ?? normalizeDisplayNameToPetId(initialBrief?.displayName ?? "") ?? "",
  );
  const [petIdEdited, setPetIdEdited] = useState(Boolean(initialBrief?.petId));
  const [description, setDescription] = useState(
    initialBrief?.description ?? archetype?.defaultBrief ?? "",
  );
  const [personality, setPersonality] = useState<string[]>(
    normalizeTraits(initialBrief?.personality ?? archetype?.chips ?? []),
  );
  const [customTrait, setCustomTrait] = useState("");
  const [palette, setPalette] = useState<PaletteSpec>(() =>
    initialPalette(initialBrief, archetype),
  );
  const [backstory, setBackstory] = useState(initialBrief?.backstory ?? "");
  const [speechStyle, setSpeechStyle] = useState(initialBrief?.speechStyle ?? "");
  const [behavioralQuirks, setBehavioralQuirks] = useState(initialBrief?.behavioralQuirks ?? "");
  const [visualNotes, setVisualNotes] = useState(initialBrief?.visualNotes ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<PetIdPreview | null>(null);
  const referenceFileName = referenceImage ? fileNameFromPath(referenceImage.path) : null;

  useEffect(() => {
    if (petIdEdited) return;
    setPetId(normalizeDisplayNameToPetId(displayName) ?? "");
  }, [displayName, petIdEdited]);

  useEffect(() => {
    if (!displayName.trim()) {
      setPreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      hatchingBridge
        .previewPetId(displayName)
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [displayName]);

  const traitSuggestions = useMemo(
    () => suggestedTraits(archetype, personality),
    [archetype, personality],
  );
  const personalityLimitReached = personality.length >= MAX_PERSONALITY_TRAITS;

  function validate(): boolean {
    const nextErrors: string[] = [];
    if (!displayName.trim()) nextErrors.push("Display name is required.");
    if (!petId.trim()) nextErrors.push("Pet ID is required and cannot be reserved.");
    if (!description.trim()) nextErrors.push("Description is required.");
    if (personality.length === 0) nextErrors.push("Add at least one personality trait.");
    if (preview && !preview.available && preview.petId === petId) {
      nextErrors.push(`Pet ID ${preview.petId} is already taken.`);
    }
    setErrors(nextErrors);
    return nextErrors.length === 0;
  }

  function isTraitSelected(trait: string) {
    return personality.some((selected) => selected.toLowerCase() === trait.toLowerCase());
  }

  // `personality` is kept normalized at construction (initial state runs through
  // `normalizeTraits`) and every input added below is pre-trimmed and case-checked,
  // so the setters can trust the existing array without re-normalizing.
  function toggleTrait(trait: string) {
    setPersonality((traits) => {
      const traitKey = trait.toLowerCase();
      if (traits.some((selected) => selected.toLowerCase() === traitKey)) {
        return traits.filter((selected) => selected.toLowerCase() !== traitKey);
      }
      if (traits.length >= MAX_PERSONALITY_TRAITS) return traits;
      return [...traits, trait];
    });
  }

  function addCustomTrait() {
    const trait = customTrait.trim();
    if (!trait) return;
    setPersonality((traits) => {
      if (traits.some((selected) => selected.toLowerCase() === trait.toLowerCase())) {
        return traits;
      }
      if (traits.length >= MAX_PERSONALITY_TRAITS) return traits;
      return [...traits, trait];
    });
    setCustomTrait("");
  }

  function handleCustomTraitKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addCustomTrait();
  }

  function submit() {
    if (!validate()) return;
    onSubmit({
      displayName: displayName.trim(),
      petId: petId.trim(),
      description: description.trim(),
      personality: personality,
      palette,
      backstory: backstory.trim() || null,
      speechStyle: speechStyle.trim() || null,
      behavioralQuirks: behavioralQuirks.trim() || null,
      visualNotes: visualNotes.trim() || null,
    });
  }

  return (
    <div className="hatching-brief">
      <div className="hatching-brief__header">
        <h1 className="hatching-brief__title">
          Tell us about <em>your pet.</em>
        </h1>
        <p className="hatching-brief__description">
          Description is the prose Codex should draw from. Personality is just a few quick vibe tags
          that steer the pet's tone.
        </p>
      </div>

      {errors.length ? (
        <ul className="hatching-brief__error" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}

      <label className="hatching-brief__label" htmlFor="displayName">
        Display name
      </label>
      <input
        id="displayName"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        disabled={isLoading}
        placeholder="e.g. Moss"
      />

      <details className="hatching-brief__pet-id">
        <summary>Pet ID: {petId || "needs a valid name"}</summary>
        <label className="hatching-brief__label" htmlFor="petId">
          Package ID
        </label>
        <input
          id="petId"
          value={petId}
          onChange={(event) => {
            setPetIdEdited(true);
            setPetId(normalizeDisplayNameToPetId(event.target.value) ?? event.target.value);
          }}
          disabled={isLoading}
        />
        {preview && !preview.available ? (
          <p className="hatching-brief__hint">
            {preview.petId} is taken. Try {preview.suggestion ?? "another name"}.
          </p>
        ) : null}
      </details>

      <div className="hatching-brief__field">
        <div className="hatching-brief__label-row">
          <label className="hatching-brief__label" htmlFor="description">
            Description
          </label>
          <span>what should Codex draw?</span>
        </div>
        <p id="descriptionHelp" className="hatching-brief__field-help">
          Write the actual pet brief here: body shape, visual details, movement, mood, or any
          must-have behavior. One sentence is enough; paragraphs are fine.
        </p>
        <textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={isLoading}
          rows={4}
          aria-describedby="descriptionHelp"
          placeholder="A small round desk creature with tiny legs, a sleepy eye, and a gentle wobble."
        />
      </div>

      {onChooseReference || referenceImage ? (
        <button
          type="button"
          className={
            "hatching-reference-pill " + (referenceImage ? "hatching-reference-pill--attached" : "")
          }
          onClick={onChooseReference}
          disabled={isLoading || !onChooseReference}
          aria-label={
            referenceImage ? "Replace visual reference image" : "Upload visual reference image"
          }
        >
          <span className="hatching-reference-pill__art" aria-hidden="true" />
          <span className="hatching-reference-pill__copy">
            <strong>
              {referenceImage ? "Visual reference attached" : "Optional visual reference"}
            </strong>
            <span>
              {referenceFileName && referenceImage
                ? `${referenceFileName} · ${referenceDescriptionLabel(referenceImage)}`
                : "Upload a real photo or sketch if you want Codex to base the pet's look on it."}
            </span>
          </span>
          <span className="hatching-reference-pill__action">
            {referenceImage ? "Replace" : "Browse"}
          </span>
        </button>
      ) : null}

      <fieldset className="hatching-brief__traits">
        <legend className="hatching-brief__legend-row">
          <span>Personality</span>
          <span aria-live="polite">
            {personality.length} / {MAX_PERSONALITY_TRAITS} selected
          </span>
        </legend>
        <p id="personalityHelp" className="hatching-brief__field-help">
          Pick up to ten tags. These are prompt shorthand, not another description field. Click a
          chip to toggle it, or type your own and press Enter.
        </p>
        <div
          className="hatching-brief__chips"
          role="group"
          aria-describedby="personalityHelp"
          aria-label="Personality traits"
        >
          {traitSuggestions.map((trait) => {
            const selected = isTraitSelected(trait);
            return (
              <button
                key={trait}
                type="button"
                className={
                  "hatching-brief__chip " + (selected ? "hatching-brief__chip--selected" : "")
                }
                onClick={() => toggleTrait(trait)}
                disabled={isLoading || (!selected && personalityLimitReached)}
                aria-pressed={selected}
              >
                {selected ? "✓ " : ""}
                {trait}
              </button>
            );
          })}
        </div>
        <div className="hatching-brief__trait-add">
          <input
            id="customTrait"
            value={customTrait}
            onChange={(event) => setCustomTrait(event.target.value)}
            onKeyDown={handleCustomTraitKeyDown}
            disabled={isLoading || personalityLimitReached}
            aria-label="Add a custom personality trait"
            aria-describedby="personalityHelp customTraitHint"
            placeholder={
              personalityLimitReached ? "Remove a chip to add another" : "Add your own trait..."
            }
          />
          <button
            type="button"
            onClick={addCustomTrait}
            disabled={isLoading || personalityLimitReached || !customTrait.trim()}
          >
            Add
          </button>
        </div>
        <p id="customTraitHint" className="hatching-brief__hint">
          One short word or phrase works best. Press Enter after typing to add it as a chip.
        </p>
      </fieldset>

      <fieldset className="hatching-brief__palette">
        <legend>Palette</legend>
        {(["primary", "secondary", "accent"] as const).map((key) => (
          <label key={key}>
            {key}
            <input
              type="color"
              value={palette[key]}
              onChange={(event) =>
                setPalette((current) => ({ ...current, [key]: event.target.value }))
              }
              disabled={isLoading}
            />
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        onClick={() => setAdvancedOpen((open) => !open)}
        aria-expanded={advancedOpen}
      >
        Go deeper
      </button>

      {advancedOpen ? (
        <div className="hatching-brief__advanced">
          <label htmlFor="backstory">Backstory</label>
          <textarea
            id="backstory"
            value={backstory}
            onChange={(event) => setBackstory(event.target.value)}
          />
          <label htmlFor="speechStyle">Speech style</label>
          <input
            id="speechStyle"
            value={speechStyle}
            onChange={(event) => setSpeechStyle(event.target.value)}
          />
          <label htmlFor="behavioralQuirks">Behavioral quirks</label>
          <textarea
            id="behavioralQuirks"
            value={behavioralQuirks}
            onChange={(event) => setBehavioralQuirks(event.target.value)}
          />
          <label htmlFor="visualNotes">Visual notes</label>
          <textarea
            id="visualNotes"
            value={visualNotes}
            onChange={(event) => setVisualNotes(event.target.value)}
          />
        </div>
      ) : null}

      <button type="button" onClick={submit} disabled={isLoading}>
        Looks good →
      </button>
    </div>
  );
}
