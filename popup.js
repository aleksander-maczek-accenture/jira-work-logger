import { actionSummaryTitle } from "./action-summary.js";
import { loadReminderSettings, isReminderSettingKey } from "./reminders.js";

async function renderLastSummary() {
  const host = document.getElementById("lastSummary");
  try {
    const [{ lastResult, lastResultSavedAt }, settings] = await Promise.all([
      chrome.storage.local.get(["lastResult", "lastResultSavedAt"]),
      loadReminderSettings()
    ]);
    const title = document.createElement("h2");
    title.textContent = "Ostatnio pobrane dane";
    const lines = actionSummaryTitle(lastResult, lastResultSavedAt, settings).split("\n").slice(1);
    const paragraphs = lines.flatMap((line) => line.split(" | ")).map((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      return paragraph;
    });
    host.replaceChildren(title, ...paragraphs);
  } catch (error) {
    host.textContent = "Nie udalo sie wczytac ostatniego wyniku. Otworz karte rozszerzenia.";
    console.warn(error);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "local" && (changes.lastResult || changes.lastResultSavedAt)) ||
      (area === "sync" && Object.keys(changes).some(isReminderSettingKey))) {
    void renderLastSummary();
  }
});
void renderLastSummary();

document.getElementById("openBtn").addEventListener("click", async () => {
  const url = chrome.runtime.getURL("page.html");
  await chrome.tabs.create({ url });
});
