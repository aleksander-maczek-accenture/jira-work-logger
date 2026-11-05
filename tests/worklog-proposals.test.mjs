import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),cache=new Map();
function url(file){if(cache.has(file))return cache.get(file);let text=fs.readFileSync(path.join(root,file),'utf8');text=text.replace(/from (['"])(\.\/[^'"]+)\1/g,(_,quote,relative)=>'from '+JSON.stringify(url(path.posix.join(path.posix.dirname(file),relative))));const result='data:text/javascript;base64,'+Buffer.from(text).toString('base64');cache.set(file,result);return result;}
const {proposalCandidates,proposalEvidence,generateWorklogProposals}=await import(url('worklog-proposals.js'));
const state={rows:[{issueKey:'TEST-1',date:'2026-11-03',seconds:3600,comment:'Analiza'}],pinnedIssues:[{issueKey:'TEST-2'}],myIssues:[{issueKey:'TEST-3',updated:'2026-11-02'}]};
assert.equal(proposalCandidates(state,'2026-11-03')[0].issueKey,'TEST-1');
const context={key:'TEST-2',title:'Zadanie',description:'Opis nie jest dowodem',comments:[{day:'2026-11-03',editedDay:'2026-11-03',authorId:'other',text:'Cudza praca'}],changes:[],related:[]};
assert.equal(proposalEvidence(context,'2026-11-03','me',state.rows),null);
context.comments.push({day:'2026-11-03',editedDay:'2026-11-03',authorId:'me',text:'Odtworzono blad'});
const evidence=proposalEvidence(context,'2026-11-03','me',state.rows);
assert.equal(evidence.comments.length,1);assert.equal(evidence.comments[0],'Odtworzono blad');
assert.equal(proposalEvidence(context,'2026-11-02','me',state.rows),null);
const devContext={...context,comments:[],development:{events:[
  {type:'commit',day:'2026-11-03',authorId:'other',title:'Cudzy commit'},
  {type:'commit',day:'2026-11-02',authorId:'me',title:'Inny dzien'},
  {type:'commit',day:'2026-11-03',authorId:'me',title:'Walidacja formularza'}
]}};
const devEvidence=proposalEvidence(devContext,'2026-11-03','me',[]);
assert.equal(devEvidence.development.length,1);
assert.equal(devEvidence.development[0].title,'Walidacja formularza');
assert.equal(proposalEvidence(devContext,'2026-11-04','me',[]),null);
const {fetchJiraDevelopment}=await import(url('jira-development.js'));
globalThis.fetch=async()=>({ok:false,status:403});
assert.equal((await fetchJiraDevelopment({baseUrl:'https://test.atlassian.net',email:'test',token:'test',issueId:'123'})).unavailable,true);
let posted;
globalThis.fetch=async(_,options)=>{posted=JSON.parse(options.body);return {ok:true,json:async()=>({message:{content:JSON.stringify({proposals:[{ticket:'FAKE-99',comment:'Zmyslony'},{ticket:'TEST-2',comment:'Analiza odtworzonego bledu.'},{ticket:'TEST-2',comment:'Duplikat'}]})},done_reason:'stop'})};};
const proposals=await generateWorklogProposals({endpoint:'http://127.0.0.1:11434',model:'test'},'2026-11-03',[evidence]);
assert.equal(proposals.length,1);assert.equal(proposals[0].ticket,'TEST-2');
assert.equal(posted.tools,undefined);assert.equal(posted.stream,false);
assert.ok(!JSON.stringify(posted).includes('Cudza praca'));
console.log('OK: ranking ticketow, wlasna datowana aktywnosc, brak dowodow, odrzucenie wymyslonych ticketow i duplikatow.');
