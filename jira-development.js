import { basicAuthHeader } from './api.js';
import { iso } from './reminders.js';

const text = (value, max=600) => String(value || '').slice(0,max);
const day = value => {const date=new Date(value);return value && Number.isFinite(date.getTime())?iso(date):'';};
// Jira's development panel uses an internal endpoint; failure must not block worklogs.
export async function fetchJiraDevelopment({baseUrl,email,token,issueId,signal}) {
  if(!issueId)return {events:[],unavailable:true};
  const events=[];let unavailable=false;
  const headers={Accept:'application/json',Authorization:basicAuthHeader(email,token)};
  for(const dataType of ['repository','pullrequest']) {
    const url=new URL('/rest/dev-status/latest/issue/detail',baseUrl);
    url.search=new URLSearchParams({issueId,applicationType:'bitbucket',dataType});
    try {
      const response=await fetch(url,{headers,signal});
      if(!response.ok)throw Error('Development unavailable');
      const result=await response.json();
      if(result.errors?.length)unavailable=true;
      for(const detail of result.detail || []) {
        for(const repo of detail.repositories || [])for(const commit of repo.commits || []) {
          events.push({type:'commit',url:text(commit.url,1000),id:text(commit.id,80),title:text(commit.message),day:day(commit.authorTimestamp || commit.timestamp || commit.date),authorId:commit.author?.accountId || '',author:text(commit.author?.name,100)});
        }
        for(const pr of detail.pullRequests || []) {
          const common={id:text(pr.id,80),title:text(pr.name || pr.title),status:text(pr.status,40),authorId:pr.author?.accountId || '',author:text(pr.author?.name,100)};
          // lastUpdate is not evidence that a PR was merged on that date.
          events.push({...common,type:'pull-request-created',day:day(pr.createdDate || pr.createdOn || pr.created)});
          if(pr.mergedDate || pr.mergedOn)events.push({...common,type:'pull-request-merged',day:day(pr.mergedDate || pr.mergedOn),authorId:'',author:''});
        }
      }
    }catch(error){if(signal?.aborted)throw error;unavailable=true;}
  }
  return {events:events.filter(event=>event.day).slice(-100),unavailable};
}
