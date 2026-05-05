export type MuteChoice = "30m" | "2h" | "tomorrow";

const minuteMs = 60_000;

export function isMuted(now: Date, muteUntil?: string): boolean {
  if (!muteUntil) return false;
  const until = new Date(muteUntil);
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > now.getTime();
}

export function canSendProactiveMessage(params: {
  now: Date;
  lastSentAt?: string;
  minMinutes: number;
  muteUntil?: string;
}): boolean {
  if (isMuted(params.now, params.muteUntil)) return false;
  if (!params.lastSentAt) return true;
  const last = new Date(params.lastSentAt);
  if (Number.isNaN(last.getTime())) return true;
  return params.now.getTime() - last.getTime() >= params.minMinutes * minuteMs;
}

export function muteUntilForChoice(choice: MuteChoice, now: Date): string {
  if (choice === "30m") return new Date(now.getTime() + 30 * minuteMs).toISOString();
  if (choice === "2h") return new Date(now.getTime() + 120 * minuteMs).toISOString();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);
  return tomorrow.toISOString();
}
