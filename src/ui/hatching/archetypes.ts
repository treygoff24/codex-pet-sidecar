import type { PaletteSpec } from "../../domain/hatching";
import cozySleeperThumbnail from "./archetypes/cozy-sleeper.png";
import grumpySageThumbnail from "./archetypes/grumpy-sage.png";
import eagerHelperThumbnail from "./archetypes/eager-helper.png";
import aloofCriticThumbnail from "./archetypes/aloof-critic.png";
import mischievousImpThumbnail from "./archetypes/mischievous-imp.png";
import stoicWatcherThumbnail from "./archetypes/stoic-watcher.png";

export interface Archetype {
  id: string;
  name: string;
  descriptor: string;
  chips: string[];
  palette: PaletteSpec;
  defaultBrief: string;
  thumbnail: string;
}

// Thumbnails are placeholder PNGs per D1 — replace with final sprites before v1 ship.
export const HATCHING_ARCHETYPES: readonly Archetype[] = [
  {
    id: "cozy-sleeper",
    name: "The Cozy Sleeper",
    descriptor: "warm · soft · half-asleep",
    chips: ["warm", "soft", "half-asleep"],
    palette: { primary: "#b18060", secondary: "#f0d0aa", accent: "#8f5f43" },
    defaultBrief: "A warm, soft desktop companion who moves slowly and seems half-asleep.",
    thumbnail: cozySleeperThumbnail,
  },
  {
    id: "grumpy-sage",
    name: "The Grumpy Sage",
    descriptor: "wise · sarcastic · cranky",
    chips: ["wise", "sarcastic", "cranky"],
    palette: { primary: "#69745d", secondary: "#c1c8a8", accent: "#4e5649" },
    defaultBrief: "A tiny cranky mentor with wise eyes and dry, reluctantly helpful energy.",
    thumbnail: grumpySageThumbnail,
  },
  {
    id: "eager-helper",
    name: "The Eager Helper",
    descriptor: "bouncy · earnest · excited",
    chips: ["bouncy", "earnest", "excited"],
    palette: { primary: "#5091dc", secondary: "#a9d8ff", accent: "#ffd166" },
    defaultBrief: "A bouncy, earnest helper who looks ready to sprint toward the next task.",
    thumbnail: eagerHelperThumbnail,
  },
  {
    id: "aloof-critic",
    name: "The Aloof Critic",
    descriptor: "cool · dry · judgmental",
    chips: ["cool", "dry", "judgmental"],
    palette: { primary: "#626c7e", secondary: "#b5bdc9", accent: "#303642" },
    defaultBrief: "A cool, dry little critic with a poised silhouette and unimpressed expression.",
    thumbnail: aloofCriticThumbnail,
  },
  {
    id: "mischievous-imp",
    name: "The Mischievous Imp",
    descriptor: "chaotic · playful · rude",
    chips: ["chaotic", "playful", "rude"],
    palette: { primary: "#c04c6a", secondary: "#ff9b7d", accent: "#5b2340" },
    defaultBrief: "A chaotic playful imp with sharp little gestures and troublemaker charm.",
    thumbnail: mischievousImpThumbnail,
  },
  {
    id: "stoic-watcher",
    name: "The Stoic Watcher",
    descriptor: "quiet · focused · observant",
    chips: ["quiet", "focused", "observant"],
    palette: { primary: "#4b695c", secondary: "#9fb7a8", accent: "#d9c87e" },
    defaultBrief: "A quiet, focused watcher with a grounded stance and alert, observant eyes.",
    thumbnail: stoicWatcherThumbnail,
  },
];
