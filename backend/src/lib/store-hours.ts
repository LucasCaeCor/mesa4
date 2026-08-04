export const STORE_TIME_ZONE =
  "America/Sao_Paulo";

export type StoreAvailabilityReason =
  | "OPEN"
  | "MANUALLY_CLOSED"
  | "OUTSIDE_BUSINESS_HOURS"
  | "SETTINGS_NOT_FOUND";

export type StoreAvailability = {
  isOpen: boolean;
  reason: StoreAvailabilityReason;
  timezone: string;
  currentWeekday: number;
  currentTime: string;
};

type StoreSettingsLike =
  | {
      acceptingOrders: boolean;
    }
  | null
  | undefined;

type BusinessHourLike = {
  weekday: number;
  enabled: boolean;
  opensAt: string;
  closesAt: string;
};

const weekdayByName: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function timeToMinutes(value: string) {
  const [hour, minute] = value
    .split(":")
    .map(Number);

  return hour * 60 + minute;
}

function getStoreClock(now: Date) {
  const parts = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: STORE_TIME_ZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    },
  ).formatToParts(now);

  const weekdayName =
    parts.find(
      (part) => part.type === "weekday",
    )?.value ?? "Sun";
  const hour = Number(
    parts.find(
      (part) => part.type === "hour",
    )?.value ?? 0,
  );
  const minute = Number(
    parts.find(
      (part) => part.type === "minute",
    )?.value ?? 0,
  );

  return {
    weekday: weekdayByName[weekdayName] ?? 0,
    minutes: hour * 60 + minute,
    time:
      `${String(hour).padStart(2, "0")}:` +
      String(minute).padStart(2, "0"),
  };
}

function isScheduleActive(
  schedule: BusinessHourLike,
  currentWeekday: number,
  currentMinutes: number,
) {
  if (!schedule.enabled) {
    return false;
  }

  const opensAt = timeToMinutes(
    schedule.opensAt,
  );
  const closesAt = timeToMinutes(
    schedule.closesAt,
  );

  // Horários iguais representam funcionamento
  // durante todo o dia configurado.
  if (opensAt === closesAt) {
    return currentWeekday === schedule.weekday;
  }

  // Exemplo: 08:00 até 18:00.
  if (opensAt < closesAt) {
    return (
      currentWeekday === schedule.weekday &&
      currentMinutes >= opensAt &&
      currentMinutes < closesAt
    );
  }

  // Horário que atravessa a meia-noite.
  // Exemplo: segunda 20:00 até terça 02:00.
  const followingWeekday =
    (schedule.weekday + 1) % 7;

  return (
    (currentWeekday === schedule.weekday &&
      currentMinutes >= opensAt) ||
    (currentWeekday === followingWeekday &&
      currentMinutes < closesAt)
  );
}

export function evaluateStoreAvailability(
  settings: StoreSettingsLike,
  hours: BusinessHourLike[],
  now = new Date(),
): StoreAvailability {
  const clock = getStoreClock(now);

  if (!settings) {
    return {
      isOpen: false,
      reason: "SETTINGS_NOT_FOUND",
      timezone: STORE_TIME_ZONE,
      currentWeekday: clock.weekday,
      currentTime: clock.time,
    };
  }

  // Esta chave continua funcionando como
  // fechamento manual de emergência.
  if (!settings.acceptingOrders) {
    return {
      isOpen: false,
      reason: "MANUALLY_CLOSED",
      timezone: STORE_TIME_ZONE,
      currentWeekday: clock.weekday,
      currentTime: clock.time,
    };
  }

  const isOpen = hours.some((schedule) =>
    isScheduleActive(
      schedule,
      clock.weekday,
      clock.minutes,
    ),
  );

  return {
    isOpen,
    reason: isOpen
      ? "OPEN"
      : "OUTSIDE_BUSINESS_HOURS",
    timezone: STORE_TIME_ZONE,
    currentWeekday: clock.weekday,
    currentTime: clock.time,
  };
}
