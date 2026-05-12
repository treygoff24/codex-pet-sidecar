const RESERVED_PET_IDS = new Set(["olive", "codex", "default", "assets", "tmp", "hatching"]);

export function normalizeDisplayNameToPetId(displayName: string): string | null {
  const normalized = displayName
    .toLowerCase()
    .split("")
    .map((char) => (/^[a-z0-9]$/.test(char) ? char : "-"))
    .join("")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized || RESERVED_PET_IDS.has(normalized)) return null;
  return normalized;
}
