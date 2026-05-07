#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const LOCAL_ANIMATION_FILE = path.join(REPO_ROOT, "src/domain/petAnimation.ts");
const LOCAL_STYLES_FILE = path.join(REPO_ROOT, "src/styles.css");

function fail(message) {
  console.error(`codex animation parity failed: ${message}`);
  process.exit(1);
}

function usage() {
  console.error(`Usage:
  node scripts/verify-codex-animation-parity.mjs
  node scripts/verify-codex-animation-parity.mjs /path/to/codex-avatar-*.js
  node scripts/verify-codex-animation-parity.mjs /path/to/extracted-codex-assets-dir

Extract Codex.app first, for instance:
  npx --yes @electron/asar extract /Applications/Codex.app/Contents/Resources/app.asar /tmp/codex-asar-pet
  node scripts/verify-codex-animation-parity.mjs
`);
  process.exit(2);
}

function defaultReferencePath() {
  const defaultExtractedPath = "/tmp/codex-asar-pet";
  if (existsSync(defaultExtractedPath)) return defaultExtractedPath;
  usage();
}

function referencePathsFromArg(arg) {
  if (!arg) return referencePathsFromArg(defaultReferencePath());
  const resolved = path.resolve(arg);
  if (!existsSync(resolved)) fail(`reference path not found: ${resolved}`);
  if (resolved.endsWith(".js")) {
    return {
      js: resolved,
      css: findSingleFile(path.dirname(resolved), /^codex-avatar-.*\.css$/, false),
      overlay: findSingleFile(path.dirname(resolved), /^avatar-overlay-page-.*\.js$/, false),
    };
  }

  return {
    js: findSingleFile(resolved, /^codex-avatar-.*\.js$/, true),
    css: findSingleFile(resolved, /^codex-avatar-.*\.css$/, false),
    overlay: findSingleFile(resolved, /^avatar-overlay-page-.*\.js$/, false),
  };
}

function findSingleFile(directory, pattern, required) {
  const candidates = readdirSync(directory)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(directory, name));
  if (candidates.length !== 1) {
    if (!required && candidates.length === 0) return null;
    fail(`expected exactly one ${pattern} under ${directory}, found ${candidates.length}`);
  }
  return candidates[0];
}

function parseFrameObjects(source) {
  return [...source.matchAll(/\{rowIndex:(\d+),columnIndex:(\d+),frameDurationMs:(\d+)\}/g)].map(
    ([, rowIndex, columnIndex, frameDurationMs]) => ({
      rowIndex: Number(rowIndex),
      columnIndex: Number(columnIndex),
      frameDurationMs: Number(frameDurationMs),
    }),
  );
}

function rowFrames(rowIndex, frameCount, frameDurationMs, finalFrameDurationMs) {
  return Array.from({ length: frameCount }, (_, columnIndex) => ({
    rowIndex,
    columnIndex,
    frameDurationMs: columnIndex === frameCount - 1 ? finalFrameDurationMs : frameDurationMs,
  }));
}

function framesKey(frames) {
  return frames
    .map((frame) => `${frame.rowIndex}:${frame.columnIndex}:${frame.frameDurationMs}`)
    .join(",");
}

function parseCodexReference(referenceFile) {
  const source = readFileSync(referenceFile, "utf8");
  const idleFrames = parseFrameObjects(source);
  if (idleFrames.length < 6) fail(`could not parse Codex idle frame objects from ${referenceFile}`);

  const idleSlowdownMatch = source.match(/,j=(\d+),M=\[/);
  if (!idleSlowdownMatch) fail(`could not parse Codex idle slowdown constant`);

  const transientRepetitionMatch = source.match(/let r=\[\.\.\.n(,\.\.\.n)+\]/);
  if (!transientRepetitionMatch) fail(`could not parse Codex transient repetition sequence`);
  const transientRepetitions = transientRepetitionMatch[0].match(/\.\.\.n/g)?.length ?? 0;

  const mapStart = source.indexOf("P={");
  const mapEnd = source.indexOf("};function F", mapStart);
  if (mapStart === -1 || mapEnd === -1) fail(`could not find Codex PET_ANIMATION_FRAMES map`);

  const mapSource = source.slice(mapStart, mapEnd);
  const parsed = { idle: idleFrames.slice(0, 6) };
  const regex = /(?:"([^"]+)"|([a-zA-Z-]+)):L\((\d+),(\d+),(\d+),(\d+)\)/g;
  for (const [
    ,
    quotedName,
    bareName,
    rowIndex,
    frameCount,
    duration,
    finalDuration,
  ] of mapSource.matchAll(regex)) {
    const state = quotedName ?? bareName;
    parsed[state] = rowFrames(
      Number(rowIndex),
      Number(frameCount),
      Number(duration),
      Number(finalDuration),
    );
  }

  return {
    frames: parsed,
    idleSlowdown: Number(idleSlowdownMatch[1]),
    transientRepetitions,
  };
}

function parseLocalAnimation() {
  const source = readFileSync(LOCAL_ANIMATION_FILE, "utf8");
  const idleSlowdownMatch = source.match(/export const IDLE_SLOWDOWN = (\d+);/);
  if (!idleSlowdownMatch) fail(`could not parse local IDLE_SLOWDOWN`);
  const transientRepetitionsMatch = source.match(/export const TRANSIENT_REPETITIONS = (\d+);/);
  if (!transientRepetitionsMatch) fail(`could not parse local TRANSIENT_REPETITIONS`);
  const dragThresholdMatch = source.match(/export const DRAG_ANIMATION_THRESHOLD_PX = (\d+);/);
  if (!dragThresholdMatch) fail(`could not parse local DRAG_ANIMATION_THRESHOLD_PX`);

  const idleMatch = source.match(/const IDLE_FRAMES:[\s\S]*?=\s*\[([\s\S]*?)\];/);
  if (!idleMatch) fail(`could not parse local IDLE_FRAMES`);
  const idleFrames = [
    ...idleMatch[1].matchAll(/\{ rowIndex: (\d+), columnIndex: (\d+), frameDurationMs: (\d+) \}/g),
  ].map(([, rowIndex, columnIndex, frameDurationMs]) => ({
    rowIndex: Number(rowIndex),
    columnIndex: Number(columnIndex),
    frameDurationMs: Number(frameDurationMs),
  }));

  const parsed = { idle: idleFrames };
  const animationMapMatch = source.match(
    /export const PET_ANIMATION_FRAMES = \{([\s\S]*?)\} satisfies/,
  );
  if (!animationMapMatch) fail(`could not parse local PET_ANIMATION_FRAMES`);

  const entryRegex = /(?:"([^"]+)"|([a-zA-Z-]+)): rowFrames\((\d+), (\d+), (\d+), (\d+)\)/g;
  for (const [
    ,
    quotedName,
    bareName,
    rowIndex,
    frameCount,
    duration,
    finalDuration,
  ] of animationMapMatch[1].matchAll(entryRegex)) {
    const state = quotedName ?? bareName;
    parsed[state] = rowFrames(
      Number(rowIndex),
      Number(frameCount),
      Number(duration),
      Number(finalDuration),
    );
  }
  return {
    frames: parsed,
    idleSlowdown: Number(idleSlowdownMatch[1]),
    baseActivationPriority: parseLocalActivationPriority(source),
    dragAnimationThresholdPx: Number(dragThresholdMatch[1]),
    transientRepetitions: Number(transientRepetitionsMatch[1]),
  };
}

function parseLocalActivationPriority(source) {
  const match = source.match(
    /export const PET_WINDOW_BASE_ANIMATION_PRIORITY = \[([\s\S]*?)\] as const/,
  );
  if (!match) fail(`could not parse local PET_WINDOW_BASE_ANIMATION_PRIORITY`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map(([, state]) => state);
}

function parseCodexOverlayActivationPriority(referenceOverlayPath) {
  if (referenceOverlayPath == null) return null;
  const source = readFileSync(referenceOverlayPath, "utf8");
  const match = source.match(/function Ue\(e\)\{switch\(e\)\{([\s\S]*?)\}\}/);
  if (!match) fail(`could not parse Codex overlay activation priority`);
  const priorityEntries = [...match[1].matchAll(/case`([^`]+)`:return\s*(\d+)/g)];
  if (priorityEntries.length === 0) fail(`could not parse Codex overlay priority cases`);
  return priorityEntries
    .map(([, state, priority]) => ({ state, priority: Number(priority) }))
    .toSorted((left, right) => left.priority - right.priority)
    .map(({ state }) => state);
}

function parseCodexOverlayDragThreshold(referenceOverlayPath) {
  if (referenceOverlayPath == null) return null;
  const source = readFileSync(referenceOverlayPath, "utf8");
  const match = source.match(/\bGe=(\d+),Ke=/);
  if (!match) fail(`could not parse Codex overlay drag threshold`);
  return Number(match[1]);
}

function cssDeclaration(source, selector) {
  const match = source.match(new RegExp(`${selector.replaceAll(".", "\\.")}\\{([^}]*)\\}`));
  if (!match) fail(`could not parse CSS selector ${selector}`);
  return Object.fromEntries(
    match[1]
      .split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const [property, ...valueParts] = declaration.split(":");
        return [property.trim(), valueParts.join(":").trim()];
      }),
  );
}

function localCssDeclaration(selector) {
  const source = readFileSync(LOCAL_STYLES_FILE, "utf8");
  const match = source.match(
    new RegExp(`${selector.replaceAll(".", "\\.")}\\s*\\{([\\s\\S]*?)\\}`),
  );
  if (!match) fail(`could not parse local CSS selector ${selector}`);
  return Object.fromEntries(
    [...match[1].matchAll(/([a-z-]+):\s*([^;]+);/g)].map(([, property, value]) => [
      property,
      value.trim(),
    ]),
  );
}

function verifyCssParity(referenceCssPath) {
  if (referenceCssPath == null) {
    console.warn("Codex CSS parity skipped: no codex-avatar-*.css found next to reference JS");
    return;
  }

  const referenceCss = cssDeclaration(readFileSync(referenceCssPath, "utf8"), ".codex-avatar-root");
  const localCss = localCssDeclaration(".pet-sprite");
  const requiredMatches = ["background-repeat", "background-size", "image-rendering"];

  for (const property of requiredMatches) {
    if (referenceCss[property] !== localCss[property]) {
      fail(
        `CSS ${property} mismatch: reference=${referenceCss[property]} local=${localCss[property]}`,
      );
    }
  }

  const localAspect = `${localCss.width}/${localCss.height}`.replaceAll("px", "");
  if (referenceCss["aspect-ratio"] !== localAspect) {
    fail(`CSS aspect mismatch: reference=${referenceCss["aspect-ratio"]} local=${localAspect}`);
  }
}

const referencePaths = referencePathsFromArg(process.argv[2]);
const reference = parseCodexReference(referencePaths.js);
const local = parseLocalAnimation();
verifyCssParity(referencePaths.css);
const referenceBaseActivationPriority = parseCodexOverlayActivationPriority(referencePaths.overlay);
const referenceDragAnimationThresholdPx = parseCodexOverlayDragThreshold(referencePaths.overlay);

const referenceStates = Object.keys(reference.frames).toSorted();
const localStates = Object.keys(local.frames).toSorted();
if (referenceStates.join("|") !== localStates.join("|")) {
  fail(`state mismatch: reference=${referenceStates.join(",")} local=${localStates.join(",")}`);
}

if (reference.idleSlowdown !== local.idleSlowdown) {
  fail(`idle slowdown mismatch: reference=${reference.idleSlowdown} local=${local.idleSlowdown}`);
}

if (reference.transientRepetitions !== local.transientRepetitions) {
  fail(
    `transient repetition mismatch: reference=${reference.transientRepetitions} local=${local.transientRepetitions}`,
  );
}

if (
  referenceBaseActivationPriority != null &&
  referenceBaseActivationPriority.join("|") !== local.baseActivationPriority.join("|")
) {
  fail(
    `base activation priority mismatch: reference=${referenceBaseActivationPriority.join(",")} local=${local.baseActivationPriority.join(",")}`,
  );
}

if (
  referenceDragAnimationThresholdPx != null &&
  referenceDragAnimationThresholdPx !== local.dragAnimationThresholdPx
) {
  fail(
    `drag threshold mismatch: reference=${referenceDragAnimationThresholdPx} local=${local.dragAnimationThresholdPx}`,
  );
}

const mismatches = [];
for (const state of referenceStates) {
  if (framesKey(reference.frames[state]) !== framesKey(local.frames[state])) {
    mismatches.push(state);
  }
}

if (mismatches.length > 0) {
  fail(`frame map mismatch for: ${mismatches.join(", ")}`);
}

console.log(`Codex animation parity verified against ${referencePaths.js}`);
console.log(`States: ${referenceStates.join(", ")}`);
console.log(
  `Cadence: idle slowdown ${local.idleSlowdown}x, transient repetitions ${local.transientRepetitions}`,
);
if (referencePaths.css) console.log(`CSS atlas rendering verified against ${referencePaths.css}`);
if (referencePaths.overlay) {
  console.log(
    `Overlay activation priority and drag threshold verified against ${referencePaths.overlay}`,
  );
}
