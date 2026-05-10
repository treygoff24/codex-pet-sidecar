import { useState } from "react";
import type { PetBrief } from "../../domain/hatching";

const normalizePetId = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
};

interface HatchingBriefProps {
  initialBrief?: PetBrief | null;
  onSubmit: (brief: PetBrief) => void;
  isLoading?: boolean;
}

interface ValidationErrors {
  displayName?: string;
  description?: string;
  personality?: string;
}

export function HatchingBrief({ initialBrief, onSubmit, isLoading = false }: HatchingBriefProps) {
  const [displayName, setDisplayName] = useState(initialBrief?.displayName || "");
  const [description, setDescription] = useState(initialBrief?.description || "");
  const [personality, setPersonality] = useState<string[]>(initialBrief?.personality || []);
  const [backstory, setBackstory] = useState(initialBrief?.backstory || "");
  const [speechStyle, setSpeechStyle] = useState(initialBrief?.speechStyle || "");
  const [behavioralQuirks, setBehavioralQuirks] = useState(initialBrief?.behavioralQuirks || "");
  const [visualNotes, setVisualNotes] = useState(initialBrief?.visualNotes || "");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const petId = normalizePetId(displayName);

  const validate = (): boolean => {
    const newErrors: ValidationErrors = {};

    if (!displayName.trim()) {
      newErrors.displayName = "Display name is required";
    } else if (displayName.length < 2) {
      newErrors.displayName = "Display name must be at least 2 characters";
    } else if (displayName.length > 50) {
      newErrors.displayName = "Display name must be less than 50 characters";
    }

    if (!description.trim()) {
      newErrors.description = "Description is required";
    } else if (description.length < 10) {
      newErrors.description = "Description must be at least 10 characters";
    } else if (description.length > 500) {
      newErrors.description = "Description must be less than 500 characters";
    }

    if (personality.length === 0) {
      newErrors.personality = "At least one personality trait is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (touched[field] || field === "displayName" || field === "description") {
      validate();
    }
  };

  const handleSubmit = () => {
    setTouched({
      displayName: true,
      description: true,
      personality: true,
    });

    if (validate()) {
      const brief: PetBrief = {
        displayName: displayName.trim(),
        petId,
        description: description.trim(),
        personality: personality.map((p) => p.trim()).filter(Boolean),
        palette: null, // Could be added in future
        backstory: backstory.trim() || null,
        speechStyle: speechStyle.trim() || null,
        behavioralQuirks: behavioralQuirks.trim() || null,
        visualNotes: visualNotes.trim() || null,
      };
      onSubmit(brief);
    }
  };

  const addPersonalityTrait = () => {
    setPersonality([...personality, ""]);
  };

  const updatePersonalityTrait = (index: number, value: string) => {
    const updated = [...personality];
    updated[index] = value;
    setPersonality(updated);
  };

  const removePersonalityTrait = (index: number) => {
    setPersonality(personality.filter((_, i) => i !== index));
  };

  const isValid =
    !errors.displayName &&
    !errors.description &&
    !errors.personality &&
    displayName.trim() &&
    description.trim() &&
    personality.length > 0;

  return (
    <div className="hatching-brief">
      <div className="hatching-brief__header">
        <h3 className="hatching-brief__title">Tell Us About Your Pet</h3>
        <p className="hatching-brief__description">
          Provide details about your pet's personality, appearance, and behavior.
        </p>
      </div>

      <div className="hatching-brief__form">
        {/* Display Name */}
        <div className="hatching-brief__field">
          <label htmlFor="displayName" className="hatching-brief__label">
            Display Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => handleBlur("displayName")}
            disabled={isLoading}
            className={`hatching-brief__input ${
              touched.displayName && errors.displayName ? "hatching-brief__input--error" : ""
            }`}
            placeholder="e.g., Luna, Max, Pepper"
            maxLength={50}
            aria-invalid={touched.displayName && !!errors.displayName}
            aria-describedby={errors.displayName ? "displayName-error" : undefined}
          />
          {touched.displayName && errors.displayName && (
            <div id="displayName-error" className="hatching-brief__error" role="alert">
              {errors.displayName}
            </div>
          )}
          <div className="hatching-brief__hint">
            Pet ID: <code>{petId || "..."}</code>
          </div>
        </div>

        {/* Description */}
        <div className="hatching-brief__field">
          <label htmlFor="description" className="hatching-brief__label">
            Description <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => handleBlur("description")}
            disabled={isLoading}
            className={`hatching-brief__textarea ${
              touched.description && errors.description ? "hatching-brief__textarea--error" : ""
            }`}
            placeholder="Describe your pet's personality, interests, and what makes them special..."
            rows={4}
            maxLength={500}
            aria-invalid={touched.description && !!errors.description}
            aria-describedby={errors.description ? "description-error" : undefined}
          />
          {touched.description && errors.description && (
            <div id="description-error" className="hatching-brief__error" role="alert">
              {errors.description}
            </div>
          )}
          <div className="hatching-brief__hint">{description.length} / 500 characters</div>
        </div>

        {/* Personality Traits */}
        <div className="hatching-brief__field">
          <label className="hatching-brief__label">
            Personality Traits <span aria-hidden="true">*</span>
          </label>
          <div className="hatching-brief__traits">
            {personality.map((trait, index) => (
              <div key={index} className="hatching-brief__trait-row">
                <input
                  type="text"
                  value={trait}
                  onChange={(e) => updatePersonalityTrait(index, e.target.value)}
                  disabled={isLoading}
                  className="hatching-brief__input hatching-brief__input--small"
                  placeholder="e.g., curious, playful, wise"
                  aria-label={`Personality trait ${index + 1}`}
                />
                {personality.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removePersonalityTrait(index)}
                    disabled={isLoading}
                    className="hatching-brief__button hatching-brief__button--icon"
                    aria-label={`Remove personality trait ${index + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addPersonalityTrait}
              disabled={isLoading || personality.length >= 10}
              className="hatching-brief__button hatching-brief__button--add"
            >
              + Add Trait
            </button>
          </div>
          {touched.personality && errors.personality && (
            <div className="hatching-brief__error" role="alert">
              {errors.personality}
            </div>
          )}
          <div className="hatching-brief__hint">{personality.length} / 10 traits</div>
        </div>

        {/* Backstory */}
        <div className="hatching-brief__field">
          <label htmlFor="backstory" className="hatching-brief__label">
            Backstory (Optional)
          </label>
          <textarea
            id="backstory"
            value={backstory}
            onChange={(e) => setBackstory(e.target.value)}
            disabled={isLoading}
            className="hatching-brief__textarea"
            placeholder="What's your pet's story? Where did they come from?"
            rows={3}
            maxLength={1000}
          />
          <div className="hatching-brief__hint">{backstory.length} / 1000 characters</div>
        </div>

        {/* Speech Style */}
        <div className="hatching-brief__field">
          <label htmlFor="speechStyle" className="hatching-brief__label">
            Speech Style (Optional)
          </label>
          <input
            id="speechStyle"
            type="text"
            value={speechStyle}
            onChange={(e) => setSpeechStyle(e.target.value)}
            disabled={isLoading}
            className="hatching-brief__input"
            placeholder="e.g., formal, casual, quirky"
            maxLength={100}
          />
          <div className="hatching-brief__hint">How your pet speaks and communicates</div>
        </div>

        {/* Behavioral Quirks */}
        <div className="hatching-brief__field">
          <label htmlFor="behavioralQuirks" className="hatching-brief__label">
            Behavioral Quirks (Optional)
          </label>
          <textarea
            id="behavioralQuirks"
            value={behavioralQuirks}
            onChange={(e) => setBehavioralQuirks(e.target.value)}
            disabled={isLoading}
            className="hatching-brief__textarea"
            placeholder="Any unique behaviors or habits?"
            rows={2}
            maxLength={500}
          />
          <div className="hatching-brief__hint">{behavioralQuirks.length} / 500 characters</div>
        </div>

        {/* Visual Notes */}
        <div className="hatching-brief__field">
          <label htmlFor="visualNotes" className="hatching-brief__label">
            Visual Notes (Optional)
          </label>
          <textarea
            id="visualNotes"
            value={visualNotes}
            onChange={(e) => setVisualNotes(e.target.value)}
            disabled={isLoading}
            className="hatching-brief__textarea"
            placeholder="Any specific visual characteristics or preferences?"
            rows={2}
            maxLength={500}
          />
          <div className="hatching-brief__hint">{visualNotes.length} / 500 characters</div>
        </div>
      </div>

      <div className="hatching-brief__actions">
        <button
          type="button"
          className="hatching-brief__button hatching-brief__button--primary"
          onClick={handleSubmit}
          disabled={!isValid || isLoading}
          aria-label="Continue to next step"
        >
          {isLoading ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
