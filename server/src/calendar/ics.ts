import ical from "ical";
import type { CalendarEvent } from "@hearth/shared";

type IcsEvent = {
  type?: string;
  start?: Date & { tz?: string };
  end?: Date & { tz?: string };
  summary?: string;
  uid?: string;
  datetype?: "date" | "date-time";
  rrule?: { between: (start: Date, end: Date, inc: boolean) => Date[] };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, IcsEvent>;
  tz?: string;
};

export function parseIcsEvents(icsText: string, now = new Date(), timeFormat: "12h" | "24h" = "12h") {
  const data = ical.parseICS(icsText) as Record<string, IcsEvent>;
  const events: CalendarEvent[] = [];
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatTimeZoneDate = (date: Date, timeZone?: string) => {
    if (!timeZone) return formatLocalDate(date);
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(date);
      const year = parts.find((part) => part.type === "year")?.value ?? "0000";
      const month = parts.find((part) => part.type === "month")?.value ?? "01";
      const day = parts.find((part) => part.type === "day")?.value ?? "01";
      return `${year}-${month}-${day}`;
    } catch {
      return formatLocalDate(date);
    }
  };

  const formatLocalTime = (date: Date) => {
    const hour12 = timeFormat === "12h";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12 });
  };

  const formatTimeZoneTime = (date: Date, timeZone?: string) => {
    if (!timeZone) return formatLocalTime(date);
    try {
      const hour12 = timeFormat === "12h";
      return new Intl.DateTimeFormat([], {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
        hour12
      }).format(date);
    } catch {
      return formatLocalTime(date);
    }
  };

  const resolveEventTimeZone = (item: IcsEvent) => {
    return item.tz ?? item.start?.tz ?? item.end?.tz;
  };

  const isAllDayEvent = (item: IcsEvent) => {
    if (item.datetype === "date") return true;
    if (item.start instanceof Date && item.end instanceof Date) {
      const start = item.start;
      const end = item.end;
      const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0;
      const duration = end.getTime() - start.getTime();
      if (startsAtMidnight && duration >= 23 * 60 * 60 * 1000) {
        return true;
      }
    }
    return false;
  };

  const shouldSkipDate = (item: IcsEvent, date: Date) => {
    const dateKey = date.toISOString();
    const dayKey = dateKey.slice(0, 10);
    return Boolean(item.exdate && (item.exdate[dateKey] || item.exdate[dayKey]));
  };

  const makeEvent = (item: IcsEvent, date: Date, key: string, timeSource: Date = date) => {
    const timeZone = resolveEventTimeZone(item);
    const allDay = isAllDayEvent(item);
    const isoDate = formatTimeZoneDate(date, timeZone);
    const timeLabel = allDay ? "" : `${formatTimeZoneTime(timeSource, timeZone)} `;
    const summary = item.summary ?? "Untitled";
    return {
      id: `${item.uid ?? key}-${isoDate}-${allDay ? "all" : date.toISOString()}`,
      title: `${timeLabel}${summary}`.trim(),
      date: isoDate,
      allDay,
      source: "ics"
    } satisfies CalendarEvent;
  };

  for (const key of Object.keys(data)) {
    const item = data[key];
    if (!item || item.type !== "VEVENT") continue;

    if (item.rrule && item.start instanceof Date) {
      const dates = item.rrule.between(windowStart, windowEnd, true);
      const startDate = item.start;
      if (startDate >= windowStart && startDate <= windowEnd) {
        const startKey = startDate.toISOString();
        if (!dates.some((date) => date.toISOString() === startKey)) {
          dates.push(startDate);
        }
      }
      dates.sort((a, b) => a.getTime() - b.getTime());
      for (const occurrence of dates) {
        const occurrenceKey = occurrence.toISOString();
        if (shouldSkipDate(item, occurrence)) continue;
        const recurrence = item.recurrences?.[occurrenceKey];
        const eventItem = recurrence ?? item;
        events.push(makeEvent(eventItem, occurrence, key, eventItem.start ?? occurrence));
      }
      continue;
    }

    const start = item.start instanceof Date ? item.start : null;
    if (!start) continue;
    if (start < windowStart || start > windowEnd) continue;

    events.push(makeEvent(item, start, key));
  }

  return events;
}
