#!/usr/bin/env node
import { readFileSync } from "node:fs";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag) fail("Usage: node scripts/assert-release-version.mjs vX.Y.Z");
if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) {
  fail(`Release tag must look like vX.Y.Z; got ${tag}`);
}

const expected = tag.slice(1);
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const tauriVersion = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
const cargoText = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoPackageSection = cargoText
  .split(/^\[/m)
  .find((section) => section.startsWith("package]"));
const cargoVersion = cargoPackageSection?.match(/^version = "([^"]+)"/m)?.[1];

const versions = {
  "package.json": packageVersion,
  "src-tauri/tauri.conf.json": tauriVersion,
  "src-tauri/Cargo.toml": cargoVersion,
};

const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);
if (mismatches.length) {
  fail(
    `Release tag ${tag} does not match:\n` +
      mismatches.map(([file, version]) => `- ${file}: ${version ?? "missing"}`).join("\n"),
  );
}

console.log(`Release version ${expected} is synchronized across package, Tauri, and Cargo.`);
