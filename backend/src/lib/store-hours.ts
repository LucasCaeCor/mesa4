type StoreSettingsLike =
  | {
      acceptingOrders?: boolean | null;
    }
  | null
  | undefined;

type BusinessHourLike = {
  weekday: number;
  enabled: boolean;
  opensAt: string;
  closesAt: string;
  position?: number | null;
};

const STORE_TIMEZONE =
  "America/Sao_Paulo";

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function toMinutes(value: string) {
  const [hours, minutes] =
    value.split(":").map(Number);

  return hours * 60 + minutes;
}

function getStoreClock(now: Date) {
  const formatter =
    new Intl.DateTimeFormat("en-US", {
      timeZone: STORE_TIMEZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

  const parts =
    Object.fromEntries(
      formatter
        .formatToParts(now)
        .filter(
          (part) =>
            part.type !== "literal",
        )
        .map((part) => [
          part.type,
          part.value,
        ]),
    );

  const weekday =
    WEEKDAYS[parts.weekday] ?? 0;

  const hour =
    Number(parts.hour ?? "0");
  const minute =
    Number(parts.minute ?? "0");

  return {
    weekday,
    minutes: hour * 60 + minute,
    currentTime:
      `${String(hour).padStart(2, "0")}:${String(
        minute,
      ).padStart(2, "0")}`,
  };
}

function intervalContains(
  hour: BusinessHourLike,
  currentWeekday: number,
  currentMinutes: number,
) {
  if (!hour.enabled) {
    return false;
  }

  const opens =
    toMinutes(hour.opensAt);
  const closes =
    toMinutes(hour.closesAt);

  if (opens === closes) {
    return false;
  }

  // Intervalo normal no mesmo dia.
  if (opens < closes) {
    return (
      hour.weekday === currentWeekday &&
      currentMinutes >= opens &&
      currentMinutes < closes
    );
  }

  // Intervalo atravessando meia-noite,
  // ex.: sexta 18:00 -> 02:00.
  if (
    hour.weekday === currentWeekday &&
    currentMinutes >= opens
  ) {
    return true;
  }

  const previousWeekday =
    (currentWeekday + 6) % 7;

  return (
    hour.weekday === previousWeekday &&
    currentMinutes < closes
  );
}

export function evaluateStoreAvailability(
  settings: StoreSettingsLike,
  hours: BusinessHourLike[],
  now = new Date(),
) {
  const clock = getStoreClock(now);

  if (!settings) {
    return {
      isOpen: false,
      reason:
        "SETTINGS_NOT_FOUND" as const,
      timezone: STORE_TIMEZONE,
      currentWeekday: clock.weekday,
      currentTime: clock.currentTime,
    };
  }

  if (
    settings.acceptingOrders === false
  ) {
    return {
      isOpen: false,
      reason:
        "MANUALLY_CLOSED" as const,
      timezone: STORE_TIMEZONE,
      currentWeekday: clock.weekday,
      currentTime: clock.currentTime,
    };
  }

  const isInsideAnyInterval =
    hours.some((hour) =>
      intervalContains(
        hour,
        clock.weekday,
        clock.minutes,
      ),
    );

  return {
    isOpen: isInsideAnyInterval,
    reason: isInsideAnyInterval
      ? ("OPEN" as const)
      : ("OUTSIDE_BUSINESS_HOURS" as const),
    timezone: STORE_TIMEZONE,
    currentWeekday: clock.weekday,
    currentTime: clock.currentTime,
  };
}
