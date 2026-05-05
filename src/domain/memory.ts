export function formatMemoryForBaseInstructions(memoryMarkdown: string): string {
  const trimmed = memoryMarkdown.trim();
  if (!trimmed) {
    return "Pet memory is currently empty.";
  }
  return `Current pet memory.md contents:\n\n${trimmed}`;
}
