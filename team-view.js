import { fetchBoardPeople, searchTeamPeople, fetchTeamWorklogs, fmtHHMM } from './api.js';
import { analyzeCompletion, iso } from './reminders.js';

export function installTeamView({ getParams, getSchedule }) {
  const $ = id => document.getElementById(id);
  const boardId = '4009';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let people = [], rows = [], range = null, hasResults = false, searchResults = [], busy = false, revision = 0;
  function storageKey(p, board) { return `teamPeople:${p.baseUrl.trim().toLowerCase()}:${p.email.trim().toLowerCase()}:${board}`; }
  function hiddenKey(p) { return `${storageKey(p, boardId)}:hidden`; }
  function rosterKey(p) { return `${storageKey(p, boardId)}:roster`; }
  function cacheKey(p) { return `${storageKey(p, boardId)}:lastResult`; }
  function setBusy(value) {
    busy = value;
    for (const id of ['teamLoad','teamRefreshPeople','teamSearchUser','teamAddUser']) $(id).disabled = value;
  }
  function invalidate() { revision++; people = []; rows = []; range = null; hasResults = false; $('teamResults').replaceChildren(); }
  function params() { return getParams(); }
  function completedThrough() { const date = new Date(); date.setDate(date.getDate() - 1); return iso(date); }
  function showChart(person) {
    const days = person.summary.days;
    const width = Math.max(520, days.length * 45 + 48), height = 260, top = 20, bottom = 212;
    const maxSeconds = Math.max(3600, ...days.map(day => Math.max(day.seconds, day.targetSeconds)));
    const y = seconds => bottom - (seconds / maxSeconds) * (bottom - top);
    const slot = (width - 48) / Math.max(1, days.length);
    const bars = days.map((day, index) => {
      const x = 38 + index * slot, barWidth = Math.min(24, slot - 8);
      const targetY = y(day.targetSeconds), valueY = y(day.seconds);
      const title = `${day.date}: ${fmtHHMM(day.seconds)} / ${fmtHHMM(day.targetSeconds)}${day.date === iso(new Date()) ? ' · dzień trwa' : ''}`;
      return `<g><title>${escape(title)}</title>${day.targetSeconds ? `<rect class="teamChartTarget" x="${x}" y="${targetY}" width="${barWidth}" height="${bottom-targetY}" rx="3"/>` : ''}${day.seconds ? `<rect class="teamChartBar ${day.counted && day.seconds < day.targetSeconds ? 'isShort' : ''}" x="${x}" y="${valueY}" width="${barWidth}" height="${bottom-valueY}" rx="3"/>` : ''}<text x="${x + barWidth/2}" y="${bottom+18}" text-anchor="middle">${escape(day.date.slice(5))}</text></g>`;
    }).join('');
    const ticks = [0, 0.5, 1].map(fraction => { const position = bottom - fraction * (bottom-top); return `<line class="teamChartGrid" x1="34" x2="${width-5}" y1="${position}" y2="${position}"/><text x="29" y="${position+4}" text-anchor="end">${Math.round(maxSeconds*fraction/3600)}h</text>`; }).join('');
    $('teamChartTitle').textContent = `Czas · ${person.displayName}`;
    $('teamChartRange').textContent = `${range.dateFrom} – ${range.dateTo} · zalogowano ${fmtHHMM(person.summary.loggedSeconds)}`;
    $('teamChart').innerHTML = `<svg role="img" aria-label="Wykres czasu osoby ${escape(person.displayName)}. Szczegółowe wartości znajdują się w tabeli poniżej." viewBox="0 0 ${width} ${height}" style="min-width:${width}px">${ticks}${bars}</svg><details class="teamChartData"><summary>Dane wykresu</summary><table><thead><tr><th>Data</th><th>Zalogowano</th><th>Cel</th></tr></thead><tbody>${days.map(day => `<tr><td>${escape(day.date)}</td><td>${fmtHHMM(day.seconds)}</td><td>${fmtHHMM(day.targetSeconds)}</td></tr>`).join('')}</tbody></table></details>`;
    $('teamChartDlg').showModal();
  }
  $('teamChartClose').addEventListener('click', () => $('teamChartDlg').close());
  function render() {
    const host = $('teamResults'); host.replaceChildren();
    if (!range) return;
    const schedule = getSchedule();
    const summaries = people.map(person => {
      const userRows = rows.filter(row => row.accountId === person.accountId);
      const summary = analyzeCompletion({ rows: userRows, dateFrom: range.dateFrom, dateTo: range.dateTo, today: completedThrough(), dailyTargetHours: schedule.dailyTargetHours, weeklyHours: schedule.weeklyHours, respectHolidays: schedule.reminderRespectHolidays, vacationDates: [] });
      return { ...person, summary };
    }).sort((a, b) => (hasResults ? b.summary.dailyGapSeconds - a.summary.dailyGapSeconds : 0) || a.displayName.localeCompare(b.displayName, 'pl')); 
    if (!summaries.length) { host.textContent = 'Nie znaleziono osób. Możesz wyszukać i dodać je ręcznie.'; return; }
    for (const person of summaries) {
      const container = document.createElement('article'); container.className = 'teamPerson';
      const details = document.createElement('details'); details.className = 'teamPersonDetails';
      const gap = person.summary.dailyGapSeconds;
      const days = person.summary.days.filter(day => day.date <= iso(new Date())).slice().reverse();
      details.innerHTML = `<summary><span class="teamPersonName">${escape(person.displayName)}</span><span class="teamPersonStats">${hasResults ? `Zalogowano <strong>${fmtHHMM(person.summary.loggedSeconds)}</strong>` : ''}<span class="${!hasResults ? 'teamUnknown' : gap ? 'teamGap' : 'teamOk'}">${!hasResults ? 'Dane niepobrane' : gap ? `Brakuje ${fmtHHMM(gap)}` : person.summary.countedDays ? 'Bez braków' : 'Brak dni do oceny'}</span></span></summary><div class="teamPersonDays">${days.map(day => `<div class="teamDay"><div><strong>${escape(day.date)}</strong>${day.date === iso(new Date()) ? ' <span class="hint">Dziś · dzień trwa</span>' : ''}</div><div>${fmtHHMM(day.seconds)} / ${fmtHHMM(day.targetSeconds)}${day.counted && day.targetSeconds > day.seconds ? ` <span class="teamGap">brakuje ${fmtHHMM(day.targetSeconds-day.seconds)}</span>` : ''}</div>${day.entries.length ? `<ul>${day.entries.map(row => `<li><strong>${escape(row.issueKey)}</strong> · ${escape(row.summary)} <span>${fmtHHMM(row.seconds)}</span>${row.comment ? `<p>${escape(row.comment)}</p>` : ''}</li>`).join('')}</ul>` : '<small class="hint">Brak widocznych wpisów</small>'}</div>`).join('')}</div>`;
      if (!hasResults) details.querySelector('.teamPersonDays').innerHTML = '<p class="hint teamEmptyDay">Pobierz worklogi, aby zobaczyć szczegóły.</p>';
      const actions = document.createElement('div'); actions.className = 'teamPersonActions';
      const chart = document.createElement('button'); chart.type = 'button'; chart.className = 'secondaryBtn';
      chart.textContent = 'Pokaż wykres'; chart.setAttribute('aria-label', `Pokaż wykres: ${person.displayName}`);
      chart.disabled = !hasResults; chart.addEventListener('click', () => showChart(person)); actions.append(chart);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondaryBtn';
      remove.textContent = 'Usuń osobę z widoku'; remove.setAttribute('aria-label', `Usuń ${person.displayName} z widoku zespołu`);
      remove.addEventListener('click', async () => {
        if (busy) return;
        try {
          setBusy(true); remove.disabled = true;
          const p = params(), key = hiddenKey(p), roster = rosterKey(p), saved = await chrome.storage.local.get([key, roster]);
          const hidden = Array.isArray(saved[key]) ? saved[key] : [];
          if (!hidden.includes(person.accountId)) hidden.push(person.accountId);
          const savedRoster = Array.isArray(saved[roster]) ? saved[roster] : people;
          await chrome.storage.local.set({ [key]: hidden, [roster]: savedRoster.filter(item => item.accountId !== person.accountId) });
          people = people.filter(item => item.accountId !== person.accountId);
          rows = rows.filter(row => row.accountId !== person.accountId);
          $('teamStatus').textContent = `Usunięto ${person.displayName} z widoku. Możesz przywrócić tę osobę przez wyszukiwarkę.`;
          render();
        } catch (error) { $('teamStatus').textContent = `Nie udało się usunąć osoby: ${error?.message || error}`; remove.disabled = false; }
        finally { setBusy(false); }
      });
      actions.append(remove); container.append(details, actions); host.append(container);
    }
  }
  async function load(refreshPeople = false) {
    if (busy) return;
    try {
      const p = params(); setBusy(true); const current = ++revision;
      const key = storageKey(p, boardId), excludedKey = hiddenKey(p), roster = rosterKey(p);
      const stored = await chrome.storage.local.get([key, excludedKey, roster]);
      const hidden = new Set(Array.isArray(stored[excludedKey]) ? stored[excludedKey] : []);
      const savedRoster = Array.isArray(stored[roster]) ? stored[roster] : null;
      let candidates = [];
      if (!savedRoster || refreshPeople) {
        $('teamStatus').textContent = 'Pobieram osoby z boarda…';
        candidates = await fetchBoardPeople({ ...p, boardId });
      }
      const combined = new Map([...(savedRoster || []), ...candidates, ...(Array.isArray(stored[key]) ? stored[key] : [])].filter(person => !hidden.has(person.accountId)).map(person => [person.accountId, person]));
      if (!savedRoster || refreshPeople) await chrome.storage.local.set({ [roster]: [...combined.values()] });
      $('teamStatus').textContent = `Pobieram worklogi dla ${combined.size} osób…`;
      const fetched = await fetchTeamWorklogs({ ...p, people: [...combined.values()] });
      if (current !== revision) return;
      people = [...combined.values()]; rows = fetched; range = { dateFrom:p.dateFrom, dateTo:p.dateTo }; hasResults = true;
      await chrome.storage.local.set({ [cacheKey(p)]: { rows, range, savedAt: Date.now() } });
      $('teamStatus').textContent = `Okres ${p.dateFrom} – ${p.dateTo} · ${people.length} osób · ${rows.length} widocznych wpisów`;
      render();
    } catch (error) { $('teamStatus').textContent = `Nie udało się pobrać danych: ${error?.message || error}`; }
    finally { setBusy(false); }
  }
  $('teamLoad').addEventListener('click', () => void load());
  $('teamRefreshPeople').addEventListener('click', () => void load(true));
  $('teamSearchUser').addEventListener('click', async () => {
    const query = $('teamUserQuery').value.trim();
    if (query.length < 2) { $('teamStatus').textContent = 'Wpisz co najmniej dwa znaki, aby wyszukać osobę.'; return; }
    try {
      const p = params(); setBusy(true); $('teamStatus').textContent = 'Szukam osób…';
      searchResults = await searchTeamPeople({ ...p, query });
      const select = $('teamUserResults'); select.replaceChildren(new Option('Wybierz osobę', ''));
      searchResults.forEach((user, index) => select.add(new Option(user.displayName, String(index))));
      $('teamStatus').textContent = searchResults.length ? 'Wybierz osobę z wyników.' : 'Nie znaleziono osób.';
    } catch (error) { $('teamStatus').textContent = `Nie udało się wyszukać osób: ${error?.message || error}`; }
    finally { setBusy(false); }
  });
  $('teamAddUser').addEventListener('click', async () => {
    const selected = $('teamUserResults').value;
    if (selected === '' || !searchResults[Number(selected)]) { $('teamStatus').textContent = 'Wybierz osobę z wyników wyszukiwania.'; return; }
    try {
      const p = params(), key = storageKey(p, boardId), excludedKey = hiddenKey(p), roster = rosterKey(p);
      const stored = await chrome.storage.local.get([key, excludedKey, roster]);
      const person = searchResults[Number(selected)], list = Array.isArray(stored[key]) ? stored[key] : [];
      if (!list.some(item => item.accountId === person.accountId)) list.push(person);
      const hidden = Array.isArray(stored[excludedKey]) ? stored[excludedKey] : [];
      const savedRoster = Array.isArray(stored[roster]) ? stored[roster] : null;
      const update = { [key]: list, [excludedKey]: hidden.filter(id => id !== person.accountId) };
      if (savedRoster) update[roster] = [...new Map([...savedRoster, person].map(item => [item.accountId, item])).values()];
      await chrome.storage.local.set(update);
      void load();
    } catch (error) { $('teamStatus').textContent = `Nie udało się dodać osoby: ${error?.message || error}`; }
  });
  async function restore() {
    const current = ++revision;
    if (!['baseUrl', 'email', 'token', 'dateFrom', 'dateTo'].every(id => $(id).value.trim())) return;
    let p;
    try { p = params(); } catch { return; }
    try {
      const roster = rosterKey(p), cache = cacheKey(p);
      const stored = await chrome.storage.local.get([roster, cache]);
      if (current !== revision) return;
      const saved = stored[cache];
      people = Array.isArray(stored[roster]) ? stored[roster] : [];
      range = { dateFrom: p.dateFrom, dateTo: p.dateTo };
      hasResults = !!saved && saved.range?.dateFrom === p.dateFrom && saved.range?.dateTo === p.dateTo && Array.isArray(saved.rows);
      rows = hasResults ? saved.rows : [];
      $('teamStatus').textContent = hasResults
        ? `Zapisany wynik z ${new Date(saved.savedAt).toLocaleString('pl-PL')} · ${people.length} osób. Odśwież, aby sprawdzić aktualne wpisy.`
        : people.length ? `${people.length} zapisanych osób. Pobierz worklogi dla wybranego okresu.` : 'Kliknij „Sprawdź zespół”, aby pobrać osoby z boarda.';
      render();
    } catch (error) { $('teamStatus').textContent = `Nie udało się wczytać zespołu: ${error?.message || error}`; }
  }
  for (const id of ['dateFrom', 'dateTo', 'baseUrl', 'email', 'token']) $(id).addEventListener('change', () => { invalidate(); void restore(); });
  return { restore };
}
