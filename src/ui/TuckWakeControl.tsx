function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function tomorrowMorning(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(8, 0, 0, 0);
  return date.toISOString();
}

export function TuckWakeControl({
  tucked,
  onTuck,
  onWake,
}: {
  tucked: boolean;
  onTuck: (until: string | null) => void;
  onWake: () => void;
}) {
  if (tucked) {
    return (
      <button type="button" onClick={onWake}>
        Wake
      </button>
    );
  }
  return (
    <div className="tuck-wake-control">
      <button type="button" onClick={() => onTuck(null)}>
        Tuck
      </button>
      <button type="button" onClick={() => onTuck(minutesFromNow(30))}>
        30m
      </button>
      <button type="button" onClick={() => onTuck(minutesFromNow(120))}>
        2h
      </button>
      <button type="button" onClick={() => onTuck(tomorrowMorning())}>
        Tomorrow
      </button>
    </div>
  );
}
