function hasStringMessage(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

export function formatError(caught: unknown, fallback = "Unknown error"): string {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === "string") return caught;
  if (hasStringMessage(caught)) return caught.message;
  try {
    return JSON.stringify(caught);
  } catch {
    return fallback;
  }
}
