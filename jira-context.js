import { enrichCommitDiffs } from './bitbucket-context.js';
import { fetchJiraDevelopment } from './jira-development.js';
import { basicAuthHeader, extractComment } from './api.js';
import { iso } from './reminders.js';

const cache = new Map();
const trim = (value, limit) => String(value || '').slice(0, limit);
const dayOf = value => { const date = new Date(value); return Number.isFinite(date.getTime()) ? iso(date) : ''; };

export async function fetchTicketContext({baseUrl,email,token,issueKey,signal,force=false}) {
  const bb=await globalThis.chrome?.storage?.local?.get('bitbucketSettings');
  const bbRevision=bb?.bitbucketSettings?.revision || '';
  const identity = `${new URL(baseUrl).origin}:${email}:${issueKey}:${bbRevision}`;
  const saved = cache.get(identity);
  if(!force && saved && Date.now()-saved.at < 5*60*1000)return saved.data;
  const headers = {Accept:'application/json',Authorization:basicAuthHeader(email,token)};
  const get = async (path,params={}) => {
    const url = new URL(`${baseUrl.replace(/\/$/,'')}/rest/api/3/issue/${encodeURIComponent(issueKey)}${path}`);
    Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
    const response=await fetch(url,{headers,signal});
    if(!response.ok)throw Error(`Kontekst ${issueKey}: HTTP ${response.status}`);
    return response.json();
  };
  // Limit very large histories explicitly; never claim that omitted events did not happen.
  const latest = async (path,field) => {
    const first = await get(path,{startAt:0,maxResults:100});
    const total=Number(first.total || 0);
    if(total<=100)return {items:first[field]||[],limited:false};
    const items=[];
    for(let startAt=Math.max(0,total-200);startAt<total;) {
      const page=await get(path,{startAt,maxResults:100});
      const batch=page[field]||[];items.push(...batch);
      if(!batch.length)break;
      startAt+=batch.length;
    }
    return {items,limited:total>200};
  };
  const issue=await get('',{fields:'summary,description,updated,status,subtasks,parent,issuelinks'});
  const settled=await Promise.allSettled([latest('/comment','comments'),latest('/changelog','values'),fetchJiraDevelopment({baseUrl,email,token,issueId:issue.id,signal})]);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const comments=settled[0].status==='fulfilled'?settled[0].value:{items:[],limited:true};
  const history=settled[1].status==='fulfilled'?settled[1].value:{items:[],limited:true};
  const data={key:issueKey,title:trim(issue.fields?.summary,400),status:issue.fields?.status?.name||'',description:trim(extractComment(issue.fields?.description),3500),updated:issue.fields?.updated,
    related:[issue.fields?.parent?.key,...(issue.fields?.subtasks||[]).map(item=>item.key),...(issue.fields?.issuelinks||[]).map(link=>(link.inwardIssue||link.outwardIssue)?.key)].filter(Boolean).slice(0,15),
    comments:comments.items.map(item=>({day:dayOf(item.created),editedDay:dayOf(item.updated),authorId:item.author?.accountId,text:trim(extractComment(item.body),1500)})),
    changes:history.items.map(item=>({day:dayOf(item.created),authorId:item.author?.accountId,items:(item.items||[]).filter(change=>['status','assignee','summary','description','resolution'].includes(change.field)).map(change=>({field:change.field,from:trim(change.fromString,250),to:trim(change.toString,250)}))})),
    development:settled[2].status==='fulfilled'?settled[2].value:{events:[],unavailable:true},
    limited:comments.limited||history.limited};
  data.development=await enrichCommitDiffs(data.development,signal);
  if(cache.size>=150)cache.delete(cache.keys().next().value);
  cache.set(identity,{at:Date.now(),data});
  return data;
}

export function contextForDay(context,date,myAccountId) {
  return {ticket:context.key,title:context.title,description:context.description,descriptionIsCurrentNotHistorical:true,related:context.related,
    comments:context.comments.filter(item=>item.day===date||item.editedDay===date).slice(-15).map(item=>({text:item.text,own:!!myAccountId && item.authorId===myAccountId,createdDay:item.day,editedDay:item.editedDay})),
    changes:context.changes.filter(item=>item.day===date && item.items.length).slice(-20).map(item=>({own:!!myAccountId && item.authorId===myAccountId,items:item.items})),
    development:(context.development?.events||[]).filter(item=>item.day===date).slice(-15).map(({authorId,...item})=>({...item,own:item.verifiedOwn===true || (!!myAccountId && authorId===myAccountId)})),
    diffStatus:context.development?.diffStatus || 'Analiza kodu: nie sprawdzono',
    developmentUnavailable:context.development?.unavailable ?? true,
    limited:context.limited};
}
