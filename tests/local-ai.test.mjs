import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const urls=new Map();
function moduleURL(file){
  if(urls.has(file))return urls.get(file);
  let source=fs.readFileSync(path.join(root,file),'utf8');
  source=source.replace(/from (['"])(\.\/[^'"]+)\1/g,(_,quote,relative)=>'from '+JSON.stringify(moduleURL(path.posix.join(path.posix.dirname(file),relative))));
  const url='data:text/javascript;base64,'+Buffer.from(source).toString('base64');urls.set(file,url);return url;
}
const ai=await import(moduleURL('local-ai.js'));
const context=await import(moduleURL('jira-context.js'));
assert.equal(ai.localEndpoint('http://localhost:11434/'),'http://localhost:11434');
for(const bad of ['https://external.test','http://192.168.1.2','http://user:pass@localhost:11434','http://localhost:11434/api'])assert.throws(()=>ai.localEndpoint(bad));
assert.notEqual(await ai.fingerprint({time:3600}),await ai.fingerprint({time:7200}));
globalThis.fetch=async()=>({ok:true,json:async()=>({models:[
 {name:'qwen3.5:9b',size:6600000000,capabilities:['completion'],details:{parameter_size:'9B'}},
 {name:'qwen3.5:4b',size:3300000000},
 {name:'qwen3.5:4b',size:3300000000},
 {name:'embedding',capabilities:['embedding']},
 {name:'remote:cloud',remote_host:'https://cloud.example'}
]})});
const installed=await ai.listInstalledModels('http://127.0.0.1:11434');
assert.deepEqual(installed.map(item=>item.name),['qwen3.5:4b','qwen3.5:9b']);
assert.equal(installed[1].size,6600000000);
let modelCalls=0,commentStarts=[];
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input);
 if(url.pathname==='/api/tags')return {ok:true,json:async()=>({models:[{name:'qwen3:8b'}]})};
 if(url.pathname==='/api/chat'){
  modelCalls++;
  const body=JSON.parse(options.body);
  assert.equal(body.stream,false);assert.equal(body.think,false);
  assert.ok(!body.messages[1].content.includes('private note'));
  return {ok:true,json:async()=>({message:{content:JSON.stringify({bullets:['Analizowano logi TEST-1.','Sprawdzono blad TEST-1.']})},done:true})};
 }
 if(url.pathname.endsWith('/myself'))return {ok:true,json:async()=>({accountId:'me'})};
 if(url.pathname.endsWith('/comment')){
  const start=Number(url.searchParams.get('startAt')||0);commentStarts.push(start);
  return {ok:true,json:async()=>({total:350,comments:Array.from({length:100},(_,i)=>({created:'2026-11-03T12:00:00+0100',updated:'2026-11-03T12:00:00+0100',author:{accountId:i%2?'other':'me'},body:`Komentarz ${start+i}`}))})};
 }
 if(url.pathname.endsWith('/changelog'))return {ok:true,json:async()=>({total:1,values:[{created:'2026-11-03T13:00:00+0100',author:{accountId:'other'},items:[{field:'status',fromString:'Open',toString:'Done'}]}]})};
 return {ok:true,json:async()=>({fields:{summary:'Analiza',description:'Aktualny opis zadania',updated:'2026-11-03',subtasks:[]}})};
};
const c=await context.fetchTicketContext({baseUrl:'https://example.atlassian.net',email:'test',token:'test',issueKey:'TEST-1'});
assert.deepEqual(commentStarts,[0,150,250]);assert.equal(c.limited,true);
const daily=context.contextForDay(c,'2026-11-03','me');
assert.ok(daily.comments.some(item=>item.own));assert.equal(daily.changes[0].own,false);
assert.equal(context.contextForDay(c,'2026-11-02','me').comments.length,0);
assert.equal(daily.descriptionIsCurrentNotHistorical,true);
assert.ok(!JSON.stringify(daily).includes('authorId'));
const payload=ai.localSummaryPayload('2026-11-03',[{date:'2026-11-03',issueKey:'TEST-1',seconds:5400}],[]);
assert.equal(payload.total,'01:30');
assert.match(await ai.generateLocalSummary(ai.LOCAL_AI_DEFAULTS,payload),/Analizowano logi/);
const elements=new Map();
function element(id){if(!elements.has(id))elements.set(id,{value:'',checked:false,disabled:false,textContent:'',children:[],replaceChildren(){this.children=[]},append(child){this.children.push(child)},handlers:{},addEventListener(type,callback){this.handlers[type]=callback},close(){}});return elements.get(id);}
const events={};
globalThis.document={getElementById:element,createElement:()=>({value:'',textContent:''})};
globalThis.window={addEventListener:(name,callback)=>events[name]=callback};
const state={hasData:true,rows:[{date:'2026-11-03',issueKey:'TEST-1',seconds:3600,started:'2026-11-03T09:00:00+0100',summary:'Analiza'}],fetchedRange:{dateFrom:'2026-11-01',dateTo:'2026-11-30'},localAISummaries:{}};
element('baseUrl').value='https://example.atlassian.net';element('email').value='test';element('token').value='test';
let storage={localAISettings:{...ai.LOCAL_AI_DEFAULTS},localAISummaries:{}};
globalThis.chrome={runtime:{id:'test-extension'},storage:{local:{get:async()=>structuredClone(storage),set:async patch=>{storage={...storage,...structuredClone(patch)}}}}};
const controller=ai.installLocalAI({getState:()=>state,isFetching:()=>false,renderDays(){},showNotice:message=>{throw Error(message)}});
await controller.load();
const waitFor=async test=>{for(let i=0;i<100;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error(element('localAIStatus').textContent);};
const before=modelCalls;
controller.schedule();await waitFor(()=>Object.keys(storage.localAISummaries).length===1);
assert.equal(modelCalls,before+1);
const key=ai.daySummaryKey(ai.aiScope('https://example.atlassian.net','test'),'2026-11-03');
controller.schedule();await new Promise(resolve=>setTimeout(resolve,500));assert.equal(modelCalls,before+1,'unchanged input must use cache');
state.rows[0].seconds=7200;controller.schedule();await new Promise(resolve=>setTimeout(resolve,500));assert.equal(modelCalls,before+1,'changed worklogs must not regenerate saved summary automatically');
storage.localAISummaries[key].manual=true;storage.localAISummaries[key].text='Moja wersja';state.localAISummaries=structuredClone(storage.localAISummaries);
state.rows[0].seconds=10800;controller.schedule();await new Promise(resolve=>setTimeout(resolve,500));assert.equal(modelCalls,before+1,'manual summaries must be preserved');
assert.equal(storage.localAISummaries[key].text,'Moja wersja');
storage.localAISummaries[key].manual=false;state.localAISummaries=structuredClone(storage.localAISummaries);state.rows=[];
controller.schedule();await waitFor(()=>!storage.localAISummaries[key]);
state.rows=[{date:'2026-11-03',issueKey:'TEST-1',seconds:3600,started:'2026-11-03T09:00:00+0100',summary:'Analiza'}];
controller.schedule();await waitFor(()=>!!storage.localAISummaries[key]);
await new Promise(resolve=>setTimeout(resolve,50));
const callsBeforeForce=modelCalls;
const oldText=storage.localAISummaries[key].text;
await controller.regenerate('2026-11-03');
await controller.regenerate('2026-11-03');
assert.equal(storage.localAISummaries[key].text,oldText,'old summary must remain while regeneration is pending');
await waitFor(()=>modelCalls>callsBeforeForce);
assert.equal(modelCalls,callsBeforeForce+1,'explicit regeneration bypasses fingerprint cache');
await new Promise(resolve=>setTimeout(resolve,50));
events.pagehide();
console.log('OK: localhost validation, daily evidence, paginated history, Ollama output, automatic generation, on-demand regeneration, manual protection and deleted worklogs.');

const summaryStatus=ai.developmentSummary([
 {development:[{type:'commit',id:'a',own:true,diff:'change'},{type:'commit',id:'b',own:false}],diffStatus:'Analiza kodu Bitbucket: pobrane zmiany w 6 wlasnych commitach · ograniczony zakres'},
 {development:[{type:'commit',id:'a',own:true,diff:'change'}],diffStatus:'Analiza kodu Bitbucket: pobrane zmiany w 0 wlasnych commitach'}
]);
assert.match(summaryStatus.developmentStatus,/1 Twoich commitow/);
assert.match(summaryStatus.diffStatus,/zmiany z 1 Twoich commitow/);
assert.match(summaryStatus.diffStatus,/przycieta/);
assert.ok(!summaryStatus.diffStatus.includes('6 wlasnych'));
