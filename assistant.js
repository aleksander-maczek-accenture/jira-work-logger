import { iso, fromIso, monthRange, analyzeCompletion } from './reminders.js';

// Read-only advice: today's unfinished target is separate from overdue work.
export function assistantReport(summary, today = iso(new Date()), options = {}) {
  if (!summary) return null;
  const first = fromIso(summary.dateFrom);
  const range = monthRange(first.getFullYear(), first.getMonth());
  const monthKey = range.dateFrom.slice(0, 7);
  const fullMonth = analyzeCompletion({dateFrom: range.dateFrom, dateTo: range.dateTo,
    dailyTargetHours: options.dailyTargetHours ?? summary.dailyTargetSeconds / 3600,
    weeklyHours: options.weeklyHours,
    vacationDates: options.vacationDates || [], respectHolidays: options.respectHolidays ?? true});
  const customHours = options.monthlyTargets?.[monthKey];
  const monthlyTargetSeconds = Number.isFinite(customHours) && customHours >= 0
    ? Math.round(customHours * 3600)
    : fullMonth.days.reduce((sum, day) => sum + day.targetSeconds, 0);
  const loggedSeconds = summary.days.filter(day => day.date.startsWith(monthKey)).reduce((sum, day) => sum + day.seconds, 0);
  const monthComplete = summary.dateFrom <= range.dateFrom && summary.dateTo >= range.dateTo;
  const overdue = summary.missingDays.filter(day => day.date < today);
  const current = summary.days.find(day => day.date === today);
  const completed = summary.days.filter(day => day.counted && day.seconds >= day.targetSeconds);
  const empty = overdue.filter(day => day.seconds === 0);
  const longDays = summary.days.filter(day => day.seconds > 12 * 3600);
  return {
    monthKey, monthRange: range, monthComplete, monthlyTargetSeconds,
    monthlyLoggedSeconds: loggedSeconds,
    monthlyMissingSeconds: Math.max(0, monthlyTargetSeconds - loggedSeconds),
    monthlyBalanceSeconds: loggedSeconds - monthlyTargetSeconds,
    customMonthlyTarget: Number.isFinite(customHours) && customHours >= 0,
    overdue,
    overdueSeconds: overdue.reduce((sum, day) => sum + day.missingSeconds, 0),
    current,
    completed: completed.length,
    empty,
    longDays,
    vacations: summary.days.filter(day => day.isVacation).length,
    includesToday: Boolean(current),
    futureOnly: summary.dateFrom > today
  };
}
