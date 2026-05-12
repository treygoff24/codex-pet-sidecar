import type { ReferenceImage } from "./hatching";

export function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function referenceDescriptionLabel(image: ReferenceImage): string {
  if (image.descriptionStatus === "ready") return "description ready";
  if (image.descriptionStatus === "pending") return "describing image";
  return "description failed";
}
