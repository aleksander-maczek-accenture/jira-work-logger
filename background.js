import { registerRovoHandoff } from "./rovo-handoff-service.js";
import { registerJiraPageService } from "./jira-page-service.js";
import { actionSummaryTitle } from "./action-summary.js";
// Service worker: pilnuje, zeby na koniec miesiaca worklogi byly uzupelnione.
import { fetchWorklogsRange, fmtHHMM } from "./api.js";
import {
  analyzeCompletion,
  describeReminderDay,
  iso,
  isReminderDay,
  isReminderSettingKey,
  loadReminderSettings,
  monthRange,
  nextReminderDay
} from "./reminders.js";

const TICK_ALARM = "worklogReminderTick";
const SNOOZE_ALARM = "worklogReminderSnooze";
const NOTIFICATION_ID = "worklogReminder";
const TICK_MINUTES = 30;
const SNOOZE_MINUTES = 60;
const PAGE = "page.html";

function ensureTickAlarm() {
  chrome.alarms.create(TICK_ALARM, { delayInMinutes: 1, periodInMinutes: TICK_MINUTES });
}

function monthName(date) {
  return date.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
}

async function openWorklogPage() {
  const url = chrome.runtime.getURL(PAGE);
  const [existing] = await chrome.tabs.query({ url });
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true });
    return;
  }
  await chrome.tabs.create({ url });
}

async function buildStatus(settings, now) {
  const { dateFrom, dateTo } = monthRange(now.getFullYear(), now.getMonth());
  const creds = await chrome.storage.sync.get(["baseUrl", "email", "token", "project"]);

  if (!creds.baseUrl || !creds.email || !creds.token) {
    return { configured: false, dateFrom, dateTo };
  }

  const { rows, totalSeconds } = await fetchWorklogsRange({
    baseUrl: creds.baseUrl,
    email: creds.email,
    token: creds.token,
    dateFrom,
    dateTo,
    project: creds.project || null
  });

  const summary = analyzeCompletion({
    rows,
    dateFrom,
    dateTo,
    dailyTargetHours: settings.dailyTargetHours,
    weeklyHours: settings.weeklyHours,
    today: iso(now),
    respectHolidays: settings.reminderRespectHolidays,
    vacationDates: settings.vacationDates
  });

  return {
    configured: true,
    dateFrom,
    dateTo,
    totalSeconds,
    missingSeconds: summary.missingSeconds,
    dailyGapSeconds: summary.dailyGapSeconds,
    expectedSeconds: summary.expectedSeconds,
    loggedSeconds: summary.loggedSeconds,
    missingDays: summary.missingDays.map((day) => ({ date: day.date, missingSeconds: day.missingSeconds }))
  };
}

function buildNotification(status, dayInfo, now) {
  const title = dayInfo.isLastWorkingDay
    ? "Ostatni dzien roboczy miesiaca!"
    : `Koniec miesiaca: zostaly ${dayInfo.workingDaysLeft} dni robocze`;

  let message;
  if (!status) {
    message = `Sprawdz, czy worklogi za ${monthName(now)} sa uzupelnione.`;
  } else if (!status.configured) {
    message = "Uzupelnij Base URL, email i token w rozszerzeniu, zeby policzyc braki.";
  } else if (status.dailyGapSeconds > 0) {
    const days = status.missingDays.length;
    const dayLabel = days === 1 ? "1 dniu" : `${days} dniach`;
    message =
      `${monthName(now)}: brakuje ${fmtHHMM(status.dailyGapSeconds)} w ${dayLabel}. ` +
      `Zalogowane ${fmtHHMM(status.loggedSeconds)} z ${fmtHHMM(status.expectedSeconds)}.`;
  } else {
    message = `Wszystko uzupelnione: ${fmtHHMM(status.loggedSeconds)} za ${monthName(now)}.`;
  }

  return {
    type: "basic",
    iconUrl: chrome.runtime.getURL("assets/bart-head.png"),
    title,
    message,
    priority: 2,
    requireInteraction: true,
    buttons: [{ title: "Otworz worklogi" }, { title: "Przypomnij za godzine" }]
  };
}

async function notify(status, dayInfo, now) {
  await chrome.notifications.clear(NOTIFICATION_ID);
  await chrome.notifications.create(NOTIFICATION_ID, buildNotification(status, dayInfo, now));
}

/**
 * @param force pomija sprawdzanie dnia/godziny (test z UI)
 * @param ignoreHour pomija tylko okno godzinowe (snooze)
 */
export async function runReminderCheck({ force = false, ignoreHour = false } = {}) {
  const settings = await loadReminderSettings();
  const now = new Date();
  const today = iso(now);
  const options = { leadDays: settings.reminderLeadDays, respectHolidays: settings.reminderRespectHolidays, weeklyHours: settings.weeklyHours };

  if (!force) {
    if (!settings.reminderEnabled) return { skipped: "disabled" };
    if (!isReminderDay(today, options)) return { skipped: "not-a-reminder-day" };
    if (!ignoreHour && now.getHours() < settings.reminderHour) return { skipped: "too-early" };
    const { reminderNotifiedFor } = await chrome.storage.local.get("reminderNotifiedFor");
    if (reminderNotifiedFor === today) return { skipped: "already-notified" };
  }

  let status = null;
  let error = null;
  try {
    status = await buildStatus(settings, now);
  } catch (e) {
    console.warn("Nie udalo sie sprawdzic worklogow", e);
    error = String(e?.message || e);
  }

  const dayInfo = isReminderDay(today, options)
    ? describeReminderDay(today, options)
    : nextReminderDay(now, options) || { date: today, workingDaysLeft: 0, isLastWorkingDay: false };

  const nothingMissing = status?.configured && status.dailyGapSeconds <= 0;

  // Przy automatycznym sprawdzeniu nie zawracamy glowy, jesli wszystko jest uzupelnione.
  if (!force && nothingMissing) {
    await chrome.storage.local.set({
      reminderNotifiedFor: today,
      reminderLastCheck: { at: Date.now(), today, status, error, notified: false }
    });
    return { notified: false, status };
  }

  await notify(status, dayInfo, now);
  await chrome.storage.local.set({
    reminderNotifiedFor: today,
    reminderLastCheck: { at: Date.now(), today, status, error, notified: true }
  });
  return { notified: true, status, error };
}

chrome.runtime.onInstalled.addListener(() => {
  ensureTickAlarm();
  void runReminderCheck();
});

chrome.runtime.onStartup.addListener(() => {
  ensureTickAlarm();
  void runReminderCheck();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) void runReminderCheck();
  if (alarm.name === SNOOZE_ALARM) void runReminderCheck({ ignoreHour: true });
});

chrome.notifications.onClicked.addListener((id) => {
  if (id !== NOTIFICATION_ID) return;
  void chrome.notifications.clear(id);
  void openWorklogPage();
});

chrome.notifications.onButtonClicked.addListener(async (id, buttonIndex) => {
  if (id !== NOTIFICATION_ID) return;
  await chrome.notifications.clear(id);

  if (buttonIndex === 0) {
    await openWorklogPage();
    return;
  }

  // Snooze: zapomnij, ze dzis bylo powiadomienie i sprawdz ponownie za godzine.
  await chrome.storage.local.remove("reminderNotifiedFor");
  chrome.alarms.create(SNOOZE_ALARM, { delayInMinutes: SNOOZE_MINUTES });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (!Object.keys(changes).some(isReminderSettingKey)) return;
  ensureTickAlarm();
  void chrome.storage.local.remove("reminderNotifiedFor");
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "reminder:check") return undefined;

  runReminderCheck({ force: Boolean(message.force), ignoreHour: true })
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: String(error?.message || error) }));
  return true; // odpowiedz asynchroniczna
});

ensureTickAlarm();

// Tooltip uses cached worklogs; hovering never triggers a Jira request.
let titleUpdate = Promise.resolve();
function refreshActionTitle() {
  titleUpdate = titleUpdate.catch(() => {}).then(async () => {
    const [{ lastResult, lastResultSavedAt }, settings] = await Promise.all([
      chrome.storage.local.get(["lastResult", "lastResultSavedAt"]),
      loadReminderSettings()
    ]);
    await chrome.action.setTitle({ title: actionSummaryTitle(lastResult, lastResultSavedAt, settings) });
  });
  return titleUpdate.catch((error) => console.warn("Nie udalo sie odswiezyc podpowiedzi", error));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "local" && (changes.lastResult || changes.lastResultSavedAt)) ||
      (area === "sync" && Object.keys(changes).some(isReminderSettingKey))) {
    void refreshActionTitle();
  }
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TICK_ALARM) void refreshActionTitle();
});
void refreshActionTitle();

registerJiraPageService();

registerRovoHandoff();
