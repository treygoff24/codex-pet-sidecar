/**
 * HatchingInspiration - Step 2 of the hatching wizard.
 *
 * Provides inspiration through archetype gallery and creative prompts.
 * Follows accessibility and UI/UX best practices from the design system.
 */

import { useState } from "react";

interface Archetype {
  id: string;
  name: string;
  description: string;
  personality: string[];
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

interface HatchingInspirationProps {
  onSkip: () => void;
  onSelectArchetype: (archetypeId: string) => void;
  isLoading?: boolean;
}

// Sample archetypes - in production these would come from the backend
const SAMPLE_ARCHETYPES: Archetype[] = [
  {
    id: "curious-explorer",
    name: "Curious Explorer",
    description: "Always learning, asking questions, and discovering new things.",
    personality: ["curious", "inquisitive", "adventurous"],
    colorScheme: {
      primary: "#4A90D9",
      secondary: "#7FB3E8",
      accent: "#F5A623",
    },
  },
  {
    id: "gentle-companion",
    name: "Gentle Companion",
    description: "Warm, supportive, and always there when you need comfort.",
    personality: ["gentle", "supportive", "empathetic"],
    colorScheme: {
      primary: "#7B68EE",
      secondary: "#9B8BEE",
      accent: "#FFB6C1",
    },
  },
  {
    id: "playful-trickster",
    name: "Playful Trickster",
    description: "Mischievous, fun-loving, and full of surprises.",
    personality: ["playful", "mischievous", "energetic"],
    colorScheme: {
      primary: "#FF6B6B",
      secondary: "#FF8E8E",
      accent: "#FFE66D",
    },
  },
  {
    id: "wise-mentor",
    name: "Wise Mentor",
    description: "Knowledgeable, patient, and full of sage advice.",
    personality: ["wise", "patient", "thoughtful"],
    colorScheme: {
      primary: "#50C878",
      secondary: "#7ED8A0",
      accent: "#DDA0DD",
    },
  },
  {
    id: "creative-muse",
    name: "Creative Muse",
    description: "Inspiring, imaginative, and full of artistic ideas.",
    personality: ["creative", "imaginative", "inspiring"],
    colorScheme: {
      primary: "#9B59B6",
      secondary: "#B98BC7",
      accent: "#F39C12",
    },
  },
];

export function HatchingInspiration({
  onSkip,
  onSelectArchetype,
  isLoading = false,
}: HatchingInspirationProps) {
  const [selectedArchetype, setSelectedArchetype] = useState<Archetype | null>(null);
  const [filter, setFilter] = useState<"all" | "friendly" | "energetic" | "calm">("all");

  const filteredArchetypes =
    filter === "all"
      ? SAMPLE_ARCHETYPES
      : SAMPLE_ARCHETYPES.filter((archetype) => {
          if (filter === "friendly") {
            return archetype.personality.includes("gentle") ||
                   archetype.personality.includes("supportive");
          }
          if (filter === "energetic") {
            return archetype.personality.includes("playful") ||
                   archetype.personality.includes("energetic");
          }
          if (filter === "calm") {
            return archetype.personality.includes("wise") ||
                   archetype.personality.includes("patient");
          }
          return true;
        });

  const handleSelectArchetype = (archetype: Archetype) => {
    setSelectedArchetype(archetype);
  };

  const handleConfirm = () => {
    if (selectedArchetype) {
      onSelectArchetype(selectedArchetype.id);
    }
  };

  return (
    <div className="hatching-inspiration">
      <div className="hatching-inspiration__header">
        <h3 className="hatching-inspiration__title">Choose Your Inspiration</h3>
        <p className="hatching-inspiration__description">
          Browse archetypes to get started, or skip to create from scratch.
        </p>
      </div>

      {/* Filter Tabs */}
      <div
        className="hatching-inspiration__filters"
        role="tablist"
        aria-label="Filter archetypes by personality"
      >
        <button
          type="button"
          className={`hatching-inspiration__filter ${
            filter === "all" ? "hatching-inspiration__filter--active" : ""
          }`}
          onClick={() => setFilter("all")}
          disabled={isLoading}
          role="tab"
          aria-selected={filter === "all"}
          aria-controls="archetype-grid"
        >
          All
        </button>
        <button
          type="button"
          className={`hatching-inspiration__filter ${
            filter === "friendly" ? "hatching-inspiration__filter--active" : ""
          }`}
          onClick={() => setFilter("friendly")}
          disabled={isLoading}
          role="tab"
          aria-selected={filter === "friendly"}
          aria-controls="archetype-grid"
        >
          Friendly
        </button>
        <button
          type="button"
          className={`hatching-inspiration__filter ${
            filter === "energetic" ? "hatching-inspiration__filter--active" : ""
          }`}
          onClick={() => setFilter("energetic")}
          disabled={isLoading}
          role="tab"
          aria-selected={filter === "energetic"}
          aria-controls="archetype-grid"
        >
          Energetic
        </button>
        <button
          type="button"
          className={`hatching-inspiration__filter ${
            filter === "calm" ? "hatching-inspiration__filter--active" : ""
          }`}
          onClick={() => setFilter("calm")}
          disabled={isLoading}
          role="tab"
          aria-selected={filter === "calm"}
          aria-controls="archetype-grid"
        >
          Calm
        </button>
      </div>

      {/* Archetype Grid */}
      <div
        id="archetype-grid"
        className="hatching-inspiration__grid"
        role="tabpanel"
        aria-label={`Archetypes: ${filter} personalities`}
      >
        {filteredArchetypes.map((archetype) => (
          <button
            key={archetype.id}
            type="button"
            className={`hatching-inspiration__card ${
              selectedArchetype?.id === archetype.id
                ? "hatching-inspiration__card--selected"
                : ""
            }`}
            onClick={() => handleSelectArchetype(archetype)}
            disabled={isLoading}
            aria-pressed={selectedArchetype?.id === archetype.id}
            style={{
              "--archetype-primary": archetype.colorScheme.primary,
              "--archetype-secondary": archetype.colorScheme.secondary,
            } as React.CSSProperties}
          >
            <div
              className="hatching-inspiration__card-preview"
              style={{
                background: `linear-gradient(135deg, ${archetype.colorScheme.primary} 0%, ${archetype.colorScheme.secondary} 100%)`,
              }}
            >
              <div className="hatching-inspiration__card-icon">
                {archetype.name.charAt(0)}
              </div>
            </div>
            <div className="hatching-inspiration__card-content">
              <div className="hatching-inspiration__card-name">
                {archetype.name}
              </div>
              <div className="hatching-inspiration__card-description">
                {archetype.description}
              </div>
              <div className="hatching-inspiration__card-tags">
                {archetype.personality.map((trait) => (
                  <span
                    key={trait}
                    className="hatching-inspiration__card-tag"
                  >
                    {trait}
                  </span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="hatching-inspiration__actions">
        <button
          type="button"
          className="hatching-inspiration__button hatching-inspiration__button--secondary"
          onClick={onSkip}
          disabled={isLoading}
          aria-label="Skip archetype selection"
        >
          Skip & Create from Scratch
        </button>
        <button
          type="button"
          className="hatching-inspiration__button hatching-inspiration__button--primary"
          onClick={handleConfirm}
          disabled={!selectedArchetype || isLoading}
          aria-label={
            selectedArchetype
              ? `Use ${selectedArchetype.name} archetype`
              : "Select an archetype to continue"
          }
        >
          {isLoading ? "Loading..." : "Continue with Archetype"}
        </button>
      </div>
    </div>
  );
}