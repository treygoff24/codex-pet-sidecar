#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, readlinkSync, existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const repoRoot = process.cwd();
function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}
const files = [
  ...new Set([...git(["ls-files"]), ...git(["ls-files", "-o", "--exclude-standard"])]),
];
const failures = [];
const forbidden = [
  /^dist\//,
  /^node_modules\//,
  /(^|\/)\.DS_Store$/,
  /^hatch-runs\//,
  /^generated_images\//,
  /(^|\/)ambient-screenshots\//,
  /^\.agents\//,
  /^\.codex\/hooks\.json$/,
  /^\.claude\/skills\//,
];

for (const file of files) {
  if (!existsSync(file)) continue;
  for (const pattern of forbidden) {
    if (pattern.test(file)) failures.push(`${file}: forbidden generated/local artifact`);
  }
  if (
    /\.(mov|webm|mp4)$/.test(file) &&
    !file.startsWith("docs/verification/assets/") &&
    !/^tools\/.*\/fixtures\//.test(file)
  ) {
    failures.push(`${file}: QA video is not in an intentional fixture/proof folder`);
  }
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(file);
    const resolved = resolve(file, "..", target);
    if (
      isAbsolute(target) ||
      target.includes("/Users/") ||
      relative(repoRoot, resolved).startsWith("..")
    ) {
      failures.push(`${file}: external symlink target ${target}`);
    }
  }
}

if (failures.length) {
  console.error("Artifact audit failed:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(`Artifact audit passed (${files.length} files inspected).`);
