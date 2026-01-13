import ical from "ical";
import type { CalendarEvent } from "@hearth/shared";

type IcsEvent = {
  type?: string;
  start?: Date;
  end?: Date;
  summary?: string;
  uid?: string;
  datetype?: "date" | "date-time";
  rrule?: { between: (start: Date, end: Date, inc: boolean) => Date[] };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, IcsEvent>;
};

export function parseIcsEvents(icsText: string, now = new Date()) {
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

  const formatLocalTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

  const makeEvent = (item: IcsEvent, date: Date, key: string) => {
    const isoDate = formatLocalDate(date);
    const allDay = isAllDayEvent(item);
    const timeLabel = allDay ? "" : `${formatLocalTime(date)} `;
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
      for (const occurrence of dates) {
        const occurrenceKey = occurrence.toISOString();
        if (shouldSkipDate(item, occurrence)) continue;
        const recurrence = item.recurrences?.[occurrenceKey];
        const eventItem = recurrence ?? item;
        events.push(makeEvent(eventItem, occurrence, key));
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
