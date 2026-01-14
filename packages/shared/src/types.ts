export type Theme = "dark" | "light" | "custom";

export type ModuleKey = "calendar" | "photos" | "weather";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  source: "manual" | "ics";
};

export type WeatherInfo = {
  location: string;
  summary: string;
  temp: string;
  code: number;
};

export type WeatherForecastDay = {
  date: string;
  high: string;
  low: string;
  summary: string;
  code: number;
};

export type PhotoSources = {
  google: boolean;
  local: boolean;
};

export type CustomTheme = {
  bg: string;
  surface: string;
  surface2: string;
  cardOpacity: number;
  calendarDay: string;
  calendarDayMuted: string;
  calendarToday: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  backgroundImage: string;
  backgroundPosition: PhotoFocus;
  buttonText: string;
  buttonTextOnAccent: string;
};

export type PhotoFocus =
  | "none"
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type ModuleLayout = {
  column: "left" | "center" | "center-left" | "center-right" | "right";
  span: 1 | 2 | 3 | 4;
  order: number;
  height?: number;
};

export type LayoutConfig = {
  mode: "classic";
  sidebar: "right" | "left";
  modules: {
    calendar: ModuleLayout;
    photos: ModuleLayout;
    note: ModuleLayout;
  };
};

export type HearthState = {
  theme: Theme;
  modules: Record<ModuleKey, boolean>;
  calendarView: "week" | "month";
  calendarTimeFormat: "12h" | "24h";
  tempUnit: "f" | "c";
  weatherForecastEnabled: boolean;
  qrEnabled: boolean;
  noteEnabled: boolean;
  noteTitle: string;
  note: string;
  events: CalendarEvent[];
  photos: string[];
  photosGoogle: string[];
  photosLocal: string[];
  photoSources: PhotoSources;
  photoShuffle: boolean;
  photoFocus: PhotoFocus;
  photoTiles: 1 | 2 | 3 | 4;
  customTheme: CustomTheme;
  weather: WeatherInfo;
  forecast: WeatherForecastDay[];
  layout: LayoutConfig;
  updatedAt: string;
};

export type PublicStateResponse = {
  state: HearthState;
  deviceId: string;
};
