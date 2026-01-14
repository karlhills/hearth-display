import { z } from "zod";

export const themeSchema = z.enum(["dark", "light", "custom"]);

export const moduleKeySchema = z.enum(["calendar", "photos", "weather"]);

export const modulesSchema = z.object({
  calendar: z.boolean(),
  photos: z.boolean(),
  weather: z.boolean()
});

export const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  date: z.string().min(1),
  allDay: z.boolean(),
  source: z.enum(["manual", "ics"]).default("manual")
});

export const weatherSchema = z.object({
  location: z.string().min(1),
  summary: z.string().min(1),
  temp: z.string().min(1),
  code: z.number()
});

export const forecastDaySchema = z.object({
  date: z.string().min(1),
  high: z.string().min(1),
  low: z.string().min(1),
  summary: z.string().min(1),
  code: z.number()
});

export const photoFocusSchema = z.enum([
  "none",
  "center",
  "top",
  "bottom",
  "left",
  "right",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right"
]);

export const photoSourcesSchema = z.object({
  google: z.boolean(),
  local: z.boolean()
});

export const customThemeSchema = z.object({
  bg: z.string().min(1),
  surface: z.string().min(1),
  surface2: z.string().min(1),
  cardOpacity: z.number().min(0).max(1).default(1),
  calendarDay: z.string().min(1),
  calendarDayMuted: z.string().min(1),
  calendarToday: z.string().min(1),
  border: z.string().min(1),
  text: z.string().min(1),
  muted: z.string().min(1),
  faint: z.string().min(1),
  accent: z.string().min(1),
  backgroundImage: z.string().optional(),
  backgroundPosition: photoFocusSchema.optional(),
  buttonText: z.string().min(1).optional(),
  buttonTextOnAccent: z.string().min(1).optional()
});

export const layoutSchema = z.object({
  mode: z.literal("classic"),
  sidebar: z.enum(["right", "left"]),
  modules: z.object({
    calendar: z.object({
      column: z.enum(["left", "center", "right"]),
      span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      order: z.number().int()
    }),
    photos: z.object({
      column: z.enum(["left", "center", "right"]),
      span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      order: z.number().int()
    }),
    note: z.object({
      column: z.enum(["left", "center", "right"]),
      span: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      order: z.number().int()
    })
  })
});

export const stateSchema = z.object({
  theme: themeSchema,
  modules: modulesSchema,
  calendarView: z.enum(["week", "month"]),
  tempUnit: z.enum(["f", "c"]),
  weatherForecastEnabled: z.boolean(),
  qrEnabled: z.boolean(),
  noteTitle: z.string(),
  note: z.string(),
  events: z.array(calendarEventSchema),
  photos: z.array(z.string().min(1)),
  photosGoogle: z.array(z.string().min(1)),
  photosLocal: z.array(z.string().min(1)),
  photoSources: photoSourcesSchema,
  photoShuffle: z.boolean(),
  photoFocus: photoFocusSchema,
  customTheme: customThemeSchema,
  weather: weatherSchema,
  forecast: z.array(forecastDaySchema),
  layout: layoutSchema,
  updatedAt: z.string()
});

export const stateUpdateSchema = z.object({
  theme: themeSchema.optional(),
  modules: modulesSchema.partial().optional(),
  calendarView: z.enum(["week", "month"]).optional(),
  tempUnit: z.enum(["f", "c"]).optional(),
  weatherForecastEnabled: z.boolean().optional(),
  qrEnabled: z.boolean().optional(),
  noteTitle: z.string().optional(),
  note: z.string().optional(),
  events: z.array(calendarEventSchema).optional(),
  photos: z.array(z.string().min(1)).optional(),
  photosGoogle: z.array(z.string().min(1)).optional(),
  photosLocal: z.array(z.string().min(1)).optional(),
  photoSources: photoSourcesSchema.optional(),
  photoShuffle: z.boolean().optional(),
  photoFocus: photoFocusSchema.optional(),
  customTheme: customThemeSchema.optional(),
  weather: weatherSchema.partial().optional(),
  forecast: z.array(forecastDaySchema).optional(),
  layout: layoutSchema.optional()
});

export const pairingSchema = z.object({
  code: z.string().min(4)
});

export const toggleModuleSchema = z.object({
  module: moduleKeySchema,
  enabled: z.boolean()
});

export const layoutUpdateSchema = z.object({
  layout: layoutSchema
});
