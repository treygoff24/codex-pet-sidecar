#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, relative } from "node:path";

const repoRoot = process.cwd();
const textExtensions = /\.(md|mdx|txt|json|toml|rs|ts|tsx|js|mjs|yml|yaml|html|css)$/;
const allowedCodexFiles = new Set([
  ".codex/skills/pet-hatching/SKILL.md",
  ".codex/skills/pet-personality/SKILL.md",
]);
const allowedBinary = new Set(["assets/pets/olive/spritesheet.webp"]);
const generatedProtocol = (file) => file.startsWith("protocol/app-server/");

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

const tracked = git(["ls-files"]);
const untracked = git(["ls-files", "-o", "--exclude-standard"]);
const deletedTracked = git(["ls-files", "-d"]);
const files = [...new Set([...tracked, ...untracked])].filter(
  (file) => !file.startsWith("node_modules/") && !file.startsWith(".git/"),
);
const failures = [];

function fail(file, reason) {
  failures.push(`${file}: ${reason}`);
}

for (const file of deletedTracked) {
  fail(file, "tracked file is deleted in the working tree; commit or restore before public audit");
}

for (const file of files) {
  if (allowedBinary.has(file)) continue;
  if (!existsSync(file)) continue;
  if (file.startsWith(".claude/")) fail(file, "unexpected Claude local tooling in public tree");
  if (file.startsWith(".agents/")) fail(file, "unexpected agent local tooling in public tree");
  if (file === ".codex/hooks.json") fail(file, "local Codex hooks are not public repo config");
  if (file.startsWith(".codex/") && !allowedCodexFiles.has(file))
    fail(file, "unexpected Codex local tooling outside public repo skills");

  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) {
    const target = readFileSync(file, "utf8");
    const resolved = resolve(file, "..", target);
    if (
      isAbsolute(target) ||
      target.includes("/Users/") ||
      relative(repoRoot, resolved).startsWith("..")
    ) {
      fail(file, `symlink target is outside repo: ${target}`);
    }
    continue;
  }
  if (!stat.isFile() || !textExtensions.test(file)) continue;
  const text = readFileSync(file, "utf8");
  const privateTerms = [
    ["Tr", "ey"].join(""),
    ["Kar", "lyn"].join(""),
    ["tr", "ey", "go", "ff"].join(""),
    ["Tr", "ey G", "off"].join(""),
  ];
  if (privateTerms.some((term) => text.includes(term)))
    fail(file, "private personal name or handle remains");
  if (text.includes(["/Users/", "tr", "ey", "go", "ff"].join("")))
    fail(file, "private user path remains");
  if (!generatedProtocol(file)) {
    if (
      file !== "docs/plans/2026-05-05-open-source-public-launch.md" &&
      new RegExp(["danger-full", "access, by design"].join("-")).test(text)
    )
      fail(file, "stale unsafe default claim remains");
    if (
      file !== "docs/plans/2026-05-05-open-source-public-launch.md" &&
      /approvalPolicy:\s*["`]never["`][^\n]*(default|by design|public default)/i.test(text)
    )
      fail(file, "claims never approval is a default");
    if (
      file !== "docs/plans/2026-05-05-open-source-public-launch.md" &&
      /ephemeral:\s*false[^\n]*(default|public default|starts|opens)/i.test(text)
    )
      fail(file, "claims persistent sessions are a default");
  }
  const placeholderPattern = new RegExp(
    ["github\\.com\\/", "example", "|", "example\\.com", "|TODO_PUBLIC|PLACEHOLDER_PUBLIC"].join(
      "",
    ),
  );
  if (file !== "scripts/audit-public.mjs" && placeholderPattern.test(text)) {
    fail(file, "placeholder public metadata remains");
  }
  const localCodexResiduePattern = new RegExp(
    [
      "~\\/",
      "\\.codex",
      "|\\$CODEX_HOME|CODEX_HOME|",
      "olive",
      "-correct",
      "|private Olive lore",
    ].join(""),
  );
  if (
    file !== "scripts/audit-public.mjs" &&
    !generatedProtocol(file) &&
    localCodexResiduePattern.test(text)
  ) {
    fail(file, "local Codex provenance residue remains");
  }
  const secretArgvPattern = new RegExp(
    ["Authorization: Bearer .*", "api_key", "|curl.*Authorization"].join(""),
  );
  if (file !== "scripts/audit-public.mjs" && secretArgvPattern.test(text)) {
    fail(file, "secret-bearing HTTP command pattern remains");
  }
  if (/sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9_]*TOKEN[A-Za-z0-9_]*\s*=\s*[A-Za-z0-9_-]{12,}/.test(text)) {
    fail(file, "token-looking placeholder or secret pattern remains");
  }
}

if (failures.length) {
  console.error("Public audit failed:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(`Public audit passed (${files.length} files inspected).`);
