#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { isAbsolute, resolve, relative } from "node:path";

// Public-tree audit configuration shared by file-content and git-identity scans.

const repoRoot = process.cwd();
const textExtensions = /\.(md|mdx|txt|json|toml|rs|ts|tsx|js|mjs|yml|yaml|html|css)$/;

// Files inside .codex/ that ARE public-tree material (the two repo-local
// skills that ship with the open-source build). Everything else under .codex/
// is local tooling and must not be tracked.
const allowedCodexFiles = new Set([
  ".codex/skills/pet-hatching/SKILL.md",
  ".codex/skills/pet-personality/SKILL.md",
]);

// Binary files we'd otherwise refuse to read as text but want to track.
const allowedBinary = new Set(["assets/pets/olive/spritesheet.webp"]);

const generatedProtocol = (file) => file.startsWith("protocol/app-server/");
const codexRuntimeImplementation = (file) =>
  [
    "src-tauri/src/runtime/process.rs",
    "scripts/smoke-codex-runtime.mjs",
    "scripts/audit-public.mjs",
  ].includes(file);

// String fragments that must not appear in any tracked source content.
// Built from concatenated tokens so this script doesn't itself trip the
// rule when it gets scanned.
const privateContentTerms = [
  ["Tr", "ey"].join(""),
  ["Kar", "lyn"].join(""),
  ["tr", "ey", "go", "ff"].join(""),
  ["Tr", "ey G", "off"].join(""),
  ["lawrence", "goffiii"].join(""),
  ["neway", "funds"].join(""),
];

// Canonical public repository URLs. These contain the GitHub handle
// `treygoff24` (which is itself caught by privateContentTerms), so we
// strip these exact forms from each file's text before running the
// content scan. The trailing negative lookahead requires the URL to
// terminate at a non-path-char boundary, so a lookalike with extra
// path characters (e.g. `.../codex-pet-sidecar-private`) doesn't get
// the canonical handle stripped — the leak survives and the audit
// fails. Trailing punctuation (period, comma, paren, quote) ends the
// URL cleanly because none of those are in the path-char class.
const PUBLIC_REPO_URLS = [
  "https://github.com/treygoff24/codex-pet-sidecar",
  "git+https://github.com/treygoff24/codex-pet-sidecar.git",
  "https://github.com/treygoff24/codex-pet-sidecar/issues",
  "https://github.com/treygoff24/codex-pet-sidecar/security/advisories/new",
  "https://github.com/treygoff24/codex-pet-sidecar#readme",
  "https://github.com/treygoff24/codex-pet-sidecar/releases/latest",
  "https://github.com/treygoff24/codex-pet-sidecar/releases/latest/download/latest.json",
  "https://github.com/treygoff24/codex-pet-sidecar/actions/workflows/check.yml",
  "https://github.com/treygoff24/codex-pet-sidecar/actions/workflows/check.yml/badge.svg",
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Sort longer URLs first so the prefix `.../codex-pet-sidecar` doesn't
// preempt a more-specific match on `.../codex-pet-sidecar/issues`.
const URL_TERMINATOR = `(?![A-Za-z0-9_/-])`;
const PUBLIC_REPO_URL_REGEXES = [...PUBLIC_REPO_URLS]
  .toSorted((a, b) => b.length - a.length)
  .map((url) => new RegExp(escapeRegex(url) + URL_TERMINATOR, "g"));

function stripPublicRepoUrls(text) {
  let out = text;
  for (const re of PUBLIC_REPO_URL_REGEXES) out = out.replace(re, "");
  return out;
}

// Public identity allowlist for git author/committer fields. These are
// the chosen email + name that should appear on every commit after the
// Phase 6 history rewrite. Each value listed here is allowed in git
// metadata fields but still banned in source content (so a stray
// "Trey Goff" in code stays caught).
//
// PHASE 6 GATE: until the rewrite lands, the existing history will fail
// this check on the legacy author identity. That's the point — the
// audit is the gate that proves the rewrite worked.
//
// If you change the chosen email or name in 6.1, edit these constants
// to match before running the post-rewrite audit.
const PUBLIC_AUTHOR_EMAILS = new Set([
  "treygoff24@users.noreply.github.com",
  // Some GitHub noreply emails include a numeric ID prefix; either form is OK.
  // The matching is exact, so add the numeric form too once Trey picks it.
]);
const PUBLIC_AUTHOR_NAMES = new Set(["Trey Goff"]);

// Allow GitHub's numeric-prefix noreply form without enumerating every
// possible numeric ID.
const NUMERIC_NOREPLY = /^\d+\+treygoff24@users\.noreply\.github\.com$/;

function isPublicEmail(email) {
  return PUBLIC_AUTHOR_EMAILS.has(email) || NUMERIC_NOREPLY.test(email);
}
function isPublicName(name) {
  return PUBLIC_AUTHOR_NAMES.has(name);
}

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
    const target = readlinkSync(file);
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

  const rawText = readFileSync(file, "utf8");
  // Allowlisted public URLs are removed before the private-term scan so
  // canonical references in package.json, README badges, and SECURITY
  // links don't false-trigger.
  const text = file === "scripts/audit-public.mjs" ? rawText : stripPublicRepoUrls(rawText);

  if (file !== "scripts/audit-public.mjs" && privateContentTerms.some((t) => text.includes(t))) {
    fail(file, "private personal name or handle remains");
  }
  if (
    file !== "scripts/audit-public.mjs" &&
    text.includes(["/Users/", "tr", "ey", "go", "ff"].join(""))
  ) {
    fail(file, "private user path remains");
  }
  if (!generatedProtocol(file)) {
    if (new RegExp(["danger-full", "access, by design"].join("-")).test(text))
      fail(file, "stale unsafe default claim remains");
    if (/approvalPolicy:\s*["`]never["`][^\n]*(default|by design|public default)/i.test(text))
      fail(file, "claims never approval is a default");
    if (/ephemeral:\s*false[^\n]*(default|public default|starts|opens)/i.test(text))
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
    !codexRuntimeImplementation(file) &&
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

// Git identity scan: every commit's author and committer email/name must
// either match the public allowlist or contain none of the private
// content terms / private domain. Each field is checked individually so
// a leak in one column can't be masked by a clean value in another.

function gitFieldList(format) {
  return execFileSync("git", ["log", `--format=${format}`, "--all"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
}

const authorEmails = new Set(gitFieldList("%ae"));
const authorNames = new Set(gitFieldList("%an"));
const committerEmails = new Set(gitFieldList("%ce"));
const committerNames = new Set(gitFieldList("%cn"));

function checkIdentityValue(kind, value, isPublic) {
  if (isPublic(value)) return;
  if (privateContentTerms.some((t) => value.includes(t))) {
    fail("git history", `${kind} "${value}" contains a private term`);
    return;
  }
  if (value.includes("newayfunds")) {
    fail("git history", `${kind} "${value}" contains a private domain`);
  }
}

for (const email of authorEmails) checkIdentityValue("author email", email, isPublicEmail);
for (const name of authorNames) checkIdentityValue("author name", name, isPublicName);
for (const email of committerEmails) checkIdentityValue("committer email", email, isPublicEmail);
for (const name of committerNames) checkIdentityValue("committer name", name, isPublicName);

// Inline self-tests for stripPublicRepoUrls — runs every audit pass so a
// future edit to the URL allowlist can't silently break the boundary
// rules.

function selfTest() {
  const samples = [
    // [input fragment, expect-leak (i.e. handle survives stripping)]
    // Canonical forms followed by closing punctuation must strip clean.
    [`"url": "https://github.com/treygoff24/codex-pet-sidecar"`, false],
    [`"url": "git+https://github.com/treygoff24/codex-pet-sidecar.git"`, false],
    [`See https://github.com/treygoff24/codex-pet-sidecar/issues.`, false],
    [`Visit https://github.com/treygoff24/codex-pet-sidecar#readme.`, false],
    [`A link: [docs](https://github.com/treygoff24/codex-pet-sidecar#readme)`, false],
    // Query strings extend the URL but the canonical prefix still gets
    // stripped — `?evil` left in source is harmless content.
    [`https://github.com/treygoff24/codex-pet-sidecar?redirect=evil`, false],
    // Lookalikes that extend the path with additional path chars must
    // NOT have the canonical prefix stripped — the handle survives so
    // the audit catches it.
    [`https://github.com/treygoff24/codex-pet-sidecar/`, true],
    [`https://github.com/treygoff24/codex-pet-sidecar-private`, true],
    [`https://github.com/treygoff24/codex-pet-sidecar/extra/path`, true],
  ];
  for (const [input, expectLeak] of samples) {
    const stripped = stripPublicRepoUrls(input);
    const hasHandle = privateContentTerms.some((t) => stripped.includes(t));
    if (hasHandle !== expectLeak) {
      fail(
        "scripts/audit-public.mjs",
        `self-test failure for input ${JSON.stringify(input)}: expected leak=${expectLeak} got ${hasHandle}`,
      );
    }
  }
}
selfTest();

if (failures.length) {
  console.error("Public audit failed:\n" + failures.join("\n"));
  process.exit(1);
}
console.log(`Public audit passed (${files.length} files inspected).`);
