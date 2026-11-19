import fs from 'node:fs';
import assert from 'node:assert/strict';
const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
const { fetchAssignedIssues } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const epic = { key: 'ABC-1', fields: { summary: 'Platforma', issuetype: { hierarchyLevel: 1 } } };
let parentRequests = 0;
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname;
  if (path.endsWith('/search/jql')) return { ok: true, json: async () => ({ isLast: true, issues: [
    { key: 'ABC-2', fields: { summary: 'Story', parent: epic, issuetype: { subtask: false } } },
    { key: 'ABC-3', fields: { parent: { key: 'ABC-2' }, issuetype: { subtask: true } } },
    { key: 'ABC-4', fields: { issuetype: { subtask: false } } }
  ] }) };
  parentRequests++;
  return { ok: true, json: async () => ({ fields: { parent: epic } }) };
};
const issues = await fetchAssignedIssues({ baseUrl: 'https://jira.example', email: 'a', token: 'b' });
assert.deepEqual(issues.map(issue => issue.epic), [{ key: 'ABC-1', summary: 'Platforma' }, { key: 'ABC-1', summary: 'Platforma' }, null]);
assert.equal(parentRequests, 1);
console.log('OK: epics for issues, subtasks and issues without an epic.');
