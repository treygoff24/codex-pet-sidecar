#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const tag = arg("tag", process.env.GITHUB_REF_NAME);
const repository = arg("repository", process.env.GITHUB_REPOSITORY);
const bundleDir = arg("bundle-dir", "src-tauri/target/universal-apple-darwin/release/bundle/macos");
const output = arg("output", "latest.json");
const notesFile = arg("notes-file");

if (!tag) fail("Missing --tag or GITHUB_REF_NAME");
if (!repository) fail("Missing --repository or GITHUB_REPOSITORY");
if (!/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) fail(`Invalid release tag ${tag}`);

const version = tag.slice(1);
const archive = readdirSync(bundleDir).find((file) => file.endsWith(".app.tar.gz"));
if (!archive) fail(`No .app.tar.gz update archive found in ${bundleDir}`);
const signaturePath = join(bundleDir, `${archive}.sig`);
const signature = readFileSync(signaturePath, "utf8").trim();
if (!signature) fail(`Signature file is empty: ${signaturePath}`);

const url = `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(archive)}`;
const notes = notesFile ? readFileSync(notesFile, "utf8").trim() : `Codex Pet Sidecar ${tag}`;
const pubDate = new Date().toISOString();

const platform = { signature, url };
const manifest = {
  version,
  notes,
  pub_date: pubDate,
  platforms: {
    "darwin-aarch64": platform,
    "darwin-x86_64": platform,
  },
};

writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Wrote ${output} for ${basename(archive)}.`);
