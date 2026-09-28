export type DailySchedule = { time: string; timeZone: string };
export function validTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
/** Finds the next actual wall-clock minute. Missing DST times skip that day;
 * repeated times run once. Manual refresh does not shift the daily clock. */
export function nextRefreshAt(
  interval: number,
  daily?: DailySchedule,
  now = new Date(),
): Date {
  if (
    ![15, 60, 360, 1440].includes(interval) ||
    !Number.isFinite(now.getTime())
  )
    throw new Error("Agendamento inválido.");
  if (interval !== 1440 || !daily)
    return new Date(now.getTime() + interval * 60000);
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(daily.time) ||
    !validTimeZone(daily.timeZone)
  )
    throw new Error("Informe horário e fuso válidos.");
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: daily.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  function local(date: Date) {
    const p = Object.fromEntries(
      formatter.formatToParts(date).map((p) => [p.type, p.value]),
    );
    return {
      day: `${p.year}-${p.month}-${p.day}`,
      time: `${p.hour}:${p.minute}`,
    };
  }
  const current = local(now),
    start = Math.floor(now.getTime() / 60000) * 60000;
  for (let minute = 1; minute <= 60 * 49; minute++) {
    const candidate = new Date(start + minute * 60000),
      wall = local(candidate);
    if (
      wall.time === daily.time &&
      (wall.day !== current.day || current.time < daily.time)
    )
      return candidate;
  }
  throw new Error("Não foi possível calcular a próxima execução neste fuso.");
}
