import { addWorklog, fetchIssuePreview, fetchMyIssueWorklogs, parseHHMM } from './api.js';
import { iso, monthRange } from './reminders.js';

const actions = new Set(['jira-panel:load', 'jira-panel:add', 'jira-panel:open']);
const writes = new Set();

export function registerJiraPageService() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!actions.has(message?.type)) return undefined;
    handleJiraPageMessage(message, sender).then(sendResponse).catch(error => {
      console.warn('Jira panel request failed', error);
      sendResponse({ok:false,error:error.userMessage || 'Nie udalo sie polaczyc z Jira. Sprawdz ustawienia i uprawnienia, a potem sprobuj ponownie.'});
    });
    return true;
  });
}

function reject(message) { const error = new Error(message); error.userMessage = message; throw error; }

export async function handleJiraPageMessage(message, sender) {
  const source = new URL(sender.url || 'https://invalid.local');
  if (!sender.tab || source.protocol !== 'https:' || !source.hostname.endsWith('.atlassian.net')) reject('Panel jest dostepny tylko na stronie Jira.');
  if (message.type === 'jira-panel:open') {
    await chrome.tabs.create({url:chrome.runtime.getURL('page.html')});
    return {ok:true};
  }
  const credentials = await chrome.storage.sync.get(['baseUrl','email','token']);
  if (!credentials.baseUrl || !credentials.email || !credentials.token) reject('Uzupelnij polaczenie w ustawieniach rozszerzenia.');
  const configured = new URL(credentials.baseUrl);
  if (configured.origin !== source.origin || configured.protocol !== 'https:') reject('Ta Jira ma inny adres niz zapisany w ustawieniach rozszerzenia.');
  const issueKey = String(message.issueKey || '').toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*-\d+$/.test(issueKey)) reject('Nieprawidlowy klucz ticketu.');
  const params = {...credentials,issueKey};
  if (message.type === 'jira-panel:load') {
    const now = new Date();
    const range = monthRange(now.getFullYear(), now.getMonth());
    const [issue,rows] = await Promise.all([fetchIssuePreview(params),fetchMyIssueWorklogs(params)]);
    const monthRows = rows.filter(row=>row.date>=range.dateFrom && row.date<=range.dateTo);
    return {ok:true,issue,today:iso(now),range,
      todaySeconds:rows.filter(row=>row.date===iso(now)).reduce((sum,row)=>sum+row.seconds,0),
      monthSeconds:monthRows.reduce((sum,row)=>sum+row.seconds,0),
      monthCount:monthRows.length,
      recent:rows.sort((a,b)=>b.started.localeCompare(a.started)).slice(0,8)};
  }
  if (message.type !== 'jira-panel:add') reject('Nieznana operacja.');
  const date = String(message.date || '');
  const parsed = new Date(`${date}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || iso(parsed)!==date) reject('Podaj poprawna date.');
  let seconds;
  try { seconds=parseHHMM(message.timeHHMM); } catch { reject('Podaj czas w formacie HH:MM.'); }
  if (!(seconds>0)) reject('Czas musi byc wiekszy od zera.');
  const key=`${source.origin}:${issueKey}`;
  if(writes.has(key)) reject('Worklog jest juz zapisywany.');
  writes.add(key);
  try {
    const issue = await fetchIssuePreview(params);
    if(String(issue.status).toLowerCase()==='done') reject('Ten ticket ma status DONE.');
    await addWorklog({...params,date,timeHHMM:message.timeHHMM,comment:String(message.comment || '')});
    await chrome.storage.local.set({jiraPageLastChange:{at:Date.now(),issueKey,date}});
    return {ok:true};
  } finally { writes.delete(key); }
}
