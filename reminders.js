// Kalendarz dni roboczych, analiza brakow w worklogach i ustawienia przypomnien.
// Modul jest uzywany zarowno przez strone (page.js) jak i service workera (background.js).

export const REMINDER_DEFAULTS = {
  reminderEnabled: true,
  reminderHour: 9,
  reminderLeadDays: 1,
  reminderRespectHolidays: true,
  vacationDates: [],
  weeklyHours: null,
  dailyTargetHours: 8
};

const REMINDER_KEYS = Object.keys(REMINDER_DEFAULTS);

const POLISH_FIXED_HOLIDAYS = [
  "01-01", // Nowy Rok
  "01-06", // Trzech Kroli
  "05-01", // Swieto Pracy
  "05-03", // Swieto Konstytucji
  "08-15", // Wniebowziecie NMP
  "11-01", // Wszystkich Swietych
  "11-11", // Swieto Niepodleglosci
  "12-25",
  "12-26"
];

export function iso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function fromIso(value) {
  const [y, m, d] = String(value).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Meeus/Jones/Butcher — Wielkanoc w kalendarzu gregorianskim.
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

const holidayCache = new Map();

export function polishHolidays(year) {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const days = new Set([
    ...POLISH_FIXED_HOLIDAYS.map((md) => `${year}-${md}`),
    iso(addDays(easter, 1)),  // Poniedzialek Wielkanocny
    iso(addDays(easter, 49)), // Zielone Swiatki
    iso(addDays(easter, 60))  // Boze Cialo
  ]);

  holidayCache.set(year, days);
  return days;
}

export function normalizeWeeklyHours(value, dailyTargetHours = 8) {
  const fallback = [0, dailyTargetHours, dailyTargetHours, dailyTargetHours, dailyTargetHours, dailyTargetHours, 0];
  if (!Array.isArray(value) || value.length !== 7) return fallback;
  return value.map((hours, index) => {
    const number = Number(hours);
    return Number.isFinite(number) && number >= 0 && number <= 24 ? number : fallback[index];
  });
}

export function isWorkingDay(dateIso, { respectHolidays = true, weeklyHours = null, dailyTargetHours = 8 } = {}) {
  const date = fromIso(dateIso);
  if (!normalizeWeeklyHours(weeklyHours, dailyTargetHours)[date.getDay()]) return false;
  if (respectHolidays && polishHolidays(date.getFullYear()).has(dateIso)) return false;
  return true;
}

export function monthRange(year, monthIndex) {
  return {
    dateFrom: iso(new Date(year, monthIndex, 1)),
    dateTo: iso(new Date(year, monthIndex + 1, 0))
  };
}

export function datesBetween(dateFrom, dateTo) {
  const out = [];
  const end = fromIso(dateTo);
  for (let cursor = fromIso(dateFrom); cursor <= end; cursor = addDays(cursor, 1)) {
    out.push(iso(cursor));
  }
  return out;
}

export function workingDaysInMonth(year, monthIndex, options = {}) {
  const { dateFrom, dateTo } = monthRange(year, monthIndex);
  return datesBetween(dateFrom, dateTo).filter((day) => isWorkingDay(day, options));
}

export function lastWorkingDayOfMonth(year, monthIndex, options = {}) {
  const days = workingDaysInMonth(year, monthIndex, options);
  return days[days.length - 1] || null;
}

// Ostatni dzien roboczy miesiaca + `leadDays` wczesniejszych dni roboczych.
export function reminderDatesForMonth(year, monthIndex, { leadDays = 1, respectHolidays = true, weeklyHours = null } = {}) {
  const days = workingDaysInMonth(year, monthIndex, { respectHolidays, weeklyHours });
  const take = Math.min(days.length, Math.max(1, Number(leadDays) + 1));
  return days.slice(days.length - take);
}

export function describeReminderDay(dateIso, { respectHolidays = true, weeklyHours = null } = {}) {
  const date = fromIso(dateIso);
  const days = workingDaysInMonth(date.getFullYear(), date.getMonth(), { respectHolidays, weeklyHours });
  const index = days.indexOf(dateIso);
  const workingDaysLeft = index === -1 ? 0 : days.length - index;
  return { date: dateIso, workingDaysLeft, isLastWorkingDay: workingDaysLeft === 1 };
}

export function isReminderDay(dateIso, options = {}) {
  const date = fromIso(dateIso);
  return reminderDatesForMonth(date.getFullYear(), date.getMonth(), options).includes(dateIso);
}

export function nextReminderDay(from = new Date(), options = {}) {
  const today = iso(from);
  for (let offset = 0; offset <= 2; offset += 1) {
    const cursor = new Date(from.getFullYear(), from.getMonth() + offset, 1);
    const hit = reminderDatesForMonth(cursor.getFullYear(), cursor.getMonth(), options)
      .find((day) => day >= today);
    if (hit) return describeReminderDay(hit, options);
  }
  return null;
}

export function isoWeek(dateIso) {
  const date = fromIso(dateIso);
  // Czwartek biezacego tygodnia wyznacza rok i numer tygodnia wg ISO-8601.
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7) + 3);
  const jan4 = new Date(thursday.getFullYear(), 0, 4);
  const firstThursday = new Date(jan4.getFullYear(), 0, 4 - ((jan4.getDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday - firstThursday) / (7 * 86400000));
  return { year: thursday.getFullYear(), week };
}

export function groupDaysByWeek(days) {
  const weeks = new Map();

  for (const day of days) {
    const { year, week } = isoWeek(day.date);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    const current = weeks.get(key) || {
      key,
      year,
      week,
      days: [],
      loggedSeconds: 0,
      targetSeconds: 0
    };
    current.days.push(day);
    current.loggedSeconds += day.seconds;
    current.targetSeconds += day.targetSeconds;
    weeks.set(key, current);
  }

  return [...weeks.values()].map((entry) => ({
    ...entry,
    dateFrom: entry.days[0].date,
    dateTo: entry.days[entry.days.length - 1].date
  }));
}

/**
 * Porownuje zalogowany czas z celem dziennym dla dni roboczych w zakresie.
 * Dni przyszle (po `today`) nie sa liczone jako braki.
 */
export function analyzeCompletion({
  rows = [],
  dateFrom,
  dateTo,
  dailyTargetHours = REMINDER_DEFAULTS.dailyTargetHours,
  today = iso(new Date()),
  respectHolidays = true,
  vacationDates = [],
  weeklyHours = null
}) {
  const schedule = normalizeWeeklyHours(weeklyHours, dailyTargetHours);
  const dailyTargetSeconds = Math.round(Math.max(...schedule) * 3600);
  const rowsByDay = new Map();
  let loggedSeconds = 0;

  for (const row of rows) {
    loggedSeconds += Number(row.seconds || 0);
    if (!rowsByDay.has(row.date)) rowsByDay.set(row.date, []);
    rowsByDay.get(row.date).push(row);
  }

  const days = [];
  let expectedSeconds = 0;
  let countedDays = 0;
  let workingDays = 0;

  for (const day of datesBetween(dateFrom, dateTo)) {
    const isVacation = vacationDates.includes(day);
    const working = !isVacation && isWorkingDay(day, { respectHolidays, weeklyHours: schedule });
    const targetSeconds = working ? Math.round(schedule[fromIso(day).getDay()] * 3600) : 0;
    const entries = rowsByDay.get(day) || [];
    const seconds = entries.reduce((sum, row) => sum + Number(row.seconds || 0), 0);
    if (working) workingDays += 1;

    const counted = working && day <= today;
    if (counted) {
      countedDays += 1;
      expectedSeconds += targetSeconds;
    }

    days.push({
      date: day,
      isWorkingDay: working,
      isVacation,
      isHoliday: polishHolidays(fromIso(day).getFullYear()).has(day),
      counted,
      entries,
      seconds,
      targetSeconds,
      missingSeconds: counted ? Math.max(0, targetSeconds - seconds) : 0
    });
  }

  const missingDays = days.filter((day) => day.missingSeconds > 0);

  return {
    dateFrom,
    dateTo,
    dailyTargetSeconds,
    workingDays,
    countedDays,
    loggedSeconds,
    expectedSeconds,
    // Saldo calego zakresu: nadgodziny z jednego dnia moga pokryc brak z innego.
    missingSeconds: Math.max(0, expectedSeconds - loggedSeconds),
    balanceSeconds: loggedSeconds - expectedSeconds,
    // Suma brakow liczona dzien po dniu - to jest podstawa przypomnien.
    dailyGapSeconds: missingDays.reduce((sum, day) => sum + day.missingSeconds, 0),
    days,
    missingDays
  };
}

export async function loadReminderSettings() {
  const data = await chrome.storage.sync.get(REMINDER_KEYS);
  const settings = { ...REMINDER_DEFAULTS };
  for (const key of REMINDER_KEYS) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== "") settings[key] = data[key];
  }
  settings.vacationDates = Array.isArray(settings.vacationDates)
    ? settings.vacationDates.filter((date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    : [];
  settings.reminderEnabled = Boolean(settings.reminderEnabled);
  settings.reminderRespectHolidays = Boolean(settings.reminderRespectHolidays);
  settings.reminderHour = Math.min(23, Math.max(0, Math.round(Number(settings.reminderHour)) || 0));
  settings.reminderLeadDays = Math.min(10, Math.max(0, Math.round(Number(settings.reminderLeadDays)) || 0));
  const target = Number(settings.dailyTargetHours);
  settings.dailyTargetHours = Number.isFinite(target) && target > 0 ? Math.min(24, target) : REMINDER_DEFAULTS.dailyTargetHours;
  settings.weeklyHours = normalizeWeeklyHours(settings.weeklyHours, settings.dailyTargetHours);
  return settings;
}

export async function saveReminderSettings(patch) {
  const next = {};
  for (const key of REMINDER_KEYS) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  await chrome.storage.sync.set(next);
  return next;
}

export function isReminderSettingKey(key) {
  return REMINDER_KEYS.includes(key);
}
