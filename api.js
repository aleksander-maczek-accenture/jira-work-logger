export function basicAuthHeader(email, token) {
  const raw = `${email}:${token}`;
  const b64 = btoa(unescape(encodeURIComponent(raw)));
  return `Basic ${b64}`;
}

async function jiraGet(baseUrl, headers, path, params) {
  const url = new URL(baseUrl.replace(/\/$/, "") + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}: ${await r.text()}`);
  return r.json();
}

async function jiraPut(baseUrl, headers, path, payload) {
  const url = baseUrl.replace(/\/$/, "") + path;
  const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}: ${await r.text()}`);
  const txt = await r.text();
  return txt.trim() ? JSON.parse(txt) : {};
}

export function fmtHHMM(seconds) {
  const minutes = Math.floor(seconds / 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function parseHHMM(s) {
  s = (s || "").trim();
  const m = /^(\d+):([0-5]\d)$/.exec(s);
  if (!m) throw new Error("Podaj czas w formacie HH:MM, np. 06:30");
  const h = Number(m[1]), min = Number(m[2]);
  return h * 3600 + min * 60;
}

export function extractComment(commentField) {
  if (typeof commentField === "string") return commentField.trim();
  if (commentField && typeof commentField === "object") {
    const walk = (node) => {
      if (Array.isArray(node)) return node.map(walk).join("");
      if (node && typeof node === "object") {
        if (node.type === "text") return node.text || "";
        const content = node.content || [];
        return walk(content);
      }
      return "";
    };
    return walk(commentField).trim();
  }
  return "";
}

export async function fetchWorklogsRange({ baseUrl, email, token, dateFrom, dateTo, project }) {
  const headers = {
    "Accept": "application/json",
    "Authorization": basicAuthHeader(email, token),
    "Content-Type": "application/json"
  };

  const me = await jiraGet(baseUrl, headers, "/rest/api/3/myself");
  const myAccountId = me.accountId;
  const displayName = me.displayName || email;

  let jql = `worklogAuthor = currentUser() AND worklogDate >= "${dateFrom}" AND worklogDate <= "${dateTo}"`;
  if (project) jql = `project = ${project} AND ` + jql;

  // /search/jql pagination
  const issues = [];
  let startAt = 0;
  const maxResults = 100;
  while (true) {
    const data = await jiraGet(baseUrl, headers, "/rest/api/3/search/jql", {
      jql,
      startAt,
      maxResults,
      fields: "summary"
    });
    const batch = data.issues || [];
    issues.push(...batch);
    startAt += batch.length;
    if (startAt >= (data.total || 0) || batch.length === 0) break;
  }

  const rows = [];
  let totalSeconds = 0;

  for (const issue of issues) {
    const key = issue.key;
    const summary = issue.fields?.summary || "";

    // worklog pagination per issue
    let wlStart = 0;
    while (true) {
      const wlData = await jiraGet(baseUrl, headers, `/rest/api/3/issue/${encodeURIComponent(key)}/worklog`, {
        startAt: wlStart,
        maxResults: 100
      });
      const batch = wlData.worklogs || [];

      for (const wl of batch) {
        if (wl.author?.accountId !== myAccountId) continue;
        const started = wl.started;
        if (!started) continue;
        const startedDate = started.slice(0, 10);
        if (startedDate < dateFrom || startedDate > dateTo) continue;

        const seconds = Number(wl.timeSpentSeconds || 0);
        totalSeconds += seconds;

        rows.push({
          date: startedDate,
          issueKey: key,
          timeHHMM: fmtHHMM(seconds),
          summary,
          comment: extractComment(wl.comment),
          started,
          seconds,
          worklogId: String(wl.id)
        });
      }

      wlStart += batch.length;
      if (wlStart >= (wlData.total || 0) || batch.length === 0) break;
    }
  }

  rows.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.issueKey.localeCompare(b.issueKey) ||
    a.started.localeCompare(b.started)
  );

  return { displayName, rows, totalSeconds };
}

export async function updateWorklog({ baseUrl, email, token, issueKey, worklogId, started, newSeconds }) {
  const headers = {
    "Accept": "application/json",
    "Authorization": basicAuthHeader(email, token),
    "Content-Type": "application/json"
  };

  return jiraPut(
    baseUrl,
    headers,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
    { timeSpentSeconds: newSeconds, started }
  );
}