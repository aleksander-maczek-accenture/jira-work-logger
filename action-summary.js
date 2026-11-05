import { formatDateRange } from './date-range.js';
import { fmtHHMM } from './api.js';
import { analyzeCompletion } from './reminders.js';

export function actionSummaryTitle(result, savedAt, settings) {
  if (!result || !Array.isArray(result.rows)) {
    return 'Jira Worklogs\nBrak pobranych danych. Otworz rozszerzenie i pobierz worklogi.';
  }
  const { dateFrom, dateTo, project } = result.params || {};
  const lines = ['Jira Worklogs'];
  if (dateFrom && dateTo) lines.push(formatDateRange({dateFrom,dateTo}));
  if (project) lines.push(`Projekty: ${project}`);
  const seconds = result.rows.reduce((sum, row) => sum + Number(row.seconds || 0), 0);
  lines.push(`Zalogowano: ${fmtHHMM(seconds)} | Wpisy: ${result.rows.length}`);
  if (dateFrom && dateTo && dateFrom <= dateTo) {
    const summary = analyzeCompletion({
      rows: result.rows, dateFrom, dateTo,
      dailyTargetHours: settings.dailyTargetHours,
    weeklyHours: settings.weeklyHours,
      respectHolidays: settings.reminderRespectHolidays,
      vacationDates: settings.vacationDates
    });
    lines.push(`Braki dzienne: ${fmtHHMM(summary.dailyGapSeconds)} | Dni z brakami: ${summary.missingDays.length}`);
  }
  if (savedAt) lines.push(`Pobrano: ${new Date(savedAt).toLocaleString('pl-PL')}`);
  return lines.join('\n');
}
