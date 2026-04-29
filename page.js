import { fetchWorklogsRange, fmtHHMM, parseHHMM, updateWorklog } from "./api.js";

const $ = (id) => document.getElementById(id);

const state = {
  rows: [],
  selected: null,
  bartki: {
    enabled: true,
    count: 4
  }
};

const BARTKI_MIN = 1;
const BARTKI_MAX = 24;

function setStatus(s) { $("status").textContent = s; }

function clampNumber(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function renderTable(rows) {
  const tbody = $("tbody");
  tbody.innerHTML = "";
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.issueKey)}</td>
      <td style="text-align:center">${escapeHtml(r.timeHHMM)}</td>
      <td>${escapeHtml(r.summary)}</td>
      <td>${escapeHtml(r.comment)}</td>
      <td><button data-edit="1">Edytuj</button></td>
    `;
    tr.querySelector("button[data-edit]").addEventListener("click", () => openEdit(r));
    tbody.appendChild(tr);
  }
}

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

async function saveSettings() {
  await chrome.storage.sync.set({
    baseUrl: $("baseUrl").value.trim(),
    email: $("email").value.trim(),
    token: $("token").value,          // uwaga: Basic Auth → wrażliwe
    dateFrom: $("dateFrom").value,
    dateTo: $("dateTo").value,
    project: $("project").value.trim()
  });
}

async function saveBartkiSettings() {
  await chrome.storage.sync.set({
    bartkiEnabled: state.bartki.enabled,
    bartkiCount: state.bartki.count
  });
}

async function loadSettings() {
  const data = await chrome.storage.sync.get([
    "baseUrl",
    "email",
    "token",
    "dateFrom",
    "dateTo",
    "project",
    "bartkiEnabled",
    "bartkiCount"
  ]);
  if (data.baseUrl) $("baseUrl").value = data.baseUrl;
  if (data.email) $("email").value = data.email;
  if (data.token) $("token").value = data.token;
  if (data.project) $("project").value = data.project;

  // domyślne daty jak w Pythonie
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = today.getMonth();
  const day = today.getDate();

  let defFrom, defTo;
  if (day <= 8) {
    const firstThis = new Date(yyyy, mm, 1);
    const lastPrev = new Date(firstThis.getTime() - 86400000);
    const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
    defFrom = iso(firstPrev);
    defTo = iso(lastPrev);
  } else {
    defFrom = iso(new Date(yyyy, mm, 1));
    defTo = iso(today);
  }

  $("dateFrom").value = data.dateFrom || defFrom;
  $("dateTo").value = data.dateTo || defTo;

  state.bartki.enabled = data.bartkiEnabled ?? true;
  state.bartki.count = clampNumber(data.bartkiCount ?? 4, BARTKI_MIN, BARTKI_MAX);
  $("bartkiEnabled").checked = state.bartki.enabled;
  $("bartkiCount").value = state.bartki.count;
}

function renderBartki() {
  const layer = $("bartkiLayer");
  layer.innerHTML = "";
  layer.classList.toggle("isHidden", !state.bartki.enabled);

  if (!state.bartki.enabled) return;

  for (let i = 0; i < state.bartki.count; i += 1) {
    const fly = document.createElement("span");
    fly.className = "bartHeadFly";
    fly.style.setProperty("--size", `${Math.round(48 + Math.random() * 30)}px`);
    fly.style.setProperty("--opacity", (0.12 + Math.random() * 0.12).toFixed(2));
    fly.style.setProperty("--x-start", `${Math.round(Math.random() * 92)}vw`);
    fly.style.setProperty("--y-start", `${Math.round(Math.random() * 88)}vh`);
    fly.style.setProperty("--x-mid", `${Math.round(Math.random() * 92)}vw`);
    fly.style.setProperty("--y-mid", `${Math.round(Math.random() * 88)}vh`);
    fly.style.setProperty("--x-end", `${Math.round(Math.random() * 92)}vw`);
    fly.style.setProperty("--y-end", `${Math.round(Math.random() * 88)}vh`);
    fly.style.setProperty("--duration", `${Math.round(18 + Math.random() * 18)}s`);
    fly.style.setProperty("--delay", `${Math.round(Math.random() * -28)}s`);

    const head = document.createElement("img");
    head.className = "bartHead";
    head.src = "assets/bart-head.png";
    head.alt = "";
    head.style.setProperty("--spin", `${Math.round(7 + Math.random() * 8)}s`);
    head.style.setProperty("--spin-direction", Math.random() > 0.5 ? "normal" : "reverse");

    fly.appendChild(head);
    layer.appendChild(fly);
  }
}

async function updateBartkiSettings({ enabled = state.bartki.enabled, count = state.bartki.count } = {}) {
  state.bartki.enabled = Boolean(enabled);
  state.bartki.count = clampNumber(count, BARTKI_MIN, BARTKI_MAX);
  $("bartkiEnabled").checked = state.bartki.enabled;
  $("bartkiCount").value = state.bartki.count;
  renderBartki();
  await saveBartkiSettings();
}

function validate() {
  const baseUrl = $("baseUrl").value.trim();
  const email = $("email").value.trim();
  const token = $("token").value.trim();
  const dateFrom = $("dateFrom").value;
  const dateTo = $("dateTo").value;
  const project = $("project").value.trim() || null;

  if (!baseUrl || !email || !token) throw new Error("Uzupełnij Base URL, Email i API Token.");
  if (!dateFrom || !dateTo) throw new Error("Uzupełnij daty.");
  if (dateFrom > dateTo) throw new Error("Date from nie może być później niż Date to.");

  return { baseUrl, email, token, dateFrom, dateTo, project };
}

async function saveLastResult(payload) {
  await chrome.storage.local.set({
    lastResult: payload,
    lastResultSavedAt: Date.now()
  });
}

async function loadLastResult() {
  return chrome.storage.local.get(["lastResult","lastResultSavedAt"]);
}

async function restoreLastResultIfAny() {
  const { lastResult, lastResultSavedAt } = await loadLastResult();
  if (lastResult?.rows?.length) {
    state.rows = lastResult.rows;
    $("user").textContent = lastResult.displayName || "-";
    $("total").textContent = lastResult.totalHHMM || "00:00";
    renderTable(lastResult.rows);
    const when = lastResultSavedAt ? new Date(lastResultSavedAt).toLocaleString() : "";
    setStatus(`Wczytano ostatni wynik. ${when}`);
  }
}

async function onFetch({ force = true } = {}) {
  try {
    const params = validate();
    await saveSettings();

    if (force) {
      setStatus("Pobieram…");
      $("user").textContent = "-";
      $("total").textContent = "00:00";
      renderTable([]);
    } else {
      setStatus("Odświeżam…");
    }

    const { displayName, rows, totalSeconds } = await fetchWorklogsRange(params);
    state.rows = rows;

    $("user").textContent = displayName;
    $("total").textContent = fmtHHMM(totalSeconds);
    renderTable(rows);
    setStatus(`Gotowe. Rekordów: ${rows.length}`);

    // nie zapisuj tokenu w wyniku
    await saveLastResult({
      displayName,
      totalHHMM: fmtHHMM(totalSeconds),
      totalSeconds,
      rows,
      params: { baseUrl: params.baseUrl, email: params.email, dateFrom: params.dateFrom, dateTo: params.dateTo, project: params.project }
    });

  } catch (e) {
    console.error(e);
    setStatus("Błąd.");
    alert(String(e?.message || e));
  }
}

function openEdit(row) {
  state.selected = row;
  $("editInfo").textContent =
    `Issue: ${row.issueKey}\nData: ${row.date}\nObecny czas: ${row.timeHHMM}\n`;
  $("newTime").value = row.timeHHMM;
  $("editDlg").showModal();
  $("newTime").focus();
  $("newTime").select();
}

async function onSaveEdit(e) {
  e.preventDefault();
  try {
    const row = state.selected;
    if (!row) return;

    const params = validate();
    const newSeconds = parseHHMM($("newTime").value);
    if (newSeconds === row.seconds) {
      $("editDlg").close();
      return;
    }

    setStatus("Zapisuję zmianę…");
    await updateWorklog({
      baseUrl: params.baseUrl,
      email: params.email,
      token: params.token,
      issueKey: row.issueKey,
      worklogId: row.worklogId,
      started: row.started,
      newSeconds
    });

    $("editDlg").close();
    await onFetch({ force: false });
    alert(`Worklog zaktualizowany: ${row.timeHHMM} → ${fmtHHMM(newSeconds)}`);
  } catch (err) {
    console.error(err);
    alert(String(err?.message || err));
  }
}

$("fetchBtn").addEventListener("click", () => onFetch({ force: true }));
$("refreshBtn").addEventListener("click", () => onFetch({ force: false }));
$("saveBtn").addEventListener("click", onSaveEdit);
$("bartkiEnabled").addEventListener("change", (event) => {
  void updateBartkiSettings({ enabled: event.target.checked });
});
$("bartkiCount").addEventListener("change", (event) => {
  void updateBartkiSettings({ count: event.target.value });
});
$("bartkiMoreBtn").addEventListener("click", () => {
  void updateBartkiSettings({ count: state.bartki.count + 1 });
});

// start
await loadSettings();
renderBartki();
await restoreLastResultIfAny();
