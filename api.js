export function basicAuthHeader(email, token) {
  const bytes = new TextEncoder().encode(`${email}:${token}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

// Shared limit across worklogs and activity scans; identical in-flight GETs are reused.
const pendingGets = new Map();
const getQueue = [];
let activeGets = 0;

async function limitedGet(job) {
  if (activeGets >= 6) await new Promise((resolve) => getQueue.push(resolve));
  else activeGets += 1;
  try {
    return await job();
  } finally {
    const next = getQueue.shift();
    if (next) next();
    else activeGets -= 1;
  }
}

async function mapConcurrent(items, visit) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => {
    while (cursor < items.length) await visit(items[cursor++]);
  }));
}

async function jiraGet(baseUrl, headers, path, params) {
  const url = new URL(baseUrl.replace(/\/$/, "") + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const key = `${headers.Authorization} ${url}`;
  if (pendingGets.has(key)) return pendingGets.get(key);
  const pending = limitedGet(async () => {
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}: ${await r.text()}`);
    return r.json();
  });
  pendingGets.set(key, pending);
  try {
    return await pending;
  } finally {
    pendingGets.delete(key);
  }
}

async function* searchPages(baseUrl, headers, params) {
  let startAt = 0;
  let nextPageToken;
  const seenTokens = new Set();
  while (true) {
    const data = await jiraGet(baseUrl, headers, "/rest/api/3/search/jql", {
      ...params,
      maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : { startAt })
    });
    const batch = data.issues || [];
    yield batch;
    if (data.isLast === true) return;
    if (data.nextPageToken) {
      if (seenTokens.has(data.nextPageToken)) throw new Error("Jira zwrocila powtorzony znacznik strony.");
      nextPageToken = data.nextPageToken;
      seenTokens.add(nextPageToken);
    } else if (typeof data.total === "number" && batch.length && startAt + batch.length < data.total) {
      startAt += batch.length;
      nextPageToken = undefined;
    } else return;
  }
}

function epicFromParent(parent) {
  const type = parent?.fields?.issuetype;
  if (!parent?.key || !(type?.hierarchyLevel === 1 || type?.name?.toLowerCase() === "epic")) return null;
  return { key: parent.key, summary: parent.fields?.summary || "" };
}

async function resolveEpics(issues, baseUrl, headers) {
  const parents = new Map();
  await mapConcurrent(issues, async (issue) => {
    const parent = issue.fields?.parent;
    issue.epic = epicFromParent(parent);
    if (!issue.epic && issue.fields?.issuetype?.subtask && parent?.key) {
      if (!parents.has(parent.key)) {
        parents.set(parent.key, jiraGet(baseUrl, headers, `/rest/api/3/issue/${encodeURIComponent(parent.key)}`, { fields: "parent" })
          .then((result) => epicFromParent(result.fields?.parent)).catch(() => null));
      }
      issue.epic = await parents.get(parent.key);
    }
  });
}

async function jiraPut(baseUrl, headers, path, payload) {
  const url = baseUrl.replace(/\/$/, "") + path;
  const r = await fetch(url, { method: "PUT", headers, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}: ${await r.text()}`);
  const txt = await r.text();
  return txt.trim() ? JSON.parse(txt) : {};
}

async function jiraPost(baseUrl, headers, path, payload) {
  const url = baseUrl.replace(/\/$/, "") + path;
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}: ${await r.text()}`);
  const txt = await r.text();
  return txt.trim() ? JSON.parse(txt) : {};
}

function commentDocument(text) {
  const lines = String(text || "").trim().split(/\r?\n/);
  return {
    type: "doc",
    version: 1,
    content: lines.map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : []
    }))
  };
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

export function projectFilterClause(project) {
  const projects = [...new Set(String(project || "").trim().toUpperCase().split(/[,;\s]+/).filter(Boolean))];
  if (!projects.length) return "";
  if (projects.some((key) => !/^[A-Z0-9_]+$/.test(key))) {
    throw new Error("Podaj klucze projektow oddzielone przecinkami, np. ABC, DEF.");
  }
  return `project IN (${projects.map((key) => `"${key}"`).join(", ")}) AND `;
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
  jql = projectFilterClause(project) + jql;

  const issues = [];
  for await (const batch of searchPages(baseUrl, headers, { jql, fields: "summary,parent,issuetype" })) {
    issues.push(...batch);
  }

  await resolveEpics(issues, baseUrl, headers);
  const rows = [];
  let totalSeconds = 0;

  await mapConcurrent(issues, async (issue) => {
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
          epic: issue.epic,
          issueType: issue.fields?.issuetype?.name || "",
          comment: extractComment(wl.comment),
          started,
          seconds,
          worklogId: String(wl.id)
        });
      }

      wlStart += batch.length;
      if (wlStart >= (wlData.total || 0) || batch.length === 0) break;
    }
  });

  rows.sort((a, b) =>
    a.date.localeCompare(b.date) ||
    a.issueKey.localeCompare(b.issueKey) ||
    a.started.localeCompare(b.started)
  );

  return { displayName, rows, totalSeconds };
}

export async function fetchAssignedIssues({ baseUrl, email, token }) {
  const headers = { Accept: "application/json", Authorization: basicAuthHeader(email, token) };
  const issues = [];
  for await (const batch of searchPages(baseUrl, headers, {
    jql: 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC',
    fields: "summary,status,parent,issuetype"
  })) {
    issues.push(...batch);
  }
  await resolveEpics(issues, baseUrl, headers);
  return issues.map(issue => ({ issueKey: issue.key, summary: issue.fields?.summary || "", status: issue.fields?.status?.name || "", epic: issue.epic, issueType: issue.fields?.issuetype?.name || "" }));
}

export async function fetchMyIssues({ baseUrl, email, token, dateFrom, dateTo, project }) {
  const headers = {
    "Accept": "application/json",
    "Authorization": basicAuthHeader(email, token),
    "Content-Type": "application/json"
  };

  const me = await jiraGet(baseUrl, headers, "/rest/api/3/myself");
  const myAccountId = me.accountId;
  const projectClause = projectFilterClause(project);
  const baseJql =
    `${projectClause}updated >= "${dateFrom}" AND updated <= "${dateTo}" AND `;
  const jql =
    `${baseJql}(` +
    `assignee = currentUser() OR assignee was currentUser() OR ` +
    `(worklogAuthor = currentUser() AND worklogDate >= "${dateFrom}" AND worklogDate <= "${dateTo}")` +
    `) ORDER BY updated DESC`;
  const fallbackJql =
    `${baseJql}(` +
    `assignee = currentUser() OR ` +
    `(worklogAuthor = currentUser() AND worklogDate >= "${dateFrom}" AND worklogDate <= "${dateTo}")` +
    `) ORDER BY updated DESC`;
  const activityJql =
    `${projectClause}updated >= "${dateFrom}" AND updated <= "${dateTo}" ORDER BY updated DESC`;

  const issuesByKey = new Map();
  const addIssue = (issue, source) => {
    const issueKey = issue.key || issue.issueKey;
    if (!issueKey) return;
    const fields = issue.fields || {};
    const current = issuesByKey.get(issueKey) || {
      issueKey,
      summary: fields.summary || issue.summary || "",
      status: fields.status?.name || issue.status || "",
      assignee: fields.assignee?.displayName || issue.assignee || "",
      updated: fields.updated || issue.updated || "",
      epic: issue.epic || null,
      issueType: fields.issuetype?.name || issue.issueType || "",
      sources: new Set()
    };
    if (!current.epic) current.epic = issue.epic || null;
    if (!current.issueType) current.issueType = fields.issuetype?.name || issue.issueType || "";
    if (!current.summary) current.summary = fields.summary || issue.summary || "";
    if (!current.status) current.status = fields.status?.name || issue.status || "";
    if (!current.assignee) current.assignee = fields.assignee?.displayName || issue.assignee || "";
    if (!current.updated) current.updated = fields.updated || issue.updated || "";
    current.sources.add(source);
    issuesByKey.set(issueKey, current);
  };

  const collectIssues = async (query, source) => {
    for await (const batch of searchPages(baseUrl, headers, {
      jql: query, fields: "summary,status,assignee,updated,parent,issuetype"
    })) {
      await resolveEpics(batch, baseUrl, headers);
      batch.forEach((issue) => addIssue(issue, source));
    }
  };

  try {
    await collectIssues(jql, "Przypisany / worklog");
  } catch (error) {
    issuesByKey.clear();
    await collectIssues(fallbackJql, "Przypisany / worklog");
  }

  const isMineInRange = (item) => {
    const when = String(item.created || item.updated || "").slice(0, 10);
    return item.author?.accountId === myAccountId && when >= dateFrom && when <= dateTo;
  };

  const collectPaged = async (path, key) => {
    const out = [];
    let pageStart = 0;
    while (true) {
      const data = await jiraGet(baseUrl, headers, path, {
        startAt: pageStart,
        maxResults: 100
      });
      const batch = data[key] || data.values || [];
      out.push(...batch);
      pageStart += batch.length;
      if (pageStart >= (data.total || 0) || batch.length === 0) break;
    }
    return out;
  };

  try {
    for await (const batch of searchPages(baseUrl, headers, {
      jql: activityJql,
      fields: "summary,status,assignee,updated,comment,parent,issuetype",
      expand: "changelog"
    })) {
      await resolveEpics(batch, baseUrl, headers);
      await mapConcurrent(batch, async (issue) => {
        try {
          const commentPage = issue.fields?.comment;
          let comments = commentPage?.comments || [];
          if (!comments.some(isMineInRange) && (commentPage?.total || 0) > comments.length) {
            comments = await collectPaged(
              `/rest/api/3/issue/${encodeURIComponent(issue.key)}/comment`,
              "comments"
            );
          }
          if (comments.some(isMineInRange)) addIssue(issue, "Komentarz");

          let histories = issue.changelog?.histories || [];
          if (!histories.some(isMineInRange) && (issue.changelog?.total || 0) > histories.length) {
            histories = await collectPaged(
              `/rest/api/3/issue/${encodeURIComponent(issue.key)}/changelog`,
              "values"
            );
          }
          if (histories.some(isMineInRange)) addIssue(issue, "Historia");
        } catch (error) {
          console.warn(`Nie udalo sie sprawdzic aktywnosci dla ${issue.key}`, error);
        }
      });
    }
  } catch (error) {
    console.warn("Nie udalo sie pobrac aktywnosci z historii ticketow.", error);
  }

  return [...issuesByKey.values()].map((issue) => ({
    ...issue,
    source: [...issue.sources].join(" + "),
    sources: undefined
  }));
}

export function worklogStartedOnDate(started, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Podaj poprawna date worklogu.");
  const time = String(started).match(/T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/)?.[1];
  if (!time) throw new Error("Brak godziny rozpoczecia wpisu. Pobierz worklogi ponownie.");
  const local = new Date(`${date}T${time}`);
  if (!Number.isFinite(local.getTime()) ||
      `${local.getFullYear()}-${String(local.getMonth()+1).padStart(2,"0")}-${String(local.getDate()).padStart(2,"0")}` !== date) {
    throw new Error("Podaj poprawna date worklogu.");
  }
  if (String(started).slice(0, 10) === date) return started;
  const offset = -local.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const absolute = Math.abs(offset);
  return `${date}T${time}${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}${String(absolute % 60).padStart(2, "0")}`;
}

export async function updateWorklog({ baseUrl, email, token, issueKey, worklogId, started, newSeconds, comment }) {
  const headers = {
    "Accept": "application/json",
    "Authorization": basicAuthHeader(email, token),
    "Content-Type": "application/json"
  };

  return jiraPut(
    baseUrl,
    headers,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
    { timeSpentSeconds: newSeconds, started, comment: commentDocument(comment) }
  );
}

function startedAt(date, hour = 9) {
  const offsetMinutes = -new Date(`${date}T00:00:00`).getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const offset = `${String(Math.floor(abs / 60)).padStart(2, "0")}${String(abs % 60).padStart(2, "0")}`;
  return `${date}T${String(hour).padStart(2, "0")}:00:00.000${sign}${offset}`;
}

export async function addWorklog({ baseUrl, email, token, issueKey, date, timeHHMM, comment }) {
  const headers = {
    "Accept": "application/json",
    "Authorization": basicAuthHeader(email, token),
    "Content-Type": "application/json"
  };
  const started = startedAt(date);

  return jiraPost(
    baseUrl,
    headers,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
    {
      started,
      timeSpentSeconds: parseHHMM(timeHHMM),
      comment: commentDocument(comment)
    }
  );
}

export async function fetchIssuePreview({ baseUrl, email, token, issueKey }) {
  const issue = await jiraGet(baseUrl, {
    Accept: "application/json",
    Authorization: basicAuthHeader(email, token)
  }, `/rest/api/3/issue/${encodeURIComponent(issueKey)}`, { fields: "summary,status,parent,issuetype" });
  await resolveEpics([issue], baseUrl, { Accept: "application/json", Authorization: basicAuthHeader(email, token) });
  return { issueKey: issue.key, summary: issue.fields?.summary || "", status: issue.fields?.status?.name || "", epic: issue.epic, issueType: issue.fields?.issuetype?.name || "" };
}

export async function deleteWorklog({ baseUrl, email, token, issueKey, worklogId }) {
  if (!issueKey || !worklogId) throw new Error("Brak identyfikatora worklogu.");
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`);
  url.searchParams.set('adjustEstimate', 'leave');
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', Authorization: basicAuthHeader(email, token) }
  });
  if (!response.ok) throw new Error(`Nie udalo sie usunac worklogu (HTTP ${response.status}). Sprawdz uprawnienia w Jira.`);
}

export async function fetchMyIssueWorklogs({baseUrl,email,token,issueKey}) {
  const headers={Accept:'application/json',Authorization:basicAuthHeader(email,token)};
  const me=await jiraGet(baseUrl,headers,'/rest/api/3/myself');
  const rows=[];
  let startAt=0;
  while(true) {
    const data=await jiraGet(baseUrl,headers,`/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,{startAt,maxResults:100});
    const batch=data.worklogs || [];
    for(const entry of batch) {
      if(entry.author?.accountId!==me.accountId || !entry.started) continue;
      rows.push({date:entry.started.slice(0,10),started:entry.started,seconds:Number(entry.timeSpentSeconds || 0),comment:extractComment(entry.comment)});
    }
    startAt+=batch.length;
    if(!batch.length || startAt>=Number(data.total || 0)) break;
  }
  return rows;
}
